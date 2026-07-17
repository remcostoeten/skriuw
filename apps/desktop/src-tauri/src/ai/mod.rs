//! Desktop AI: local-first inference via a managed Ollama runtime, with Groq
//! and Gemini as optional cloud providers. Configuration (provider, models, and
//! legacy API keys) lives in the same `settings.json` as the vault root. The web app's
//! editor actions route here through the `ai_complete` and `ai_complete_stream`
//! commands.

mod cloud;
mod installer;
mod ollama;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::settings::SettingsStore;

pub use installer::{
    stop_managed_server, OllamaInstallEvent, OllamaInstallStatus, DEFAULT_ENDPOINT,
};
pub use ollama::{OllamaCatalogEntry, OllamaPullEvent};

static INSTALL_CANCEL: AtomicBool = AtomicBool::new(false);
static PULL_CANCEL: AtomicBool = AtomicBool::new(false);
static STREAM_CANCEL: AtomicBool = AtomicBool::new(false);

const DEFAULT_GROQ_MODEL: &str = "llama-3.3-70b-versatile";
const DEFAULT_GEMINI_MODEL: &str = "gemini-2.5-flash";
const DEFAULT_OLLAMA_MODEL: &str = "llama3.2";

/// The non-secret AI configuration surfaced to the settings UI. API keys are
/// never returned — only whether each provider has one stored.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub provider: String,
    pub ollama_endpoint: String,
    pub ollama_model: String,
    pub groq_model: String,
    pub gemini_model: String,
    pub has_groq_key: bool,
    pub has_gemini_key: bool,
}

/// Partial update from the settings UI — every field is optional so a single
/// control can patch one value without clobbering the rest.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigPatch {
    pub provider: Option<String>,
    pub ollama_endpoint: Option<String>,
    pub ollama_model: Option<String>,
    pub groq_model: Option<String>,
    pub gemini_model: Option<String>,
}

fn configured(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn load_config(settings: &SettingsStore) -> Result<AiConfig, String> {
    let snapshot = settings.snapshot().map_err(|error| error.to_string())?;
    Ok(AiConfig {
        provider: configured(snapshot.ai.provider.as_deref())
            .unwrap_or_else(|| "ollama".to_string()),
        ollama_endpoint: configured(snapshot.ai.ollama_endpoint.as_deref())
            .unwrap_or_else(|| DEFAULT_ENDPOINT.to_string()),
        ollama_model: configured(snapshot.ai.ollama_model.as_deref())
            .unwrap_or_else(|| DEFAULT_OLLAMA_MODEL.to_string()),
        groq_model: configured(snapshot.ai.groq_model.as_deref())
            .unwrap_or_else(|| DEFAULT_GROQ_MODEL.to_string()),
        gemini_model: configured(snapshot.ai.gemini_model.as_deref())
            .unwrap_or_else(|| DEFAULT_GEMINI_MODEL.to_string()),
        has_groq_key: settings
            .legacy_ai_secret("groqApiKey")
            .map_err(|error| error.to_string())?
            .is_some(),
        has_gemini_key: settings
            .legacy_ai_secret("geminiApiKey")
            .map_err(|error| error.to_string())?
            .is_some(),
    })
}

fn legacy_key(settings: &SettingsStore, field: &str) -> Result<String, String> {
    Ok(settings
        .legacy_ai_secret(field)
        .map_err(|error| error.to_string())?
        .unwrap_or_default())
}

fn ollama_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("resolve local data dir: {error}"))?;
    Ok(dir.join("ollama"))
}

// The prompt catalog is shared with the web app — apps/web/src/domain/ai/
// prompts.json is the single source of truth for both platforms.
const PROMPTS_JSON: &str = include_str!("../../../../web/src/domain/ai/prompts.json");

#[derive(Debug, Deserialize)]
struct PromptCatalog {
    rules: PromptRules,
    translate: TranslateDirectives,
    actions: std::collections::HashMap<String, PromptSpec>,
}

