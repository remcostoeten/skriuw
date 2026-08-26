use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::sync::SyncRuntime;
use crate::{
    ai::{LazyAiCompletion, LazyAiTranscription},
    ai_credentials::AiCredentialStore,
    maintenance::{BackupRotationHandle, MaintenanceCoordinator},
    ollama::OllamaManager,
};
use skriuw_history_git::GitHistoryMaterializer;
use skriuw_images::ImageStore;
use skriuw_runtime::{Completion, WorkspaceRuntime};
use tauri::{Manager, State};

pub(crate) struct AppState {
    pub(crate) ai: LazyAiCompletion,
    pub(crate) transcription: Arc<LazyAiTranscription>,
    pub(crate) ai_credentials: Arc<AiCredentialStore>,
    pub(crate) ollama: Arc<OllamaManager>,
    pub(crate) maintenance: Arc<MaintenanceCoordinator>,
    pub(crate) rotation: BackupRotationHandle,
    pub(crate) storage_path: PathBuf,
    pub(crate) history_reader: Arc<GitHistoryMaterializer>,
    pub(crate) image_store: Arc<ImageStore>,
    pub(crate) sync: Arc<SyncRuntime>,
}

pub(crate) fn image_blob_path(database_path: &Path) -> PathBuf {
    database_path
        .parent()
        .unwrap_or(database_path)
        .join("blobs")
}

pub(crate) fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

pub(crate) fn history_repository_path(database_path: &Path) -> PathBuf {
    database_path
        .parent()
        .unwrap_or(database_path)
        .join("history")
}

pub(crate) fn storage_pointer_file(data_dir: &Path) -> PathBuf {
    data_dir.join("storage-location")
}

pub(crate) fn read_storage_pointer(data_dir: &Path) -> Option<PathBuf> {
    let raw = fs::read_to_string(storage_pointer_file(data_dir)).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(PathBuf::from(trimmed))
    }
}

pub(crate) fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("SKRIUW_DB") {
        return Ok(PathBuf::from(path));
    }
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    if let Some(directory) = read_storage_pointer(&data_dir) {
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        return Ok(directory.join("skriuw.db"));
    }
    Ok(data_dir.join("skriuw.db"))
}

pub(crate) fn workspace_runtime(state: &State<'_, AppState>) -> Result<WorkspaceRuntime, String> {
    state
        .maintenance
        .runtime()
        .map_err(|error| error.to_string())
}

pub(crate) async fn wait_for<T: Send + 'static>(completion: Completion<T>) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        completion.wait().map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(crate) async fn run_maintenance<T: Send + 'static>(
    coordinator: Arc<MaintenanceCoordinator>,
    work: impl FnOnce(&MaintenanceCoordinator) -> Result<T, skriuw_storage::Diagnostic> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        work(&coordinator).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod storage_pointer_tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn resolves_pointer_only_when_present_and_non_empty() {
        let dir = tempdir().expect("tempdir");
        assert_eq!(read_storage_pointer(dir.path()), None);
        fs::write(storage_pointer_file(dir.path()), "  \n").expect("write blank pointer");
        assert_eq!(read_storage_pointer(dir.path()), None);
        fs::write(storage_pointer_file(dir.path()), "/moved/workspace\n").expect("write pointer");
        assert_eq!(
            read_storage_pointer(dir.path()),
            Some(PathBuf::from("/moved/workspace"))
        );
    }
}
