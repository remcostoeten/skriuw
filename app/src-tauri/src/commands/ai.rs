use skriuw_domain::{AiCompletionEvent, AiCompletionRequest};
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
