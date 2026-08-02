mod maintenance;

use std::{
    collections::BTreeSet,
    env, fs,
    io::{self, Read},
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use maintenance::{
    ArchiveImportReport, BackupRotationHandle, BackupRotationReport, DatabaseSwapReport,
    MaintenanceCoordinator, RecoveryInventoryReport, spawn_backup_rotation,
};
use serde::{Deserialize, Serialize};
use skriuw_domain::{
    HistoryHeader, OperationAck, SearchHit, WorkspaceOperationEnvelope, WorkspaceSnapshot,
};
use skriuw_history::HistoryReader;
use skriuw_history_git::GitHistoryMaterializer;
use skriuw_images::ImageStore;
use skriuw_runtime::{Completion, WorkspaceRuntime};
use tauri::{
    Emitter, Manager, RunEvent, State,
    ipc::{InvokeBody, Request, Response},
};
use tauri_plugin_dialog::DialogExt;

struct AppState {
    maintenance: Arc<MaintenanceCoordinator>,
    rotation: BackupRotationHandle,
    storage_path: PathBuf,
    history_reader: Arc<GitHistoryMaterializer>,
    image_store: Arc<ImageStore>,
}

const ROTATION_RETRY_DELAY: Duration = Duration::from_secs(60);
const HISTORY_HEADER_PUBLISHED_EVENT: &str = "history-header-published";
const MEDIA_SWEEP_MINIMUM_BLOB_AGE: Duration = Duration::from_secs(60);

fn image_blob_path(database_path: &Path) -> PathBuf {
    database_path
        .parent()
        .unwrap_or(database_path)
        .join("blobs")
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn history_repository_path(database_path: &Path) -> PathBuf {
    database_path
        .parent()
        .unwrap_or(database_path)
        .join("history")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryVersionPayload {
    note_id: String,
    version_id: String,
    created_at: i64,
    summary: String,
    revision: i64,
    markdown: String,
}

fn storage_pointer_file(data_dir: &Path) -> PathBuf {
    data_dir.join("storage-location")
}

fn read_storage_pointer(data_dir: &Path) -> Option<PathBuf> {
    let raw = fs::read_to_string(storage_pointer_file(data_dir)).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(PathBuf::from(trimmed))
    }
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
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

fn workspace_runtime(state: &State<'_, AppState>) -> Result<WorkspaceRuntime, String> {
    state
        .maintenance
        .runtime()
        .map_err(|error| error.to_string())
}

async fn wait_for<T: Send + 'static>(completion: Completion<T>) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        completion.wait().map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

async fn run_maintenance<T: Send + 'static>(
    coordinator: Arc<MaintenanceCoordinator>,
    work: impl FnOnce(&MaintenanceCoordinator) -> Result<T, skriuw_storage::Diagnostic> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        work(&coordinator).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn bootstrap_workspace(state: State<'_, AppState>) -> Result<WorkspaceSnapshot, String> {
    let completion = workspace_runtime(&state)?
        .bootstrap()
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
async fn load_sidebar_expansion(state: State<'_, AppState>) -> Result<Option<Vec<String>>, String> {
    let completion = workspace_runtime(&state)?
        .load_sidebar_expansion()
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
async fn save_sidebar_expansion(
    folder_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let completion = workspace_runtime(&state)?
        .save_sidebar_expansion(folder_ids)
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
async fn load_pane_layout(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let completion = workspace_runtime(&state)?
        .load_pane_layout()
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
async fn save_pane_layout(layout_json: String, state: State<'_, AppState>) -> Result<(), String> {
    let completion = workspace_runtime(&state)?
        .save_pane_layout(layout_json)
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
async fn apply_workspace_operations(
    operations: Vec<WorkspaceOperationEnvelope>,
    state: State<'_, AppState>,
) -> Result<OperationAck, String> {
    let completion = workspace_runtime(&state)?
        .apply_operations(operations)
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
fn close_workspace_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.destroy().map_err(|error| error.to_string())
}

#[tauri::command]
async fn search_workspace(
    query: String,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<SearchHit>, String> {
    let completion = workspace_runtime(&state)?
        .search(query, limit)
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
async fn read_history_version(
    note_id: String,
    version_id: String,
    state: State<'_, AppState>,
) -> Result<HistoryVersionPayload, String> {
    let reader = Arc::clone(&state.history_reader);
    tauri::async_runtime::spawn_blocking(move || {
        reader
            .read_version(&note_id, &version_id)
            .map(|version| HistoryVersionPayload {
                note_id: version.header.note_id,
                version_id: version.header.version_id,
                created_at: version.header.created_at,
                summary: version.header.summary,
                revision: version.revision,
                markdown: version.markdown,
            })
            .map_err(|error| error.diagnostic().to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveExportPayload {
    nodes: usize,
    documents: usize,
    images: usize,
    exported_at: i64,
    file_name: String,
}

#[tauri::command]
async fn export_workspace_archive(
    state: State<'_, AppState>,
) -> Result<ArchiveExportPayload, String> {
    let exports_directory = state
        .storage_path
        .parent()
        .unwrap_or(Path::new("."))
        .join("exports");
    fs::create_dir_all(&exports_directory)
        .map_err(|_| "export directory could not be created".to_string())?;
    let file_name = format!("skriuw-archive-{}.json", now_millis());
    let target = exports_directory.join(&file_name);
    let coordinator = Arc::clone(&state.maintenance);
    let report = run_maintenance(coordinator, move |maintenance| {
        maintenance.export_archive(&target)
    })
    .await?;
    Ok(ArchiveExportPayload {
        nodes: report.nodes,
        documents: report.documents,
        images: report.images,
        exported_at: report.exported_at,
        file_name,
    })
}

#[tauri::command]
async fn import_workspace_archive(
    archive_path: String,
    state: State<'_, AppState>,
) -> Result<ArchiveImportReport, String> {
    let coordinator = Arc::clone(&state.maintenance);
    run_maintenance(coordinator, move |maintenance| {
        maintenance.import_archive(Path::new(&archive_path))
    })
    .await
}

#[tauri::command]
async fn create_workspace_backup(
    force: bool,
    state: State<'_, AppState>,
) -> Result<BackupRotationReport, String> {
    let coordinator = Arc::clone(&state.maintenance);
    run_maintenance(coordinator, move |maintenance| {
        maintenance.rotate_backups(force)
    })
    .await
}

#[tauri::command]
async fn list_workspace_recovery(
    state: State<'_, AppState>,
) -> Result<RecoveryInventoryReport, String> {
    let coordinator = Arc::clone(&state.maintenance);
    run_maintenance(coordinator, move |maintenance| {
        maintenance.recovery_inventory()
    })
    .await
}

#[tauri::command]
async fn restore_workspace_backup(
    artifact_file_name: String,
    state: State<'_, AppState>,
) -> Result<DatabaseSwapReport, String> {
    let coordinator = Arc::clone(&state.maintenance);
    run_maintenance(coordinator, move |maintenance| {
        maintenance.restore_backup(&artifact_file_name)
    })
    .await
}

#[tauri::command]
fn cancel_workspace_maintenance(state: State<'_, AppState>) -> bool {
    state.maintenance.cancel_active_operation()
}

#[tauri::command]
fn workspace_maintenance_status(state: State<'_, AppState>) -> Option<&'static str> {
    state.maintenance.status()
}

#[tauri::command]
fn workspace_storage_path(state: State<'_, AppState>) -> String {
    state.storage_path.display().to_string()
}

fn open_in_file_manager(target: &Path) -> Result<(), String> {
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "explorer"
    } else {
        "xdg-open"
    };
    std::process::Command::new(opener)
        .arg(target)
        .spawn()
        .map_err(|error| format!("open {}: {error}", target.display()))?;
    Ok(())
}

#[tauri::command]
fn reveal_workspace_storage(state: State<'_, AppState>) -> Result<(), String> {
    open_in_file_manager(state.storage_path.parent().unwrap_or(&state.storage_path))
}

#[tauri::command]
fn reveal_workspace_images(state: State<'_, AppState>) -> Result<(), String> {
    fs::create_dir_all(state.image_store.root()).map_err(|error| error.to_string())?;
    open_in_file_manager(state.image_store.root())
}

#[tauri::command]
async fn relocate_workspace_storage(
    target_dir: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if env::var_os("SKRIUW_DB").is_some() {
        return Err("storage location is fixed by SKRIUW_DB".into());
    }
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let pointer = storage_pointer_file(&data_dir);
    let coordinator = Arc::clone(&state.maintenance);
    let target = target_dir.clone();
    run_maintenance(coordinator, move |maintenance| {
        maintenance.relocate_to(Path::new(&target), || {
            fs::write(&pointer, format!("{target}\n")).map_err(|error| error.to_string())
        })
    })
    .await?;
    app.restart()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredImagePayload {
    content_hash: String,
    mime_type: String,
    byte_size: u64,
}

#[tauri::command]
fn store_note_image(
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

#[tauri::command]
fn read_note_image_blob(
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
async fn import_markdown_image(
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
struct MediaBlobPayload {
    content_hash: String,
    mime_type: String,
    byte_size: u64,
    modified_at_ms: u64,
}

#[tauri::command]
async fn list_media_blobs(state: State<'_, AppState>) -> Result<Vec<MediaBlobPayload>, String> {
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
async fn delete_media_blob(
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
async fn sweep_unused_media_blobs(state: State<'_, AppState>) -> Result<usize, String> {
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownExportEntry {
    relative_path: String,
    kind: String,
    markdown: Option<String>,
    #[serde(default)]
    content_hash: Option<String>,
    #[serde(default)]
    mime_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownFilePayload {
    relative_path: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownTreePayload {
    directories: Vec<String>,
    files: Vec<MarkdownFilePayload>,
    assets: Vec<String>,
    unsupported: Vec<String>,
    skipped: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreparedImportSource {
    root_path: String,
    temporary: bool,
    tree: MarkdownTreePayload,
}

const IMPORT_MAX_ENTRIES: usize = 20_000;
const IMPORT_MAX_FILE_BYTES: u64 = 128 * 1024 * 1024;
const IMPORT_MAX_TOTAL_BYTES: u64 = 1024 * 1024 * 1024;
const IMPORT_MAX_DEPTH: usize = 64;

fn create_import_temp_dir() -> Result<PathBuf, String> {
    let base = env::temp_dir();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    for suffix in 0..16 {
        let path = base.join(format!(
            "skriuw-import-{}-{timestamp}-{suffix}",
            std::process::id()
        ));
        match fs::create_dir(&path) {
            Ok(()) => return Ok(path),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("create {}: {error}", path.display())),
        }
    }
    Err("could not allocate import temporary directory".to_string())
}

fn remove_import_temp_dir(path: &Path) -> Result<(), String> {
    let valid_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with("skriuw-import-"));
    if path.parent() != Some(env::temp_dir().as_path()) || !valid_name {
        return Err("refused to remove non-import temporary directory".to_string());
    }
    if path.exists() {
        fs::remove_dir_all(path).map_err(|error| format!("remove {}: {error}", path.display()))?;
    }
    Ok(())
}

fn extract_import_archive(source: &Path, target: &Path) -> Result<(), String> {
    let file = fs::File::open(source)
        .map_err(|error| format!("open import archive {}: {error}", source.display()))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("read import archive: {error}"))?;
    if archive.len() > IMPORT_MAX_ENTRIES {
        return Err(format!(
            "import archive has {} entries; limit is {IMPORT_MAX_ENTRIES}",
            archive.len()
        ));
    }
    let mut total_bytes = 0_u64;
    let mut normalized_paths = BTreeSet::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("read import archive entry {index}: {error}"))?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| format!("unsafe import archive path: {}", entry.name()))?;
        if relative.components().count() > IMPORT_MAX_DEPTH {
            return Err(format!("import archive path is too deep: {}", entry.name()));
        }
        if entry.is_symlink() {
            return Err(format!("import archive contains symlink: {}", entry.name()));
        }
        let normalized = relative.to_string_lossy().replace('\\', "/").to_lowercase();
        if !normalized_paths.insert(normalized) {
            return Err(format!("duplicate import archive path: {}", entry.name()));
        }
        if entry.is_dir() {
            fs::create_dir_all(target.join(relative))
                .map_err(|error| format!("create import directory: {error}"))?;
            continue;
        }
        if !entry.is_file() {
            return Err(format!("unsupported import archive entry: {}", entry.name()));
        }
        if entry.size() > IMPORT_MAX_FILE_BYTES {
            return Err(format!("import archive file is too large: {}", entry.name()));
        }
        total_bytes = total_bytes
            .checked_add(entry.size())
            .ok_or_else(|| "import archive expanded size overflow".to_string())?;
        if total_bytes > IMPORT_MAX_TOTAL_BYTES {
            return Err(format!(
                "import archive expands beyond {} bytes",
                IMPORT_MAX_TOTAL_BYTES
            ));
        }
        let output = target.join(relative);
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("create import directory: {error}"))?;
        }
        let mut destination = fs::File::create(&output)
            .map_err(|error| format!("create import file {}: {error}", output.display()))?;
        let copied = io::copy(
            &mut entry.by_ref().take(IMPORT_MAX_FILE_BYTES + 1),
            &mut destination,
        )
        .map_err(|error| format!("extract import file {}: {error}", output.display()))?;
        if copied > IMPORT_MAX_FILE_BYTES {
            return Err(format!("import archive file is too large: {}", entry.name()));
        }
    }
    Ok(())
}

fn prepare_import_source_path(source: &Path) -> Result<PreparedImportSource, String> {
    if source.is_dir() {
        return Ok(PreparedImportSource {
            root_path: source.display().to_string(),
            temporary: false,
            tree: collect_markdown_tree(source)?,
        });
    }
    if !source.is_file() {
        return Err(format!("import source does not exist: {}", source.display()));
    }
    let temporary = create_import_temp_dir()?;
    let result = (|| {
        let lowered = source
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if lowered.ends_with(".zip") || lowered.ends_with(".bear2bk") {
            extract_import_archive(source, &temporary)?;
        } else if has_importable_extension(&lowered) {
            let file_name = source
                .file_name()
                .ok_or_else(|| "import file has no name".to_string())?;
            fs::copy(source, temporary.join(file_name))
                .map_err(|error| format!("copy import file {}: {error}", source.display()))?;
        } else {
            return Err("unsupported import source; choose a folder, ZIP, Bear backup, Markdown, text, JSON, CSV, or Evernote ENEX file".to_string());
        }
        Ok(PreparedImportSource {
            root_path: temporary.display().to_string(),
            temporary: true,
            tree: collect_markdown_tree(&temporary)?,
        })
    })();
    if result.is_err() {
        let _ = remove_import_temp_dir(&temporary);
    }
    result
}

fn unique_import_file_name(taken: &mut BTreeSet<String>, name: &str) -> String {
    let (stem, extension) = match name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() => (stem, format!(".{extension}")),
        _ => (name, String::new()),
    };
    let mut candidate = name.to_string();
    let mut suffix = 2;
    while !taken.insert(candidate.to_lowercase()) {
        candidate = format!("{stem} ({suffix}){extension}");
        suffix += 1;
    }
    candidate
}

fn prepare_import_source_paths(sources: &[PathBuf]) -> Result<PreparedImportSource, String> {
    match sources {
        [] => Err("no import source selected".to_string()),
        [single] => prepare_import_source_path(single),
        many => {
            let temporary = create_import_temp_dir()?;
            let result = (|| {
                let mut taken = BTreeSet::new();
                for source in many {
                    if !source.is_file() {
                        return Err(format!(
                            "select files only when importing several sources: {}",
                            source.display()
                        ));
                    }
                    let file_name = source
                        .file_name()
                        .and_then(|name| name.to_str())
                        .ok_or_else(|| "import file has no name".to_string())?;
                    if !has_importable_extension(&file_name.to_lowercase()) {
                        return Err(format!(
                            "unsupported import file; choose Markdown, text, JSON, CSV, or ENEX files: {}",
                            source.display()
                        ));
                    }
                    let target = temporary.join(unique_import_file_name(&mut taken, file_name));
                    fs::copy(source, &target).map_err(|error| {
                        format!("copy import file {}: {error}", source.display())
                    })?;
                }
                Ok(PreparedImportSource {
                    root_path: temporary.display().to_string(),
                    temporary: true,
                    tree: collect_markdown_tree(&temporary)?,
                })
            })();
            if result.is_err() {
                let _ = remove_import_temp_dir(&temporary);
            }
            result
        }
    }
}

fn resolve_relative_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty() {
        return Err("empty export path".to_string());
    }
    let mut resolved = root.to_path_buf();
    for component in relative.split('/') {
        if component.is_empty() || component == "." || component == ".." || component.contains('\\')
        {
            return Err(format!("invalid export path: {relative}"));
        }
        resolved.push(component);
    }
    Ok(resolved)
}

fn write_markdown_entries(
    target: &Path,
    entries: &[MarkdownExportEntry],
    image_store: &ImageStore,
) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| format!("create {}: {error}", target.display()))?;
    for entry in entries {
        let path = resolve_relative_path(target, &entry.relative_path)?;
        match entry.kind.as_str() {
            "folder" => {
                fs::create_dir_all(&path)
                    .map_err(|error| format!("create {}: {error}", path.display()))?;
            }
            "note" => {
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| format!("create {}: {error}", parent.display()))?;
                }
                fs::write(&path, entry.markdown.as_deref().unwrap_or(""))
                    .map_err(|error| format!("write {}: {error}", path.display()))?;
            }
            "image" => {
                let (Some(content_hash), Some(mime_type)) =
                    (entry.content_hash.as_deref(), entry.mime_type.as_deref())
                else {
                    return Err(format!(
                        "image export entry {} is missing blob metadata",
                        entry.relative_path
                    ));
                };
                let source = image_store
                    .blob_path(content_hash, mime_type)
                    .map_err(|error| error.to_string())?;
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| format!("create {}: {error}", parent.display()))?;
                }
                fs::copy(&source, &path).map_err(|error| {
                    format!("copy blob {content_hash} to {}: {error}", path.display())
                })?;
            }
            other => return Err(format!("unknown export entry kind: {other}")),
        }
    }
    Ok(())
}

fn has_importable_extension(name: &str) -> bool {
    let lowered = name.to_lowercase();
    ["md", "markdown", "txt", "json", "csv", "enex"]
        .iter()
        .any(|extension| lowered.ends_with(&format!(".{extension}")))
}

/// Must stay in sync with `sniff_mime` in `crates/skriuw-images/src/lib.rs`.
fn has_asset_extension(name: &str) -> bool {
    let lowered = name.to_lowercase();
    ["png", "jpg", "jpeg", "gif", "webp"]
        .iter()
        .any(|extension| lowered.ends_with(&format!(".{extension}")))
}

fn walk_markdown_dir(
    dir: &Path,
    prefix: &str,
    payload: &mut MarkdownTreePayload,
) -> Result<(), String> {
    let mut entries: Vec<fs::DirEntry> = fs::read_dir(dir)
        .map_err(|error| format!("read {}: {error}", dir.display()))?
        .collect::<Result<_, _>>()
        .map_err(|error| format!("read {}: {error}", dir.display()))?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        let relative = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let file_type = entry
            .file_type()
            .map_err(|error| format!("stat {}: {error}", entry.path().display()))?;
        if file_type.is_dir() {
            if name.starts_with('.') {
                continue;
            }
            payload.directories.push(relative.clone());
            walk_markdown_dir(&entry.path(), &relative, payload)?;
        } else if name.starts_with('.') {
            continue;
        } else if has_importable_extension(&name) {
            match fs::read_to_string(entry.path()) {
                Ok(content) => payload.files.push(MarkdownFilePayload {
                    relative_path: relative,
                    content,
                }),
                Err(_) => payload.skipped += 1,
            }
        } else if has_asset_extension(&name) {
            payload.assets.push(relative);
        } else {
            payload.unsupported.push(relative);
        }
    }
    Ok(())
}

fn collect_markdown_tree(root: &Path) -> Result<MarkdownTreePayload, String> {
    let mut payload = MarkdownTreePayload {
        directories: Vec::new(),
        files: Vec::new(),
        assets: Vec::new(),
        unsupported: Vec::new(),
        skipped: 0,
    };
    walk_markdown_dir(root, "", &mut payload)?;
    Ok(payload)
}

#[tauri::command]
async fn export_markdown_tree(
    entries: Vec<MarkdownExportEntry>,
    target_dir: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let image_store = Arc::clone(&state.image_store);
    tauri::async_runtime::spawn_blocking(move || {
        write_markdown_entries(Path::new(&target_dir), &entries, &image_store)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_markdown_tree(source_dir: String) -> Result<MarkdownTreePayload, String> {
    tauri::async_runtime::spawn_blocking(move || collect_markdown_tree(Path::new(&source_dir)))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn prepare_import_source(source_path: String) -> Result<PreparedImportSource, String> {
    tauri::async_runtime::spawn_blocking(move || {
        prepare_import_source_path(Path::new(&source_path))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn prepare_import_sources(
    source_paths: Vec<String>,
) -> Result<PreparedImportSource, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let paths = source_paths
            .iter()
            .map(PathBuf::from)
            .collect::<Vec<PathBuf>>();
        prepare_import_source_paths(&paths)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn cleanup_import_source(root_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || remove_import_temp_dir(Path::new(&root_path)))
        .await
        .map_err(|error| error.to_string())?
}

// Native GTK pickers cannot be driven by WebDriver automation, so debug
// builds honor SKRIUW_E2E_PICK_PATHS (newline-separated absolute paths)
// instead of opening a dialog. Release builds compile the override out.
#[cfg(debug_assertions)]
fn picker_override() -> Option<Vec<String>> {
    let raw = env::var("SKRIUW_E2E_PICK_PATHS").ok()?;
    let paths = raw
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect::<Vec<String>>();
    if paths.is_empty() { None } else { Some(paths) }
}

#[tauri::command]
async fn pick_directory(app: tauri::AppHandle, title: String) -> Result<Option<String>, String> {
    #[cfg(debug_assertions)]
    if let Some(paths) = picker_override() {
        return Ok(paths.into_iter().next());
    }
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title(&title)
            .blocking_pick_folder()
            .map(|path| {
                path.into_path()
                    .map(|resolved| resolved.display().to_string())
                    .map_err(|error| error.to_string())
            })
            .transpose()
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn pick_import_file(
    app: tauri::AppHandle,
    title: String,
    extensions: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    #[cfg(debug_assertions)]
    if let Some(paths) = picker_override() {
        return Ok(paths.into_iter().next());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file().set_title(&title);
        if let Some(extensions) = extensions.as_ref().filter(|list| !list.is_empty()) {
            let refs: Vec<&str> = extensions.iter().map(String::as_str).collect();
            dialog = dialog.add_filter("Markdown", &refs);
        }
        dialog
            .blocking_pick_file()
            .map(|path| {
                path.into_path()
                    .map(|resolved| resolved.display().to_string())
                    .map_err(|error| error.to_string())
            })
            .transpose()
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn pick_import_files(app: tauri::AppHandle, title: String) -> Result<Vec<String>, String> {
    #[cfg(debug_assertions)]
    if let Some(paths) = picker_override() {
        return Ok(paths);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_title(&title)
            .blocking_pick_files()
            .unwrap_or_default();
        picked
            .into_iter()
            .map(|path| {
                path.into_path()
                    .map(|resolved| resolved.display().to_string())
                    .map_err(|error| error.to_string())
            })
            .collect::<Result<Vec<String>, String>>()
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let path = database_path(app.handle())?;
            let repository_path = history_repository_path(&path);
            let history_reader = Arc::new(
                GitHistoryMaterializer::open(&repository_path)
                    .map_err(|error| format!("open {}: {error}", repository_path.display()))?,
            );
            let maintenance = Arc::new(MaintenanceCoordinator::start(
                path.clone(),
                repository_path,
                now_millis,
                {
                    let app_handle = app.handle().clone();
                    Arc::new(move |header: HistoryHeader| {
                        if let Err(error) = app_handle.emit(HISTORY_HEADER_PUBLISHED_EVENT, header)
                        {
                            eprintln!("history header publication failed: {error}");
                        }
                    })
                },
            )?);
            let rotation = spawn_backup_rotation(Arc::clone(&maintenance), ROTATION_RETRY_DELAY)?;
            let image_store = Arc::new(
                ImageStore::open(image_blob_path(&path)).map_err(|error| error.to_string())?,
            );
            app.manage(AppState {
                maintenance,
                rotation,
                storage_path: path,
                history_reader,
                image_store,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap_workspace,
            load_sidebar_expansion,
            save_sidebar_expansion,
            load_pane_layout,
            save_pane_layout,
            apply_workspace_operations,
            close_workspace_window,
            search_workspace,
            read_history_version,
            export_workspace_archive,
            import_workspace_archive,
            create_workspace_backup,
            list_workspace_recovery,
            restore_workspace_backup,
            cancel_workspace_maintenance,
            workspace_maintenance_status,
            workspace_storage_path,
            reveal_workspace_storage,
            reveal_workspace_images,
            relocate_workspace_storage,
            export_markdown_tree,
            read_markdown_tree,
            prepare_import_source,
            prepare_import_sources,
            cleanup_import_source,
            pick_directory,
            pick_import_file,
            pick_import_files,
            store_note_image,
            read_note_image_blob,
            import_markdown_image,
            list_media_blobs,
            delete_media_blob,
            sweep_unused_media_blobs
        ])
        .build(tauri::generate_context!())
        .expect("skriuw app must build")
        .run(|app, event| {
            if let RunEvent::Exit = event
                && let Some(state) = app.try_state::<AppState>()
            {
                state.rotation.shutdown();
                state.maintenance.shutdown();
            }
        });
}

#[cfg(test)]
mod markdown_tree_tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;

    fn entry(relative_path: &str, kind: &str, markdown: Option<&str>) -> MarkdownExportEntry {
        MarkdownExportEntry {
            relative_path: relative_path.to_string(),
            kind: kind.to_string(),
            markdown: markdown.map(str::to_string),
            content_hash: None,
            mime_type: None,
        }
    }

    fn empty_image_store() -> (tempfile::TempDir, ImageStore) {
        let dir = tempdir().expect("blob tempdir");
        let store = ImageStore::open(dir.path().join("blobs")).expect("open blob store");
        (dir, store)
    }

    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let file = fs::File::create(path).expect("create zip");
        let mut writer = zip::ZipWriter::new(file);
        for (name, content) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .expect("start zip file");
            writer.write_all(content).expect("write zip file");
        }
        writer.finish().expect("finish zip");
    }

    #[test]
    fn writes_and_reads_back_a_markdown_tree() {
        let dir = tempdir().expect("tempdir");
        let (_blob_dir, image_store) = empty_image_store();
        let entries = [
            entry("Projects", "folder", None),
            entry("Projects/Skriuw", "folder", None),
            entry("Projects/Skriuw/Roadmap.md", "note", Some("# Roadmap")),
            entry("Inbox.md", "note", Some("hello")),
        ];
        write_markdown_entries(dir.path(), &entries, &image_store).expect("write tree");

        let tree = collect_markdown_tree(dir.path()).expect("collect tree");
        assert_eq!(tree.directories, ["Projects", "Projects/Skriuw"]);
        assert_eq!(tree.skipped, 0);
        let paths: Vec<&str> = tree
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();
        assert_eq!(paths, ["Inbox.md", "Projects/Skriuw/Roadmap.md"]);
        assert_eq!(tree.files[1].content, "# Roadmap");
    }

    #[test]
    fn prepares_several_markdown_files_into_one_source() {
        let dir = tempdir().expect("tempdir");
        let nested = dir.path().join("nested");
        fs::create_dir(&nested).expect("create nested");
        fs::write(dir.path().join("Note.md"), "# One").expect("write first");
        fs::write(nested.join("Note.md"), "# Two").expect("write second");
        let sources = [dir.path().join("Note.md"), nested.join("Note.md")];

        let prepared = prepare_import_source_paths(&sources).expect("prepare sources");
        assert!(prepared.temporary);
        let paths: Vec<&str> = prepared
            .tree
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();
        assert_eq!(paths, ["Note (2).md", "Note.md"]);
        remove_import_temp_dir(Path::new(&prepared.root_path)).expect("cleanup");
    }

    #[test]
    fn rejects_unsupported_files_in_a_multi_file_selection() {
        let dir = tempdir().expect("tempdir");
        fs::write(dir.path().join("Note.md"), "# One").expect("write note");
        fs::write(dir.path().join("photo.png"), [0x89]).expect("write asset");
        let sources = [dir.path().join("Note.md"), dir.path().join("photo.png")];

        let error = prepare_import_source_paths(&sources)
            .err()
            .expect("reject asset");
        assert!(error.contains("unsupported import file"), "{error}");
    }

    #[test]
    fn rejects_escaping_and_absolute_paths() {
        let dir = tempdir().expect("tempdir");
        let (_blob_dir, image_store) = empty_image_store();
        for relative_path in ["../escape.md", "/absolute.md", "a/../b.md", "", "a//b.md"] {
            let result = write_markdown_entries(
                dir.path(),
                &[entry(relative_path, "note", Some(""))],
                &image_store,
            );
            assert!(result.is_err(), "accepted {relative_path:?}");
        }
    }

    #[test]
    fn copies_image_blobs_into_export_tree() {
        let dir = tempdir().expect("tempdir");
        let (_blob_dir, image_store) = empty_image_store();
        let png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
        let stored = image_store.put(&png).expect("store blob");
        let entries = [
            entry("Note.md", "note", Some("![](images/image-1.png)")),
            MarkdownExportEntry {
                relative_path: "images/image-1.png".into(),
                kind: "image".into(),
                markdown: None,
                content_hash: Some(stored.content_hash.clone()),
                mime_type: Some(stored.mime_type.into()),
            },
        ];
        write_markdown_entries(dir.path(), &entries, &image_store).expect("write tree");

        let copied = fs::read(dir.path().join("images/image-1.png")).expect("read copy");
        assert_eq!(copied, png);
    }

    #[test]
    fn reads_supported_text_files_and_counts_invalid_utf8_as_skipped() {
        let dir = tempdir().expect("tempdir");
        fs::write(dir.path().join("valid.md"), "ok").expect("write valid");
        fs::write(dir.path().join("broken.md"), [0xff, 0xfe, 0xfd]).expect("write broken");
        fs::write(dir.path().join("notes.txt"), "plain text").expect("write text");
        fs::write(dir.path().join("database.csv"), "Name\nTask").expect("write csv");
        fs::write(dir.path().join("export.enex"), "<en-export/>").expect("write enex");
        fs::write(dir.path().join("attachment.pdf"), b"%PDF").expect("write pdf");
        fs::write(dir.path().join(".DS_Store"), "hidden").expect("write hidden");

        let tree = collect_markdown_tree(dir.path()).expect("collect tree");
        let paths: Vec<&str> = tree
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();
        assert_eq!(paths, ["database.csv", "export.enex", "notes.txt", "valid.md"]);
        assert_eq!(tree.unsupported, ["attachment.pdf"]);
        assert_eq!(tree.skipped, 1);
    }

    #[test]
    fn prepares_and_cleans_archive_import_sources() {
        let dir = tempdir().expect("tempdir");
        let archive = dir.path().join("export.zip");
        write_zip(
            &archive,
            &[
                ("Vault/Note.md", b"# Note"),
                ("Vault/Database.csv", b"Name\nTask"),
                ("Vault/image.png", b"\x89PNG\r\n\x1a\n"),
            ],
        );

        let prepared = prepare_import_source_path(&archive).expect("prepare archive");
        assert!(prepared.temporary);
        assert_eq!(prepared.tree.files.len(), 2);
        assert_eq!(prepared.tree.assets, ["Vault/image.png"]);
        let root = PathBuf::from(&prepared.root_path);
        assert!(root.exists());
        remove_import_temp_dir(&root).expect("clean import");
        assert!(!root.exists());
    }

    #[test]
    fn rejects_archive_parent_traversal() {
        let dir = tempdir().expect("tempdir");
        let archive = dir.path().join("unsafe.zip");
        write_zip(&archive, &[("../escape.md", b"escape")]);

        let error = prepare_import_source_path(&archive)
            .err()
            .expect("unsafe archive accepted");
        assert!(error.contains("unsafe import archive path"));
        assert!(!dir.path().join("escape.md").exists());
    }

    #[test]
    fn refuses_cleanup_outside_owned_import_temp_directories() {
        let dir = tempdir().expect("tempdir");
        let error = remove_import_temp_dir(dir.path()).expect_err("removed arbitrary directory");
        assert!(error.contains("refused"));
        assert!(dir.path().exists());
    }
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

#[cfg(test)]
mod smoke_tests {
    use super::*;
    use skriuw_domain::{NodePlacement, WorkspaceOperation, WorkspaceOperationEnvelope};
    use skriuw_sqlite::SqliteWorkspace;
    use skriuw_storage::{HistoryQueue, WorkspaceStorage};
    use std::{
        sync::{Mutex, mpsc},
        time::Duration,
    };
    use tempfile::tempdir;

    #[test]
    fn drains_pending_history_and_reads_it_back() {
        let dir = tempdir().expect("tempdir");
        let db_path = dir.path().join("workspace.db");
        let repo_path = history_repository_path(&db_path);

        {
            let storage = SqliteWorkspace::open(&db_path).expect("open db");
            storage
                .apply_operations(&[WorkspaceOperationEnvelope::v1(
                    WorkspaceOperation::CreateNote {
                        id: "note-1".into(),
                        title: "Smoke".into(),
                        placement: NodePlacement::last(None),
                        document_json: serde_json::json!({"type": "doc", "content": []}),
                        markdown: "# Smoke".into(),
                        at: 1,
                    },
                )])
                .expect("create note");
        }

        let (published, received) = mpsc::sync_channel(1);
        let drain = maintenance::spawn_history_drain(
            &db_path,
            &repo_path,
            now_millis,
            Arc::new(move |header| {
                let _ = published.send(header);
            }),
        )
        .expect("spawn drain");
        let reader = GitHistoryMaterializer::open(&repo_path).expect("open reader");
        let published = received
            .recv_timeout(Duration::from_secs(2))
            .expect("published header");
        drain.shutdown();

        let headers = reader.list_headers().expect("list headers");
        assert_eq!(headers.len(), 1);
        assert_eq!(published, headers[0]);
        let snapshot = SqliteWorkspace::open(&db_path)
            .expect("open cache")
            .bootstrap()
            .expect("read cache");
        assert_eq!(snapshot.history_headers, [published]);
        let version = reader
            .read_version("note-1", &headers[0].version_id)
            .expect("read version");
        assert_eq!(version.markdown, "# Smoke");
    }

    #[test]
    fn git_failure_preserves_retry_without_publishing() {
        let dir = tempdir().expect("tempdir");
        let db_path = dir.path().join("workspace.db");
        let repo_path = history_repository_path(&db_path);
        let storage = SqliteWorkspace::open(&db_path).expect("open db");
        storage
            .apply_operations(&[WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::CreateNote {
                    id: "note-1".into(),
                    title: "Smoke".into(),
                    placement: NodePlacement::last(None),
                    document_json: serde_json::json!({"type": "doc", "content": []}),
                    markdown: "# Smoke".into(),
                    at: 1,
                },
            )])
            .expect("create note");
        GitHistoryMaterializer::open(&repo_path).expect("initialize history");
        let index_path = repo_path.join(".git").join("index");
        if index_path.exists() {
            fs::remove_file(&index_path).expect("remove index");
        }
        fs::create_dir(&index_path).expect("block index creation");
        let publications = Arc::new(Mutex::new(Vec::<HistoryHeader>::new()));
        let captured = Arc::clone(&publications);
        let drain = maintenance::spawn_history_drain(
            &db_path,
            &repo_path,
            now_millis,
            Arc::new(move |header| {
                captured.lock().expect("publications").push(header);
            }),
        )
        .expect("spawn drain");
        std::thread::sleep(Duration::from_millis(100));
        drain.shutdown();

        assert!(publications.lock().expect("publications").is_empty());
        let reopened = SqliteWorkspace::open(&db_path).expect("reopen db");
        assert!(
            reopened
                .claim_history_revision("retry-check", now_millis(), 30_000)
                .expect("claim deferred retry")
                .is_none()
        );
        let retry = reopened
            .claim_history_revision("retry-check", i64::MAX, 30_000)
            .expect("claim retry")
            .expect("pending retry");
        assert_eq!(retry.attempts, 2);
    }
}
