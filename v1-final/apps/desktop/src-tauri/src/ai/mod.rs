//! Desktop AI: local-first inference via a managed Ollama runtime, with Groq
//! and Gemini as optional cloud providers. Non-secret configuration (provider
//! and models) lives in the same `settings.json` as the vault root; provider
//! API keys live in the OS credential store (see `credentials.rs`, DH-03) and
//! never touch `settings.json`, snapshots, or logs. The web app's editor
//! actions route here through the `ai_complete` and `ai_complete_stream`
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

use crate::credentials::{
    migrate_legacy_secret, CredentialProvider, CredentialState, CredentialStore, MigrationOutcome,
    SecretString,
};
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

/// Per-provider key status surfaced to the settings UI. The secret value is
/// never returned — only which of these states the provider is in.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KeyState {
    /// A key is stored securely in the OS credential store.
    Present,
    /// No key is stored and none is pending.
    Missing,
    /// A legacy plaintext key exists but could not be moved to secure storage
    /// yet (store unavailable/locked); the plaintext is NOT used for cloud AI.
    MigrationPending,
    /// The OS credential store is unavailable, so cloud AI is disabled.
    Unavailable,
}

/// The non-secret AI configuration surfaced to the settings UI. API keys are
/// never returned — only each provider's [`KeyState`].
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
    pub groq_key_state: KeyState,
    pub gemini_key_state: KeyState,
    pub cloud_consent: bool,
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
    pub cloud_consent: Option<bool>,
}

fn configured(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

/// Computes a provider's [`KeyState`] from the secure store plus any leftover
/// legacy plaintext, without ever reading the secret value into a return type.
fn key_state(
    creds: &dyn CredentialStore,
    settings: &SettingsStore,
    provider: CredentialProvider,
) -> KeyState {
    let legacy_present = settings
        .legacy_ai_secret(provider.legacy_field())
        .ok()
        .flatten()
        .is_some();
    match creds.get(provider) {
        Ok(Some(_)) => KeyState::Present,
        Ok(None) => {
            if legacy_present {
                KeyState::MigrationPending
            } else {
                KeyState::Missing
            }
        }
        Err(crate::credentials::CredentialError::Unavailable(_)) => {
            if legacy_present {
                KeyState::MigrationPending
            } else {
                KeyState::Unavailable
            }
        }
        Err(_) => KeyState::Unavailable,
    }
}

fn load_config(settings: &SettingsStore, creds: &dyn CredentialStore) -> Result<AiConfig, String> {
    let snapshot = settings.snapshot().map_err(|error| error.to_string())?;
    let groq_key_state = key_state(creds, settings, CredentialProvider::Groq);
    let gemini_key_state = key_state(creds, settings, CredentialProvider::Gemini);
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
        has_groq_key: groq_key_state == KeyState::Present,
        has_gemini_key: gemini_key_state == KeyState::Present,
        groq_key_state,
        gemini_key_state,
        cloud_consent: snapshot.ai.cloud_consent,
    })
}

/// Fetches a provider's secret for an outgoing cloud call. A missing or
/// unavailable key is a hard error that points the user at local Ollama —
/// after DH-03 there is no plaintext fallback. The returned [`SecretString`] is
/// dropped as soon as the request is built.
fn require_secret(
    creds: &dyn CredentialStore,
    provider: CredentialProvider,
) -> Result<SecretString, String> {
    match creds.get(provider) {
        Ok(Some(secret)) => Ok(secret),
        Ok(None) => Err(
            "No API key is stored for this cloud provider. Add one in AI settings, \
			 or switch to local Ollama."
                .to_string(),
        ),
        Err(error) => Err(error.to_string()),
    }
}

/// Migrates both providers' legacy plaintext keys into the OS store and removes
/// the plaintext only once a secure copy is verified. Idempotent and safe to
/// re-run on every launch. Never logs a key value.
pub fn migrate_legacy_secrets(settings: &SettingsStore, creds: &dyn CredentialStore) {
    for provider in [CredentialProvider::Groq, CredentialProvider::Gemini] {
        let legacy = settings
            .legacy_ai_secret(provider.legacy_field())
            .ok()
            .flatten();
        let outcome = migrate_legacy_secret(creds, provider, legacy.as_deref());
        if outcome.should_remove_legacy() {
            let _ = settings.set_legacy_ai_secret(provider.legacy_field(), None);
        }
        if let MigrationOutcome::Failed(reason) = &outcome {
            eprintln!(
                "[skriuw] cloud AI key for {} could not be migrated to secure storage: {reason}",
                provider.account()
            );
        }
    }
}

