use std::sync::Arc;

use skriuw_ai_remote::{RemoteAiProvider, RemoteProviderKind, remote_ai_catalog};
use skriuw_domain::{
    AI_RUN_ORIGIN_PLAYGROUND, AiCompletionEvent, AiCompletionRequest, AiHistorySettings,
    AiHistoryView, AiProviderError, AiProviderErrorCategory, AiRecoveryAction, AiRunFilter,
    CredentialVaultDetection, LocalAiError, LocalAiModel, LocalAiProgress, LocalAiStatus,
    MAX_AI_IDENTIFIER_BYTES, RemoteAiCatalog, RemoteAiKeyTier, RemoteAiModelDirectory,
    RemoteAiProviderState,
};
use tauri::{State, ipc::Channel};

use crate::state::AppState;

/// `origin` is the feature that fired the request — the prompt playground
/// today, an editor action id later. It is validated here so renderer text
/// cannot become a synthetic origin in the local history.
#[tauri::command]
pub fn start_ai_completion(
    request: AiCompletionRequest,
    origin: Option<String>,
    on_event: Channel<AiCompletionEvent>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let origin = origin.unwrap_or_else(|| AI_RUN_ORIGIN_PLAYGROUND.to_owned());
    if origin.is_empty()
        || origin.len() > MAX_AI_IDENTIFIER_BYTES
        || !origin.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':' | b'/')
        })
    {
        return Err("AI request origin is not a usable identifier".to_owned());
    }
    state.ai.start(origin, request, on_event)
}

