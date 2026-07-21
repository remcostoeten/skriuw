use std::{env, fs, path::PathBuf};

use skriuw_domain::{OperationAck, SearchHit, WorkspaceOperationEnvelope, WorkspaceSnapshot};
use skriuw_runtime::{Completion, WorkspaceRuntime};
use skriuw_sqlite::SqliteWorkspace;
use tauri::{Manager, RunEvent, State};

struct AppState {
    runtime: WorkspaceRuntime,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = database_path(app.handle())?;
            let storage = SqliteWorkspace::open(&path)
                .map_err(|error| format!("open {}: {error}", path.display()))?;
            app.manage(AppState {
                runtime: WorkspaceRuntime::spawn(storage),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap_workspace,
            apply_workspace_operations,
            search_workspace
        ])
        .build(tauri::generate_context!())
        .expect("skriuw app must build")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Err(error) = state.runtime.shutdown() {
                        eprintln!("runtime shutdown failed: {error}");
                    }
                }
            }
        });
}