/// The Ollama-only runtime config (no provider keys involved), for the local
/// model-management commands that never touch the credential store.
struct OllamaRuntime {
    endpoint: String,
}

fn ollama_runtime(settings: &SettingsStore) -> Result<OllamaRuntime, String> {
    let snapshot = settings.snapshot().map_err(|error| error.to_string())?;
    Ok(OllamaRuntime {
        endpoint: configured(snapshot.ai.ollama_endpoint.as_deref())
            .unwrap_or_else(|| DEFAULT_ENDPOINT.to_string()),
    })
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
pub fn ai_get_config(
    settings: State<'_, SettingsStore>,
    creds: State<'_, CredentialState>,
) -> Result<AiConfig, String> {
    load_config(&settings, creds.store())
}

#[tauri::command]
pub fn ai_set_config(
    settings: State<'_, SettingsStore>,
    creds: State<'_, CredentialState>,
    patch: AiConfigPatch,
) -> Result<AiConfig, String> {
    settings
        .update(|current| {
            if let Some(value) = patch.cloud_consent {
                current.ai.cloud_consent = value;
            }
            if let Some(value) = patch.provider {
                if matches!(value.as_str(), "groq" | "gemini" | "google")
                    && !current.ai.cloud_consent
                {
                    return Err(crate::settings::SettingsError::Validation(
                        "cloud AI requires explicit consent because note text leaves this device"
                            .to_string(),
                    ));
                }
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
    load_config(&settings, creds.store())
}

fn ensure_cloud_consent(config: &AiConfig) -> Result<(), String> {
    if matches!(config.provider.as_str(), "groq" | "gemini" | "google") && !config.cloud_consent {
        return Err(
            "Cloud AI is disabled until you consent in AI settings. Your note text leaves this device when a cloud provider is used."
                .to_string(),
        );
    }
    Ok(())
}

/// Stores a provider API key in the OS credential store. `provider` is "groq"
/// or "gemini"; an empty value clears the stored key. The key is never written
/// to `settings.json`; any leftover legacy plaintext for the provider is
/// removed on a successful save so a re-save also cleans up old state.
#[tauri::command]
pub fn ai_set_key(
    settings: State<'_, SettingsStore>,
    creds: State<'_, CredentialState>,
    provider: String,
    key: String,
) -> Result<AiConfig, String> {
    set_provider_key(settings.inner(), creds.store(), &provider, &key)?;
    load_config(&settings, creds.store())
}

/// Testable core of `ai_set_key`: validates the provider, stores or clears the
/// secret in the credential store, and drops any legacy plaintext field.
fn set_provider_key(
    settings: &SettingsStore,
    creds: &dyn CredentialStore,
    provider: &str,
    key: &str,
) -> Result<(), String> {
    let provider = CredentialProvider::from_str(provider)
        .ok_or_else(|| format!("Unknown AI provider: {provider}"))?;
    let trimmed = key.trim();
    if trimmed.is_empty() {
        // Clearing must always remove any legacy plaintext first, so a locked or
        // unavailable credential store (which may hold nothing to delete anyway)
        // can never leave the old plaintext key in settings.json or backups.
        let _ = settings.set_legacy_ai_secret(provider.legacy_field(), None);
        creds.delete(provider).map_err(|error| error.to_string())?;
        return Ok(());
    }
    creds
        .set(provider, trimmed)
        .map_err(|error| error.to_string())?;
    // The secret now lives in the OS store; drop any legacy plaintext for it.
    let _ = settings.set_legacy_ai_secret(provider.legacy_field(), None);
    Ok(())
}

#[tauri::command]
pub async fn ai_complete(
    settings: State<'_, SettingsStore>,
    creds: State<'_, CredentialState>,
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
    let config = load_config(&settings, creds.store())?;
    ensure_cloud_consent(&config)?;

    let result = match config.provider.as_str() {
        "groq" => {
            let secret = require_secret(creds.store(), CredentialProvider::Groq)?;
            cloud::groq_complete(secret.expose(), &config.groq_model, &system, &user).await?
        }
        "gemini" | "google" => {
            let secret = require_secret(creds.store(), CredentialProvider::Gemini)?;
            cloud::gemini_complete(secret.expose(), &config.gemini_model, &system, &user).await?
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
    creds: State<'_, CredentialState>,
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
    let config = load_config(&settings, creds.store())?;
    ensure_cloud_consent(&config)?;

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
            let secret = require_secret(creds.store(), CredentialProvider::Groq)?;
            cloud::groq_complete_stream(
                secret.expose(),
                &config.groq_model,
                &system,
                &user,
                emit,
                cancel,
            )
            .await?
        }
        "gemini" | "google" => {
            let secret = require_secret(creds.store(), CredentialProvider::Gemini)?;
            cloud::gemini_complete_stream(
                secret.expose(),
                &config.gemini_model,
                &system,
                &user,
                emit,
                cancel,
            )
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
pub async fn ai_ping(
    settings: State<'_, SettingsStore>,
    creds: State<'_, CredentialState>,
) -> Result<AiPingResult, String> {
    let config = load_config(&settings, creds.store())?;
    ensure_cloud_consent(&config)?;
    let system = "Reply with exactly one word: pong.";
    let user = "ping";
    let model = match config.provider.as_str() {
        "groq" => config.groq_model.clone(),
        "gemini" | "google" => config.gemini_model.clone(),
        _ => config.ollama_model.clone(),
    };

    let started = std::time::Instant::now();
    let result = match config.provider.as_str() {
        "groq" => match require_secret(creds.store(), CredentialProvider::Groq) {
            Ok(secret) => {
                cloud::groq_complete(secret.expose(), &config.groq_model, system, user).await
            }
            Err(error) => Err(error),
        },
        "gemini" | "google" => match require_secret(creds.store(), CredentialProvider::Gemini) {
            Ok(secret) => {
                cloud::gemini_complete(secret.expose(), &config.gemini_model, system, user).await
            }
            Err(error) => Err(error),
        },
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

/// Deletes every stored cloud-AI provider key from the OS credential store.
/// Used by the desktop reset flow, which must explicitly address credentials
/// because they live outside the app-data directories a reset wipes.
#[tauri::command]
pub fn ai_clear_credentials(creds: State<'_, CredentialState>) -> Result<(), String> {
    let store = creds.store();
    for provider in [CredentialProvider::Groq, CredentialProvider::Gemini] {
        store.delete(provider).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn ai_ollama_status(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
) -> Result<OllamaInstallStatus, String> {
    let root = ollama_root(&app)?;
    let runtime = ollama_runtime(&settings)?;
    Ok(installer::get_install_status(&root, &runtime.endpoint).await)
}

#[tauri::command]
pub async fn ai_ollama_catalog(
    settings: State<'_, SettingsStore>,
) -> Result<Vec<OllamaCatalogEntry>, String> {
    let runtime = ollama_runtime(&settings)?;
    ollama::OllamaClient::new(runtime.endpoint)
        .list_catalog()
        .await
}

#[tauri::command]
pub async fn ai_start_ollama(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
) -> Result<(), String> {
    let root = ollama_root(&app)?;
    let runtime = ollama_runtime(&settings)?;
    installer::start_managed_server(&root, &runtime.endpoint).await
}

#[tauri::command]
pub async fn ai_install_ollama(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
    on_event: Channel<OllamaInstallEvent>,
) -> Result<(), String> {
    let root = ollama_root(&app)?;
    let runtime = ollama_runtime(&settings)?;
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
        installer::install_managed(root, runtime.endpoint, on_event.clone(), cancel).await;
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
    let runtime = ollama_runtime(&settings)?;
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

    let client = ollama::OllamaClient::new(runtime.endpoint);
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
    let runtime = ollama_runtime(&settings)?;
    ollama::OllamaClient::new(runtime.endpoint)
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
    let Ok(runtime) = ollama_runtime(settings) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        let _ = installer::start_managed_server(&root, &runtime.endpoint).await;
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::InMemoryCredentialStore;

    fn settings_store() -> (tempfile::TempDir, SettingsStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = SettingsStore::load(dir.path().join(crate::settings::SETTINGS_FILE)).unwrap();
        (dir, store)
    }

    #[test]
    fn set_provider_key_stores_in_creds_never_in_settings_json() {
        let (dir, settings) = settings_store();
        let creds = InMemoryCredentialStore::new();

        set_provider_key(&settings, &creds, "groq", "sk-sentinel-secret").unwrap();

        // The key is in the credential store.
        assert_eq!(
            creds
                .get(CredentialProvider::Groq)
                .unwrap()
                .unwrap()
                .expose(),
            "sk-sentinel-secret"
        );
        // settings.json (if written at all) never contains the secret.
        let path = dir.path().join(crate::settings::SETTINGS_FILE);
        if path.exists() {
            let bytes = std::fs::read(&path).unwrap();
            let text = String::from_utf8_lossy(&bytes);
            assert!(!text.contains("sk-sentinel-secret"));
            assert!(!text.contains("groqApiKey"));
        }
    }

    #[test]
    fn cloud_provider_is_blocked_until_explicit_consent() {
        let (_dir, settings) = settings_store();
        let creds = InMemoryCredentialStore::new();
        settings
            .update(|current| {
                current.ai.provider = Some("groq".to_string());
                Ok(())
            })
            .unwrap();
        let blocked = load_config(&settings, &creds).unwrap();
        assert!(ensure_cloud_consent(&blocked).is_err());

        settings
            .update(|current| {
                current.ai.cloud_consent = true;
                Ok(())
            })
            .unwrap();
        let allowed = load_config(&settings, &creds).unwrap();
        assert!(ensure_cloud_consent(&allowed).is_ok());
    }

    #[test]
    fn empty_key_clears_the_credential() {
        let (_dir, settings) = settings_store();
        let creds = InMemoryCredentialStore::new();
        set_provider_key(&settings, &creds, "gemini", "gemini-key").unwrap();
        assert!(creds.get(CredentialProvider::Gemini).unwrap().is_some());
        set_provider_key(&settings, &creds, "gemini", "   ").unwrap();
        assert!(creds.get(CredentialProvider::Gemini).unwrap().is_none());
    }

    #[test]
    fn clearing_removes_legacy_plaintext_even_when_store_unavailable() {
        let (_dir, settings) = settings_store();
        let creds = InMemoryCredentialStore::new();
        settings
            .set_legacy_ai_secret("groqApiKey", Some("stranded".to_string()))
            .unwrap();
        // Store is locked/unavailable: the secure delete fails, but the legacy
        // plaintext must still be gone so it never lingers in backups.
        creds.set_unavailable(true);
        assert!(set_provider_key(&settings, &creds, "groq", "  ").is_err());
        assert!(settings.legacy_ai_secret("groqApiKey").unwrap().is_none());
    }

    #[test]
    fn unknown_provider_changes_nothing() {
        let (_dir, settings) = settings_store();
        let creds = InMemoryCredentialStore::new();
        assert!(set_provider_key(&settings, &creds, "openai", "key").is_err());
        assert!(creds.get(CredentialProvider::Groq).unwrap().is_none());
        assert!(creds.get(CredentialProvider::Gemini).unwrap().is_none());
    }

    #[test]
    fn key_state_reflects_secure_missing_and_pending() {
        let (_dir, settings) = settings_store();
        let creds = InMemoryCredentialStore::new();
        // Missing by default.
        assert_eq!(
            key_state(&creds, &settings, CredentialProvider::Groq),
            KeyState::Missing
        );
        // A leftover legacy plaintext with no secure key reads as pending.
        settings
            .set_legacy_ai_secret("groqApiKey", Some("legacy".to_string()))
            .unwrap();
        assert_eq!(
            key_state(&creds, &settings, CredentialProvider::Groq),
            KeyState::MigrationPending
        );
        // Once secured, it reads as present.
        creds.set(CredentialProvider::Groq, "secure").unwrap();
        assert_eq!(
            key_state(&creds, &settings, CredentialProvider::Groq),
            KeyState::Present
        );
    }

    #[test]
    fn startup_migration_moves_plaintext_out_of_settings() {
        let (dir, settings) = settings_store();
        let creds = InMemoryCredentialStore::new();
        settings
            .set_legacy_ai_secret("groqApiKey", Some("plaintext-sentinel".to_string()))
            .unwrap();

        migrate_legacy_secrets(&settings, &creds);

        // Secure store now holds it; settings.json no longer does.
        assert_eq!(
            creds
                .get(CredentialProvider::Groq)
                .unwrap()
                .unwrap()
                .expose(),
            "plaintext-sentinel"
        );
        assert!(settings.legacy_ai_secret("groqApiKey").unwrap().is_none());
        let bytes = std::fs::read(dir.path().join(crate::settings::SETTINGS_FILE)).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("plaintext-sentinel"));
    }

    #[test]
    fn failed_migration_keeps_plaintext_for_retry() {
        let (_dir, settings) = settings_store();
        let creds = InMemoryCredentialStore::new();
        creds.set_unavailable(true);
        settings
            .set_legacy_ai_secret("geminiApiKey", Some("keep-me".to_string()))
            .unwrap();

        migrate_legacy_secrets(&settings, &creds);

        // Store was unavailable → plaintext retained so a later launch can retry.
        assert_eq!(
            settings
                .legacy_ai_secret("geminiApiKey")
                .unwrap()
                .as_deref(),
            Some("keep-me")
        );
    }

    #[test]
    fn require_secret_has_no_plaintext_fallback() {
        let creds = InMemoryCredentialStore::new();
        // No secure key and no fallback: cloud calls must error, not silently
        // use a plaintext value.
        assert!(require_secret(&creds, CredentialProvider::Groq).is_err());
    }
}
