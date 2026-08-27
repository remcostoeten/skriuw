use crate::state::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn workspace_sync_status(state: State<'_, AppState>) -> skriuw_sync::SyncStatus {
    state.sync.status()
}

#[tauri::command]
pub async fn connect_workspace_sync(
    token: String,
    state: State<'_, AppState>,
) -> Result<skriuw_sync::SyncStatus, String> {
    let sync = Arc::clone(&state.sync);
    tauri::async_runtime::spawn_blocking(move || sync.connect(token))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn disconnect_workspace_sync(state: State<'_, AppState>) -> skriuw_sync::SyncStatus {
    state.sync.pause_for_logout()
}

#[tauri::command]
pub fn retry_workspace_sync(state: State<'_, AppState>) -> skriuw_sync::SyncStatus {
    state.sync.request_refresh();
    state.sync.status()
}

#[tauri::command]
pub fn refresh_workspace_sync(state: State<'_, AppState>) -> skriuw_sync::SyncStatus {
    state.sync.request_refresh();
    state.sync.status()
}

#[tauri::command]
pub async fn list_blocked_sync_operations(
    state: State<'_, AppState>,
) -> Result<skriuw_domain::SyncRecoveryView, String> {
    let sync = Arc::clone(&state.sync);
    tauri::async_runtime::spawn_blocking(move || sync.recovery_view())
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn retry_blocked_sync_operation(
    blocked_id: String,
    state: State<'_, AppState>,
) -> Result<skriuw_domain::SyncRecoveryView, String> {
    let sync = Arc::clone(&state.sync);
    tauri::async_runtime::spawn_blocking(move || sync.retry_blocked_operation(&blocked_id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn discard_blocked_sync_operation(
    blocked_id: String,
    state: State<'_, AppState>,
) -> Result<skriuw_domain::SyncRecoveryView, String> {
    let sync = Arc::clone(&state.sync);
    tauri::async_runtime::spawn_blocking(move || sync.discard_blocked_operation(&blocked_id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn list_sync_conflicts(
    state: State<'_, AppState>,
) -> Result<skriuw_domain::SyncConflictReviewView, String> {
    let sync = Arc::clone(&state.sync);
    tauri::async_runtime::spawn_blocking(move || sync.conflict_review())
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn read_sync_conflict_versions(
    conflict_id: String,
    state: State<'_, AppState>,
) -> Result<skriuw_domain::DocumentConflictVersionsView, String> {
    let sync = Arc::clone(&state.sync);
    tauri::async_runtime::spawn_blocking(move || sync.conflict_versions(&conflict_id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn resolve_sync_conflict(
    request: skriuw_domain::ResolveDocumentConflict,
    state: State<'_, AppState>,
) -> Result<skriuw_domain::SyncConflictReviewView, String> {
    let sync = Arc::clone(&state.sync);
    tauri::async_runtime::spawn_blocking(move || sync.resolve_conflict(&request))
        .await
        .map_err(|error| error.to_string())?
}