#[tauri::command]
pub async fn ai_run_history(
    filter: Option<AiRunFilter>,
    since_ms: i64,
    state: State<'_, AppState>,
) -> Result<AiHistoryView, String> {
    let history = Arc::clone(state.ai.history());
    let filter = filter.unwrap_or_default();
    let pricing_as_of = remote_ai_catalog()
        .ok()
        .map(|catalog| catalog.pricing_as_of);
    tauri::async_runtime::spawn_blocking(move || history.view(&filter, since_ms, pricing_as_of))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn ai_history_settings(state: State<'_, AppState>) -> Result<AiHistorySettings, String> {
    let history = Arc::clone(state.ai.history());
    tauri::async_runtime::spawn_blocking(move || history.settings())
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn set_ai_history_settings(
    settings: AiHistorySettings,
    state: State<'_, AppState>,
) -> Result<AiHistorySettings, String> {
    let history = Arc::clone(state.ai.history());
    tauri::async_runtime::spawn_blocking(move || history.set_settings(settings))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn clear_ai_run_history(state: State<'_, AppState>) -> Result<u32, String> {
    let history = Arc::clone(state.ai.history());
    tauri::async_runtime::spawn_blocking(move || history.clear())
        .await
        .map_err(|error| error.to_string())?
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
pub async fn stop_ollama_runtime(
    state: State<'_, AppState>,
) -> Result<LocalAiStatus, LocalAiError> {
    let ollama = Arc::clone(&state.ollama);
    run(move || ollama.stop()).await
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

#[tauri::command]
pub fn remote_ai_providers(state: State<'_, AppState>) -> Vec<RemoteAiProviderState> {
    state.ai_credentials.provider_states()
}

#[tauri::command]
pub fn credential_vault_state(state: State<'_, AppState>) -> CredentialVaultDetection {
    state.ai_credentials.detect_vault()
}

/// The catalog is a repository-owned document, so refreshing it re-reads the
/// embedded copy instead of asking a provider what it offers.
#[tauri::command]
pub fn remote_ai_catalogue() -> Result<RemoteAiCatalog, AiProviderError> {
    remote_ai_catalog().map_err(|error| {
        AiProviderError::new(
            "remote",
            AiProviderErrorCategory::InternalFailure,
            &error.to_string(),
            AiRecoveryAction::None,
        )
    })
}

/// The shipped catalog merged with every model the user has fetched from a
/// provider. Reading it never reaches the network.
#[tauri::command]
pub fn remote_ai_models(state: State<'_, AppState>) -> Result<RemoteAiModelDirectory, AiProviderError> {
    state.ai_models.directory()
}

/// Asks one provider which models the stored key can reach and records the
/// answer on this device. Sends the key but spends no tokens; runs only from
/// the explicit "Refresh models" action, and the credential resolve refuses an
/// unconsented or keyless provider before any socket opens.
#[tauri::command]
pub async fn refresh_remote_ai_models(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<RemoteAiModelDirectory, AiProviderError> {
    let kind = remote_provider(&provider_id)?;
    let credentials = Arc::clone(&state.ai_credentials);
    let models = Arc::clone(&state.ai_models);
    tauri::async_runtime::spawn_blocking(move || {
        let provider = RemoteAiProvider::new(kind, credentials).map_err(|error| {
            AiProviderError::new(
                kind.id(),
                AiProviderErrorCategory::TransportFailure,
                &error.to_string(),
                AiRecoveryAction::Retry,
            )
        })?;
        let fetched = provider.list_models()?;
        models.replace(kind.id(), fetched, crate::state::now_millis())?;
        models.directory()
    })
    .await
    .map_err(|error| {
        AiProviderError::new(
            kind.id(),
            AiProviderErrorCategory::InternalFailure,
            &error.to_string(),
            AiRecoveryAction::Retry,
        )
    })?
}

#[tauri::command]
pub fn save_remote_ai_key(
    provider_id: String,
    key: String,
    tier: RemoteAiKeyTier,
    state: State<'_, AppState>,
) -> Result<Vec<RemoteAiProviderState>, AiProviderError> {
    let kind = remote_provider(&provider_id)?;
    state.ai_credentials.save_key(kind, &key, tier)?;
    Ok(state.ai_credentials.provider_states())
}

#[tauri::command]
pub fn remove_remote_ai_key(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<RemoteAiProviderState>, AiProviderError> {
    let kind = remote_provider(&provider_id)?;
    state.ai_credentials.remove_key(kind)?;
    Ok(state.ai_credentials.provider_states())
}

#[tauri::command]
pub fn accept_remote_ai_disclosure(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<RemoteAiProviderState>, AiProviderError> {
    let kind = remote_provider(&provider_id)?;
    state.ai_credentials.grant_consent(kind)?;
    Ok(state.ai_credentials.provider_states())
}

#[tauri::command]
pub fn revoke_remote_ai_provider(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<RemoteAiProviderState>, AiProviderError> {
    let kind = remote_provider(&provider_id)?;
    state.ai_credentials.revoke_consent(kind)?;
    Ok(state.ai_credentials.provider_states())
}

/// Spends one key on the smallest metered request the provider offers. This
/// runs only from the explicit "Test key" action, never on startup or when the
/// settings surface opens.
#[tauri::command]
pub async fn verify_remote_ai_key(
    provider_id: String,
    model_id: String,
    key: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AiProviderError> {
    let kind = remote_provider(&provider_id)?;
    let credentials = Arc::clone(&state.ai_credentials);
    let models = Arc::clone(&state.ai_models);
    tauri::async_runtime::spawn_blocking(move || {
        let credential = credentials.take_key_for_verification(kind, key)?;
        let provider = RemoteAiProvider::with_model_authority(kind, credentials, models)
            .map_err(|error| {
            AiProviderError::new(
                kind.id(),
                AiProviderErrorCategory::TransportFailure,
                &error.to_string(),
                AiRecoveryAction::Retry,
            )
        })?;
        provider.verify_credential(&model_id, &credential)
    })
    .await
    .map_err(|error| {
        AiProviderError::new(
            kind.id(),
            AiProviderErrorCategory::InternalFailure,
            &error.to_string(),
            AiRecoveryAction::Retry,
        )
    })?
}

/// An unrecognised provider id is never echoed back: it would put renderer-sent
/// text into an error the settings surface renders.
fn remote_provider(provider_id: &str) -> Result<RemoteProviderKind, AiProviderError> {
    RemoteProviderKind::from_id(provider_id).ok_or_else(|| {
        AiProviderError::new(
            "remote",
            AiProviderErrorCategory::UnavailableProvider,
            "Skriuw does not ship an adapter for that provider.",
            AiRecoveryAction::None,
        )
    })
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