#[derive(Debug, Deserialize)]
struct TranslateDirectives {
    auto: String,
    target: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct PromptRules {
    preserve_tokens_rule: String,
    match_language_rule: String,
    no_meta_rule: String,
    voice_rule: String,
}

#[derive(Debug, Deserialize)]
struct PromptSpec {
    system: String,
    user: String,
}

static PROMPT_CATALOG: OnceLock<PromptCatalog> = OnceLock::new();

fn prompt_catalog() -> &'static PromptCatalog {
    PROMPT_CATALOG.get_or_init(|| serde_json::from_str(PROMPTS_JSON).expect("invalid prompts.json"))
}

/// Mirrors the web-side sanitizer: a short plain language name, nothing that
/// can smuggle extra prompt instructions. `None`/"auto"/invalid → heuristic.
fn sanitize_target_language(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("auto") {
        return None;
    }
    let valid_len = (2..=40).contains(&trimmed.chars().count());
    let valid_start = trimmed.chars().next().is_some_and(char::is_alphabetic);
    let valid_chars = trimmed
        .chars()
        .all(|c| c.is_alphabetic() || c == ' ' || c == '\'' || c == '-');
    (valid_len && valid_start && valid_chars).then(|| trimmed.to_string())
}

fn prompt_for(
    action: &str,
    content: &str,
    target_language: Option<&str>,
    instruction: Option<&str>,
) -> Result<(String, String), String> {
    let catalog = prompt_catalog();
    let spec = catalog
        .actions
        .get(action)
        .ok_or_else(|| format!("Unsupported AI action: {action}"))?;
    let translate_directive = match sanitize_target_language(target_language) {
        Some(language) => catalog
            .translate
            .target
            .replace("{targetLanguage}", &language),
        None => catalog.translate.auto.clone(),
    };
    let user = spec
        .user
        .replace("{matchLanguageRule}", &catalog.rules.match_language_rule)
        .replace("{preserveTokensRule}", &catalog.rules.preserve_tokens_rule)
        .replace("{translateDirective}", &translate_directive)
        .replace("{instruction}", instruction.unwrap_or_default())
        .replacen("{content}", content, 1);
    Ok((spec.system.clone(), user))
}

#[tauri::command]
pub fn ai_get_config(settings: State<'_, SettingsStore>) -> Result<AiConfig, String> {
    load_config(&settings)
}

#[tauri::command]
pub fn ai_set_config(
    settings: State<'_, SettingsStore>,
    patch: AiConfigPatch,
) -> Result<AiConfig, String> {
    settings
        .update(|current| {
            if let Some(value) = patch.provider {
                current.ai.provider = Some(value);
            }
            if let Some(value) = patch.ollama_endpoint {
                current.ai.ollama_endpoint = Some(value);
            }
            if let Some(value) = patch.ollama_model {
                current.ai.ollama_model = Some(value);
            }
            if let Some(value) = patch.groq_model {
                current.ai.groq_model = Some(value);
            }
            if let Some(value) = patch.gemini_model {
                current.ai.gemini_model = Some(value);
            }
            Ok(())
        })
        .map_err(|error| error.to_string())?;
    load_config(&settings)
}

/// Stores a provider API key. `provider` is "groq" or "gemini"; an empty value
/// clears the stored key.
#[tauri::command]
pub fn ai_set_key(
    settings: State<'_, SettingsStore>,
    provider: String,
    key: String,
) -> Result<AiConfig, String> {
    let field = match provider.as_str() {
        "groq" => "groqApiKey",
        "gemini" | "google" => "geminiApiKey",
        other => return Err(format!("Unknown AI provider: {other}")),
    };
    let trimmed = key.trim();
    settings
        .set_legacy_ai_secret(field, (!trimmed.is_empty()).then(|| trimmed.to_string()))
        .map_err(|error| error.to_string())?;
    load_config(&settings)
}

