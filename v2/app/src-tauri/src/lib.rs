use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use skriuw_domain::{OperationAck, SearchHit, WorkspaceOperationEnvelope, WorkspaceSnapshot};
use skriuw_history::{HistoryReader, HistoryWorkResult, HistoryWorker};
use skriuw_history_git::GitHistoryMaterializer;
use skriuw_runtime::{Completion, WorkspaceRuntime};
use skriuw_sqlite::SqliteWorkspace;
use tauri::{Manager, RunEvent, State};

const HISTORY_DRAIN_WORKER_ID: &str = "desktop-history-drain";
const HISTORY_DRAIN_IDLE_DELAY: Duration = Duration::from_millis(250);
const HISTORY_DRAIN_LEASE_MS: i64 = 30_000;

struct AppState {
    runtime: WorkspaceRuntime,
    storage_path: PathBuf,
    history_reader: Arc<GitHistoryMaterializer>,
    history_drain: HistoryDrainHandle,
}

struct HistoryDrainHandle {
    stop: Arc<AtomicBool>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl HistoryDrainHandle {
    fn shutdown(&self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Ok(mut guard) = self.worker.lock()
            && let Some(handle) = guard.take()
        {
            let _ = handle.join();
        }
    }
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

fn spawn_history_drain(
    database_path: &Path,
    repository_path: &Path,
) -> Result<HistoryDrainHandle, String> {
    let storage = Arc::new(
        SqliteWorkspace::open(database_path)
            .map_err(|error| format!("open {}: {error}", database_path.display()))?,
    );
    let materializer = GitHistoryMaterializer::open(repository_path)
        .map_err(|error| format!("open {}: {error}", repository_path.display()))?;
    let worker = HistoryWorker::new(HISTORY_DRAIN_WORKER_ID, storage, materializer)
        .map_err(|error| error.to_string())?;
    let stop = Arc::new(AtomicBool::new(false));
    let stop_flag = Arc::clone(&stop);
    let handle = thread::Builder::new()
        .name("skriuw-history-drain".into())
        .spawn(move || {
            while !stop_flag.load(Ordering::Relaxed) {
                match worker.process_next(now_millis(), HISTORY_DRAIN_LEASE_MS) {
                    Ok(HistoryWorkResult::Materialized { .. }) => {}
                    Ok(HistoryWorkResult::Idle) => thread::sleep(HISTORY_DRAIN_IDLE_DELAY),
                    Err(error) => {
                        eprintln!("history drain failed: {error}");
                        thread::sleep(HISTORY_DRAIN_IDLE_DELAY);
                    }
                }
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(HistoryDrainHandle {
        stop,
        worker: Mutex::new(Some(handle)),
    })
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

async fn wait_for<T: Send + 'static>(completion: Completion<T>) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || completion.wait().map_err(|error| error.to_string()))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn bootstrap_workspace(state: State<'_, AppState>) -> Result<WorkspaceSnapshot, String> {
    let completion = state
        .runtime
        .bootstrap()
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
async fn apply_workspace_operations(
    operations: Vec<WorkspaceOperationEnvelope>,
    state: State<'_, AppState>,
) -> Result<OperationAck, String> {
    let completion = state
        .runtime
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
    let completion = state
        .runtime
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
            let storage = SqliteWorkspace::open(&path)
                .map_err(|error| format!("open {}: {error}", path.display()))?;
            let repository_path = history_repository_path(&path);
            let history_reader = Arc::new(
                GitHistoryMaterializer::open(&repository_path)
                    .map_err(|error| format!("open {}: {error}", repository_path.display()))?,
            );
            let history_drain = spawn_history_drain(&path, &repository_path)?;
            app.manage(AppState {
                runtime: WorkspaceRuntime::spawn(storage),
                storage_path: path,
                history_reader,
                history_drain,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap_workspace,
            apply_workspace_operations,
            search_workspace,
            read_history_version,
            workspace_storage_path,
            reveal_workspace_storage
        ])
        .build(tauri::generate_context!())
        .expect("skriuw app must build")
        .run(|app, event| {
            if let RunEvent::Exit = event
                && let Some(state) = app.try_state::<AppState>()
            {
                state.history_drain.shutdown();
                if let Err(error) = state.runtime.shutdown() {
                    eprintln!("runtime shutdown failed: {error}");
                }
            }
        });
}

#[cfg(test)]
mod smoke_tests {
    use super::*;
    use skriuw_domain::{NodePlacement, WorkspaceOperation, WorkspaceOperationEnvelope};
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

        let drain = spawn_history_drain(&db_path, &repo_path).expect("spawn drain");
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
