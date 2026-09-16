use crate::state::{AppState, now_millis, wait_for, workspace_runtime};
use skriuw_domain::{
    NOTE_LOCK_CONFIGURE_ENTROPY_BYTES, NoteLockKind, NoteLockState, OperationAck,
    WorkspaceDocument,
};
use skriuw_storage::{ConfigureNoteLockRequest, ReplaceNoteLockSecretRequest};
use tauri::State;

#[tauri::command]
pub async fn note_lock_state(state: State<'_, AppState>) -> Result<NoteLockState, String> {
    let now = now_millis();
    let completion = workspace_runtime(&state)?
        .note_lock(move |lock| lock.note_lock_state(now))
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn configure_note_lock(
    kind: NoteLockKind,
    secret: String,
    hint: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let mut entropy = zeroize::Zeroizing::new(vec![0_u8; NOTE_LOCK_CONFIGURE_ENTROPY_BYTES]);
    getrandom::fill(entropy.as_mut_slice())
        .map_err(|error| format!("could not gather randomness for the note lock: {error}"))?;
    let request = ConfigureNoteLockRequest {
        kind,
        secret,
        hint,
        entropy: entropy.to_vec(),
    };
    let now = now_millis();
    let completion = workspace_runtime(&state)?
        .note_lock(move |lock| lock.configure_note_lock(request, now))
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn unlock_note_lock(
    secret: String,
    state: State<'_, AppState>,
) -> Result<NoteLockState, String> {
    let now = now_millis();
    let completion = workspace_runtime(&state)?
        .note_lock(move |lock| lock.unlock_note_lock(&secret, now))
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn recover_note_lock(
    recovery_code: String,
    kind: NoteLockKind,
    secret: String,
    hint: Option<String>,
    state: State<'_, AppState>,
) -> Result<NoteLockState, String> {
    let now = now_millis();
    let request = ReplaceNoteLockSecretRequest { kind, secret, hint };
    let completion = workspace_runtime(&state)?
        .note_lock(move |lock| lock.recover_note_lock(&recovery_code, request, now))
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn change_note_lock_secret(
    kind: NoteLockKind,
    secret: String,
    hint: Option<String>,
    state: State<'_, AppState>,
) -> Result<NoteLockState, String> {
    let now = now_millis();
    let request = ReplaceNoteLockSecretRequest { kind, secret, hint };
    let completion = workspace_runtime(&state)?
        .note_lock(move |lock| lock.change_note_lock_secret(request, now))
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn relock_note_lock(state: State<'_, AppState>) -> Result<NoteLockState, String> {
    let completion = workspace_runtime(&state)?
        .note_lock(|lock| lock.relock_note_lock())
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn read_locked_documents(
    note_ids: Option<Vec<String>>,
    state: State<'_, AppState>,
) -> Result<Vec<WorkspaceDocument>, String> {
    let completion = workspace_runtime(&state)?
        .note_lock(move |lock| lock.read_locked_documents(note_ids.as_deref()))
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}

#[tauri::command]
pub async fn remove_note_lock(state: State<'_, AppState>) -> Result<OperationAck, String> {
    let now = now_millis();
    let completion = workspace_runtime(&state)?
        .note_lock(move |lock| lock.remove_note_lock(now))
        .map_err(|error| error.to_string())?;
    wait_for(completion).await
}
