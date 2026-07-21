mod maintenance;

use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use maintenance::{
    ArchiveExportReport, ArchiveImportReport, BackupRotationReport, DatabaseSwapReport,
    MaintenanceCoordinator, RecoveryInventoryReport,
};
use serde::Serialize;
use skriuw_domain::{OperationAck, SearchHit, WorkspaceOperationEnvelope, WorkspaceSnapshot};
use skriuw_history::HistoryReader;
use skriuw_history_git::GitHistoryMaterializer;
use skriuw_runtime::{Completion, WorkspaceRuntime};
use tauri::{Manager, RunEvent, State};

struct AppState {
    maintenance: Arc<MaintenanceCoordinator>,
    storage_path: PathBuf,
    history_reader: Arc<GitHistoryMaterializer>,
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

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("SKRIUW_DB") {
        return Ok(PathBuf::from(path));
    }
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    Ok(data_dir.join("skriuw.db"))
}

fn workspace_runtime(state: &State<'_, AppState>) -> Result<WorkspaceRuntime, String> {
    state
        .maintenance
        .runtime()
        .map_err(|error| error.to_string())
}

async fn wait_for<T: Send + 'static>(completion: Completion<T>) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || completion.wait().map_err(|error| error.to_string()))
        .await
        .map_err(|error| error.to_string())?
}

async fn run_maintenance<T: Send + 'static>(
    coordinator: Arc<MaintenanceCoordinator>,
    work: impl FnOnce(&MaintenanceCoordinator) -> Result<T, skriuw_storage::Diagnostic>
    + Send
    + 'static,
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

#[tauri::command]
async fn export_workspace_archive(
    target_path: String,
    state: State<'_, AppState>,
) -> Result<ArchiveExportReport, String> {
    let coordinator = Arc::clone(&state.maintenance);
    run_maintenance(coordinator, move |maintenance| {
        maintenance.export_archive(Path::new(&target_path))
    })
    .await
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

#[tauri::command]
fn reveal_workspace_storage(state: State<'_, AppState>) -> Result<(), String> {
    let target = state
        .storage_path
        .parent()
        .unwrap_or(&state.storage_path)
        .to_path_buf();
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "explorer"
    } else {
        "xdg-open"
    };
    std::process::Command::new(opener)
        .arg(&target)
        .spawn()
        .map_err(|error| format!("open {}: {error}", target.display()))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            )?);
            app.manage(AppState {
                maintenance,
                storage_path: path,
                history_reader,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap_workspace,
            apply_workspace_operations,
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
            reveal_workspace_storage
        ])
        .build(tauri::generate_context!())
        .expect("skriuw app must build")
        .run(|app, event| {
            if let RunEvent::Exit = event
                && let Some(state) = app.try_state::<AppState>()
            {
                state.maintenance.shutdown();
            }
        });
}

#[cfg(test)]
mod smoke_tests {
    use super::*;
    use std::{thread, time::Duration};
    use skriuw_domain::{NodePlacement, WorkspaceOperation, WorkspaceOperationEnvelope};
    use skriuw_sqlite::SqliteWorkspace;
    use skriuw_storage::WorkspaceStorage;
    use tempfile::tempdir;

    #[test]
    fn drains_pending_history_and_reads_it_back() {
        let dir = tempdir().expect("tempdir");
        let db_path = dir.path().join("workspace.db");
        let repo_path = history_repository_path(&db_path);

        {
            let storage = SqliteWorkspace::open(&db_path).expect("open db");
            storage
                .apply_operations(&[WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateNote {
                    id: "note-1".into(),
                    title: "Smoke".into(),
                    placement: NodePlacement::last(None),
                    document_json: serde_json::json!({"type": "doc", "content": []}),
                    markdown: "# Smoke".into(),
                    at: 1,
                })])
                .expect("create note");
        }

        let drain =
            maintenance::spawn_history_drain(&db_path, &repo_path, now_millis).expect("spawn drain");
        let reader = GitHistoryMaterializer::open(&repo_path).expect("open reader");

        let mut headers = Vec::new();
        for _ in 0..100 {
            headers = reader.list_headers().expect("list headers");
            if !headers.is_empty() {
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
        drain.shutdown();

        assert_eq!(headers.len(), 1);
        let version = reader
            .read_version("note-1", &headers[0].version_id)
            .expect("read version");
        assert_eq!(version.markdown, "# Smoke");
    }
}
