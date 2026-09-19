use crate::state::{AppState, storage_base};
use crate::workspace_slots::{self, SlotAdoption};
use std::{env, sync::Arc};
use tauri::{Manager, State};

#[tauri::command]
pub fn workspace_sync_status(state: State<'_, AppState>) -> skriuw_sync::SyncStatus {
    state.sync.status()
}

#[tauri::command]
pub async fn connect_workspace_sync(
    token: String,
    base_url: String,
    state: State<'_, AppState>,
) -> Result<skriuw_sync::SyncStatus, String> {
    let sync = Arc::clone(&state.sync);
    tauri::async_runtime::spawn_blocking(move || sync.connect(token, base_url))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn set_workspace_sync_online(online: bool, state: State<'_, AppState>) {
    state.sync.set_online(online);
}

#[tauri::command]
pub fn set_workspace_sync_visibility(visible: bool, focused: bool, state: State<'_, AppState>) {
    state.sync.set_visibility(visible, focused);
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
pub async fn workspace_encryption_state(
    state: State<'_, AppState>,
) -> Result<crate::sync::WorkspaceEncryptionState, String> {
    let sync = Arc::clone(&state.sync);
    tauri::async_runtime::spawn_blocking(move || sync.encryption_state())
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn enable_workspace_encryption(state: State<'_, AppState>) -> Result<String, String> {
    let sync = Arc::clone(&state.sync);
    tauri::async_runtime::spawn_blocking(move || sync.enable_encryption())
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn unlock_workspace_encryption(
    recovery_code: String,
    state: State<'_, AppState>,
) -> Result<crate::sync::WorkspaceEncryptionState, String> {
    let sync = Arc::clone(&state.sync);
    tauri::async_runtime::spawn_blocking(move || {
        sync.unlock_encryption(&recovery_code)?;
        sync.encryption_state()
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Points this installation at the signed-in account's own local workspace.
///
/// Called before sync connects, so an account that does not own the running
/// workspace is routed to its own instead of colliding with the sync guard.
/// A switch restarts the process and therefore never returns; every other
/// outcome is reported so the caller can continue signing in.
#[tauri::command]
pub async fn adopt_workspace_slot(
    workspace_id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<SlotAdoption, String> {
    // A pinned database is a fixed single workspace by definition: tests and
    // packaging runs must never be restarted into a different directory.
    if env::var_os("SKRIUW_DB").is_some() {
        return Ok(SlotAdoption::Active);
    }
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let base = storage_base(&data_dir)?;
    let sync = Arc::clone(&state.sync);
    let adoption = tauri::async_runtime::spawn_blocking(move || {
        let linked = sync.linked_workspace_id()?;
        workspace_slots::adopt(&data_dir, &base, &workspace_id, linked.as_deref())
    })
    .await
    .map_err(|error| error.to_string())??;
    if adoption != SlotAdoption::Switched {
        return Ok(adoption);
    }
    state.sync.shutdown();
    state.maintenance.shutdown();
    app.restart()
}

/// Cloud workspace that owns the running local store, or `null` while it is
/// still unclaimed. Surfaces read it to explain which account's notes are open.
#[tauri::command]
pub fn active_workspace_slot(app: tauri::AppHandle) -> Result<Option<String>, String> {
    if env::var_os("SKRIUW_DB").is_some() {
        return Ok(None);
    }
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(workspace_slots::active_workspace_id(&data_dir))
}
