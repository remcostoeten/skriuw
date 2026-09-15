use crate::state::{AppState, wait_for, workspace_runtime};
use skriuw_domain::{
    OperationAck, SearchHit, SearchIndexStatus, WorkspaceDelta, WorkspaceOperationEnvelope,
    WorkspaceSnapshot,
};
use tauri::State;

#[tauri::command]
pub async fn bootstrap_workspace(state: State<'_, AppState>) -> Result<WorkspaceSnapshot, String> {
    let completion = workspace_runtime(&state)?
        .bootstrap()
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn load_sidebar_expansion(
    state: State<'_, AppState>,
) -> Result<Option<Vec<String>>, String> {
    let completion = workspace_runtime(&state)?
        .load_sidebar_expansion()
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn save_sidebar_expansion(
    folder_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let completion = workspace_runtime(&state)?
        .save_sidebar_expansion(folder_ids)
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn load_pane_layout(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let completion = workspace_runtime(&state)?
        .load_pane_layout()
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn save_pane_layout(
    layout_json: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let completion = workspace_runtime(&state)?
        .save_pane_layout(layout_json)
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn apply_workspace_operations(
    operations: Vec<WorkspaceOperationEnvelope>,
    state: State<'_, AppState>,
) -> Result<OperationAck, String> {
    let completion = workspace_runtime(&state)?
        .apply_operations(operations)
        .map_err(|error| error.to_string())?;
    let acknowledgement = wait_for(completion).await?;
    state.sync.notify_local_commit();
    Ok(acknowledgement)
}

#[tauri::command]
pub fn close_workspace_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.destroy().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn search_workspace(
    query: String,
    note_ids: Option<Vec<String>>,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<SearchHit>, String> {
    let completion = workspace_runtime(&state)?
        .search_filtered(query, limit, note_ids)
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn search_index_status(
    state: State<'_, AppState>,
) -> Result<SearchIndexStatus, String> {
    let completion = workspace_runtime(&state)?
        .search_index_status()
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn rebuild_search_index(
    state: State<'_, AppState>,
) -> Result<SearchIndexStatus, String> {
    let completion = workspace_runtime(&state)?
        .rebuild_search_index()
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn read_workspace_delta(
    ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<WorkspaceDelta, String> {
    let completion = workspace_runtime(&state)?
        .read_workspace_delta(ids)
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}