#[tauri::command]
pub async fn ai_complete(
    settings: State<'_, SettingsStore>,
    action: String,
    content: String,
    target_language: Option<String>,
    instruction: Option<String>,
) -> Result<String, String> {
    if content.trim().is_empty() {
        return Err("There is no note content to send to AI.".to_string());
    }
    let (system, user) = prompt_for(
        &action,
        &content,
        target_language.as_deref(),
        instruction.as_deref(),
    )?;
    let config = load_config(&settings)?;

    let result = match config.provider.as_str() {
        "groq" => {
            let key = legacy_key(&settings, "groqApiKey")?;
            cloud::groq_complete(&key, &config.groq_model, &system, &user).await?
        }
        "gemini" | "google" => {
            let key = legacy_key(&settings, "geminiApiKey")?;
            cloud::gemini_complete(&key, &config.gemini_model, &system, &user).await?
        }
        _ => {
            let client = ollama::OllamaClient::new(config.ollama_endpoint.clone());
            client
                .complete(&config.ollama_model, &system, &user)
                .await?
        }
    };
    Ok(result.trim().to_string())
}

/// Streaming variant of `ai_complete` used by continue-writing and the custom
/// prompt action: every text delta is sent over `on_chunk` as it arrives, and
/// the full accumulated result is returned when the provider finishes — or
/// when `ai_cancel_ai_stream` is called, in which case the partial text
/// accumulated so far is returned instead of an error.
#[tauri::command]
pub async fn ai_complete_stream(
    settings: State<'_, SettingsStore>,
    action: String,
    content: String,
    target_language: Option<String>,
    instruction: Option<String>,
    on_chunk: Channel<String>,
) -> Result<String, String> {
    if content.trim().is_empty() {
        return Err("There is no note content to send to AI.".to_string());
    }
    let (system, user) = prompt_for(
        &action,
        &content,
        target_language.as_deref(),
        instruction.as_deref(),
    )?;
    let config = load_config(&settings)?;

    STREAM_CANCEL.store(false, Ordering::Relaxed);
    let cancel = Arc::new(AtomicBool::new(false));
    let mirror = cancel.clone();
    tauri::async_runtime::spawn(async move {
        while !mirror.load(Ordering::Relaxed) {
            if STREAM_CANCEL.load(Ordering::Relaxed) {
                mirror.store(true, Ordering::Relaxed);
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        }
    });

    let emit = |chunk: &str| {
        let _ = on_chunk.send(chunk.to_string());
    };

    let result = match config.provider.as_str() {
        "groq" => {
            let key = legacy_key(&settings, "groqApiKey")?;
            cloud::groq_complete_stream(&key, &config.groq_model, &system, &user, emit, cancel)
                .await?
        }
        "gemini" | "google" => {
            let key = legacy_key(&settings, "geminiApiKey")?;
            cloud::gemini_complete_stream(&key, &config.gemini_model, &system, &user, emit, cancel)
                .await?
        }
        _ => {
            let client = ollama::OllamaClient::new(config.ollama_endpoint.clone());
            client
                .complete_stream(&config.ollama_model, &system, &user, emit, cancel)
                .await?
        }
    };
    Ok(result.trim().to_string())
}

#[tauri::command]
pub fn ai_cancel_ai_stream() {
    STREAM_CANCEL.store(true, Ordering::Relaxed);
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPingResult {
    pub provider: String,
    pub model: String,
    pub ok: bool,
    pub latency_ms: u64,
    pub message: String,
}

/// Sends a minimal "ping" completion to the active provider/model and reports
/// whether it responded, so settings can show a live connectivity check.
#[tauri::command]
pub async fn ai_ping(settings: State<'_, SettingsStore>) -> Result<AiPingResult, String> {
    let config = load_config(&settings)?;
    let system = "Reply with exactly one word: pong.";
    let user = "ping";
    let model = match config.provider.as_str() {
        "groq" => config.groq_model.clone(),
        "gemini" | "google" => config.gemini_model.clone(),
        _ => config.ollama_model.clone(),
    };

    let started = std::time::Instant::now();
    let result = match config.provider.as_str() {
        "groq" => {
            let key = legacy_key(&settings, "groqApiKey")?;
            cloud::groq_complete(&key, &config.groq_model, system, user).await
        }
        "gemini" | "google" => {
            let key = legacy_key(&settings, "geminiApiKey")?;
            cloud::gemini_complete(&key, &config.gemini_model, system, user).await
        }
        _ => {
            let client = ollama::OllamaClient::new(config.ollama_endpoint.clone());
            client.complete(&config.ollama_model, system, user).await
        }
    };
    let latency_ms = started.elapsed().as_millis() as u64;

    Ok(match result {
        Ok(text) => AiPingResult {
            provider: config.provider,
            model,
            ok: true,
            latency_ms,
            message: text.trim().to_string(),
        },
        Err(error) => AiPingResult {
            provider: config.provider,
            model,
            ok: false,
            latency_ms,
            message: error,
        },
    })
}

#[tauri::command]
pub async fn ai_ollama_status(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
) -> Result<OllamaInstallStatus, String> {
    let root = ollama_root(&app)?;
    let config = load_config(&settings)?;
    Ok(installer::get_install_status(&root, &config.ollama_endpoint).await)
}

#[tauri::command]
pub async fn ai_ollama_catalog(
    settings: State<'_, SettingsStore>,
) -> Result<Vec<OllamaCatalogEntry>, String> {
    let config = load_config(&settings)?;
    ollama::OllamaClient::new(config.ollama_endpoint)
        .list_catalog()
        .await
}

#[tauri::command]
pub async fn ai_start_ollama(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
) -> Result<(), String> {
    let root = ollama_root(&app)?;
    let config = load_config(&settings)?;
    installer::start_managed_server(&root, &config.ollama_endpoint).await
}

#[tauri::command]
pub async fn ai_install_ollama(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
    on_event: Channel<OllamaInstallEvent>,
) -> Result<(), String> {
    let root = ollama_root(&app)?;
    let config = load_config(&settings)?;
    INSTALL_CANCEL.store(false, Ordering::Relaxed);
    let cancel = Arc::new(AtomicBool::new(false));
    let mirror = cancel.clone();
    tauri::async_runtime::spawn(async move {
        while !mirror.load(Ordering::Relaxed) {
            if INSTALL_CANCEL.load(Ordering::Relaxed) {
                mirror.store(true, Ordering::Relaxed);
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
    });

    let outcome =
        installer::install_managed(root, config.ollama_endpoint, on_event.clone(), cancel).await;
    if let Err(message) = &outcome {
        let _ = on_event.send(OllamaInstallEvent::Error {
            message: message.clone(),
        });
    }
    outcome
}

#[tauri::command]
pub fn ai_cancel_ollama_install() {
    INSTALL_CANCEL.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub async fn ai_pull_ollama_model(
    settings: State<'_, SettingsStore>,
    model: String,
    on_event: Channel<OllamaPullEvent>,
) -> Result<(), String> {
    let config = load_config(&settings)?;
    PULL_CANCEL.store(false, Ordering::Relaxed);
    let cancel = Arc::new(AtomicBool::new(false));
    let mirror = cancel.clone();
    tauri::async_runtime::spawn(async move {
        while !mirror.load(Ordering::Relaxed) {
            if PULL_CANCEL.load(Ordering::Relaxed) {
                mirror.store(true, Ordering::Relaxed);
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
    });

    let client = ollama::OllamaClient::new(config.ollama_endpoint);
    client.pull_model(&model, on_event, cancel).await
}

#[tauri::command]
pub fn ai_cancel_ollama_pull() {
    PULL_CANCEL.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub async fn ai_delete_ollama_model(
    settings: State<'_, SettingsStore>,
    model: String,
) -> Result<(), String> {
    let config = load_config(&settings)?;
    ollama::OllamaClient::new(config.ollama_endpoint)
        .delete_model(&model)
        .await
}

/// Best-effort: if a managed Ollama is already installed, start it in the
/// background at launch so the first AI action doesn't pay the cold-start.
pub fn autostart_managed(app: &AppHandle, settings: &SettingsStore) {
    let Ok(root) = ollama_root(app) else {
        return;
    };
    if !installer::managed_install_exists(&root) {
        return;
    }
    let Ok(config) = load_config(settings) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        let _ = installer::start_managed_server(&root, &config.ollama_endpoint).await;
    });
}
