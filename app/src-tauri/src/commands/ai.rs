use std::sync::Arc;

use skriuw_domain::{
    AiCompletionEvent, AiCompletionRequest, LocalAiError, LocalAiModel, LocalAiProgress,
    LocalAiStatus,
};
use tauri::{State, ipc::Channel};

use crate::state::AppState;

#[tauri::command]
pub fn start_ai_completion(
    request: AiCompletionRequest,
    on_event: Channel<AiCompletionEvent>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.ai.start(request, on_event)
}

#[tauri::command]
pub fn cancel_ai_completion(request_id: String, state: State<'_, AppState>) -> bool {
    state.ai.cancel(&request_id)
}

#[tauri::command]
pub async fn ollama_runtime_status(
    state: State<'_, AppState>,
) -> Result<LocalAiStatus, LocalAiError> {
    let ollama = Arc::clone(&state.ollama);
    run(move || ollama.status()).await
}

#[tauri::command]
pub async fn start_ollama_runtime(
    state: State<'_, AppState>,
) -> Result<LocalAiStatus, LocalAiError> {
    let ollama = Arc::clone(&state.ollama);
    run(move || ollama.start()).await
}

#[tauri::command]
pub async fn install_ollama_runtime(
    operation_id: String,
    on_event: Channel<LocalAiProgress>,
    state: State<'_, AppState>,
) -> Result<LocalAiStatus, LocalAiError> {
    let ollama = Arc::clone(&state.ollama);
    run(move || ollama.install(operation_id, on_event)).await
}

#[tauri::command]
pub async fn list_ollama_models(
    state: State<'_, AppState>,
) -> Result<Vec<LocalAiModel>, LocalAiError> {
    let ollama = Arc::clone(&state.ollama);
    run(move || ollama.list_models()).await
}

#[tauri::command]
pub async fn pull_ollama_model(
    operation_id: String,
    model: String,
    on_event: Channel<LocalAiProgress>,
    state: State<'_, AppState>,
) -> Result<(), LocalAiError> {
    let ollama = Arc::clone(&state.ollama);
    run(move || ollama.pull_model(operation_id, model, on_event)).await
}

#[tauri::command]
pub fn cancel_ollama_operation(operation_id: String, state: State<'_, AppState>) -> bool {
    state.ollama.cancel(&operation_id)
}

#[tauri::command]
pub async fn delete_ollama_model(
    model: String,
    state: State<'_, AppState>,
) -> Result<(), LocalAiError> {
    let ollama = Arc::clone(&state.ollama);
    run(move || ollama.remove_model(&model)).await
}

async fn run<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, LocalAiError> + Send + 'static,
) -> Result<T, LocalAiError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| {
            LocalAiError::new(
                skriuw_domain::LocalAiErrorCategory::ProcessFailed,
                error.to_string(),
            )
        })?
}
