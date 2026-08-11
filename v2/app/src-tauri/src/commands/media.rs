use crate::commands::transfer::resolve_relative_path;
use crate::maintenance::MaintenanceCoordinator;
use crate::remote_media;
use crate::state::AppState;
use serde::Serialize;
use std::{collections::BTreeSet, fs, path::Path, sync::Arc, time::Duration};
use tauri::{
    State,
    ipc::{InvokeBody, Request, Response},
};

const MEDIA_SWEEP_MINIMUM_BLOB_AGE: Duration = Duration::from_secs(60);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredImagePayload {
    content_hash: String,
    mime_type: String,
    byte_size: u64,
}

#[tauri::command]
pub fn store_note_image(
    request: Request<'_>,
    state: State<'_, AppState>,
) -> Result<StoredImagePayload, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("image payload must be raw bytes".into());
    };
    let stored = state
        .image_store
        .put(bytes)
        .map_err(|error| error.to_string())?;
    Ok(StoredImagePayload {
        content_hash: stored.content_hash,
        mime_type: stored.mime_type.into(),
        byte_size: stored.byte_size,
    })
}

/// Absolute path of one stored blob, for streaming playback through the
/// asset protocol instead of copying the bytes over IPC.
#[tauri::command]
pub fn note_media_path(
    content_hash: String,
    mime_type: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let path = state
        .image_store
        .blob_path(&content_hash, &mime_type)
        .map_err(|error| error.to_string())?;
    if !path.exists() {
        return Err("blob is missing".into());
    }
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn read_note_image_blob(
    content_hash: String,
    mime_type: String,
    state: State<'_, AppState>,
) -> Result<Response, String> {
    state
        .image_store
        .read(&content_hash, &mime_type)
        .map(Response::new)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn import_markdown_image(
    source_dir: String,
    relative_path: String,
    state: State<'_, AppState>,
) -> Result<StoredImagePayload, String> {
    let image_store = Arc::clone(&state.image_store);
    tauri::async_runtime::spawn_blocking(move || {
        let path = resolve_relative_path(Path::new(&source_dir), &relative_path)?;
        let bytes = fs::read(&path).map_err(|error| format!("read {relative_path}: {error}"))?;
        let stored = image_store.put(&bytes).map_err(|error| error.to_string())?;
        Ok(StoredImagePayload {
            content_hash: stored.content_hash,
            mime_type: stored.mime_type.into(),
            byte_size: stored.byte_size,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Downloads a pasted image address and stores it as a workspace blob. The
/// bytes only become a blob once [`ImageStore::put`] recognises the format, so
/// a server that lies about its content type cannot smuggle in another file.
///
/// [`ImageStore::put`]: skriuw_images::ImageStore::put
#[tauri::command]
pub async fn download_remote_media(
    url: String,
    state: State<'_, AppState>,
) -> Result<StoredImagePayload, String> {
    let image_store = Arc::clone(&state.image_store);
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = remote_media::download(&url)?;
        let stored = image_store
            .put(&bytes)
            .map_err(|_| "That address is not a supported image.".to_string())?;
        Ok(StoredImagePayload {
            content_hash: stored.content_hash,
            mime_type: stored.mime_type.into(),
            byte_size: stored.byte_size,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

fn referenced_blob_hashes(
    maintenance: &MaintenanceCoordinator,
) -> Result<BTreeSet<String>, String> {
    let runtime = maintenance.runtime().map_err(|error| error.to_string())?;
    let completion = runtime.bootstrap().map_err(|error| error.to_string())?;
    let snapshot = completion.wait().map_err(|error| error.to_string())?;
    Ok(snapshot
        .images
        .iter()
        .map(|image| image.content_hash.clone())
        .collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaBlobPayload {
    content_hash: String,
    mime_type: String,
    byte_size: u64,
    modified_at_ms: u64,
}

#[tauri::command]
pub async fn list_media_blobs(state: State<'_, AppState>) -> Result<Vec<MediaBlobPayload>, String> {
    let image_store = Arc::clone(&state.image_store);
    tauri::async_runtime::spawn_blocking(move || {
        let entries = image_store.list().map_err(|error| error.to_string())?;
        Ok(entries
            .into_iter()
            .map(|entry| MediaBlobPayload {
                content_hash: entry.content_hash,
                mime_type: entry.mime_type.into(),
                byte_size: entry.byte_size,
                modified_at_ms: entry.modified_at_ms,
            })
            .collect())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn delete_media_blob(
    content_hash: String,
    mime_type: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let maintenance = Arc::clone(&state.maintenance);
    let image_store = Arc::clone(&state.image_store);
    tauri::async_runtime::spawn_blocking(move || {
        if referenced_blob_hashes(&maintenance)?.contains(&content_hash) {
            return Err("image is still used by a note".into());
        }
        image_store
            .delete(&content_hash, &mime_type)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn sweep_unused_media_blobs(state: State<'_, AppState>) -> Result<usize, String> {
    let maintenance = Arc::clone(&state.maintenance);
    let image_store = Arc::clone(&state.image_store);
    tauri::async_runtime::spawn_blocking(move || {
        let live = referenced_blob_hashes(&maintenance)?;
        image_store
            .sweep_unreferenced(&live, MEDIA_SWEEP_MINIMUM_BLOB_AGE)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}
