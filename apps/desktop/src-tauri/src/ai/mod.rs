//! Desktop AI: local-first inference via a managed Ollama runtime, with Groq
//! and Gemini as optional cloud providers. Configuration (provider, models, and
//! API keys) lives in the same `settings.json` as the vault root. The web app's
//! three editor actions route here through the `ai_complete` command.

mod cloud;
mod installer;
mod ollama;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

pub use installer::{
    stop_managed_server, OllamaInstallEvent, OllamaInstallStatus, DEFAULT_ENDPOINT,
};
pub use ollama::{OllamaCatalogEntry, OllamaPullEvent};

const SETTINGS_FILE: &str = "settings.json";

static INSTALL_CANCEL: AtomicBool = AtomicBool::new(false);
static PULL_CANCEL: AtomicBool = AtomicBool::new(false);

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

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?;
    Ok(dir.join(SETTINGS_FILE))
}

fn read_settings(app: &AppHandle) -> Result<Value, String> {
    let path = settings_path(app)?;
    match std::fs::read_to_string(&path) {
        Ok(raw) => Ok(serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(serde_json::json!({})),
        Err(error) => Err(error.to_string()),
    }
}

fn write_settings(app: &AppHandle, value: &Value) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let body = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    std::fs::write(&path, format!("{body}\n")).map_err(|error| error.to_string())
}

fn ai_str(settings: &Value, key: &str) -> Option<String> {
    settings
        .get("ai")
        .and_then(|ai| ai.get(key))
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn load_config(app: &AppHandle) -> Result<AiConfig, String> {
    let settings = read_settings(app)?;
    Ok(AiConfig {
        provider: ai_str(&settings, "provider").unwrap_or_else(|| "ollama".to_string()),
        ollama_endpoint: ai_str(&settings, "ollamaEndpoint")
            .unwrap_or_else(|| DEFAULT_ENDPOINT.to_string()),
        ollama_model: ai_str(&settings, "ollamaModel")
            .unwrap_or_else(|| DEFAULT_OLLAMA_MODEL.to_string()),
        groq_model: ai_str(&settings, "groqModel")
            .unwrap_or_else(|| DEFAULT_GROQ_MODEL.to_string()),
        gemini_model: ai_str(&settings, "geminiModel")
            .unwrap_or_else(|| DEFAULT_GEMINI_MODEL.to_string()),
        has_groq_key: ai_str(&settings, "groqApiKey").is_some(),
        has_gemini_key: ai_str(&settings, "geminiApiKey").is_some(),
    })
}

fn ollama_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("resolve local data dir: {error}"))?;
    Ok(dir.join("ollama"))
}

fn prompt_for(action: &str, content: &str) -> Result<(String, String), String> {
    let (system, user) = match action {
		"generateTitle" => (
			"You write short, descriptive document titles.",
			format!(
				"Generate a short, concise title (max 6 words) for this document. Respond ONLY with the title text, no markdown, no quotes.\n\n{content}"
			),
		),
		"spellCheck" => (
			"You are a professional copy editor.",
			format!(
				"Correct all spelling, grammar, and typography errors in the following Markdown document. Keep the structural formatting (headings, lists, bolding) exactly the same. Only fix the text inside it. Respond ONLY with the corrected markdown document, without any extra commentary.\n\n{content}"
			),
		),
		"continueWriting" => (
			"You are a writing assistant that continues documents in the author's exact voice and style.",
			format!(
				"You are continuing a Markdown document that was cut off — it may end mid-sentence or even mid-word.\n\nDo the following:\n1. Take the FINAL paragraph and rewrite it into a complete, natural paragraph: finish any unfinished word or sentence and smooth the wording so it reads well. Keep its original meaning and as much of the existing wording as possible.\n2. Then continue the document naturally for one or two more short paragraphs, matching the author's tone, style, and formatting.\n\nOutput ONLY Markdown: the rewritten final paragraph, immediately followed by your continuation. Do NOT restate or include the title, any headings, or any earlier paragraphs. Do NOT add a heading. Begin directly with the rewritten final paragraph.\n\nDocument:\n{content}"
			),
		),
		_ => return Err(format!("Unsupported AI action: {action}")),
	};
    Ok((system.to_string(), user))
}

#[tauri::command]
pub fn ai_get_config(app: AppHandle) -> Result<AiConfig, String> {
    load_config(&app)
}

#[tauri::command]
pub fn ai_set_config(app: AppHandle, patch: AiConfigPatch) -> Result<AiConfig, String> {
    let mut settings = read_settings(&app)?;
    if !settings.get("ai").map(Value::is_object).unwrap_or(false) {
        settings["ai"] = serde_json::json!({});
    }
    let ai = settings
        .get_mut("ai")
        .and_then(Value::as_object_mut)
        .ok_or("settings.ai is not an object")?;

    let mut put = |key: &str, value: Option<String>| {
        if let Some(value) = value {
            ai.insert(key.to_string(), Value::String(value));
        }
    };
    put("provider", patch.provider);
    put("ollamaEndpoint", patch.ollama_endpoint);
    put("ollamaModel", patch.ollama_model);
    put("groqModel", patch.groq_model);
    put("geminiModel", patch.gemini_model);

    write_settings(&app, &settings)?;
    load_config(&app)
}

/// Stores a provider API key. `provider` is "groq" or "gemini"; an empty value
/// clears the stored key.
#[tauri::command]
pub fn ai_set_key(app: AppHandle, provider: String, key: String) -> Result<AiConfig, String> {
    let field = match provider.as_str() {
        "groq" => "groqApiKey",
        "gemini" | "google" => "geminiApiKey",
        other => return Err(format!("Unknown AI provider: {other}")),
    };
    let mut settings = read_settings(&app)?;
    if !settings.get("ai").map(Value::is_object).unwrap_or(false) {
        settings["ai"] = serde_json::json!({});
    }
    let ai = settings
        .get_mut("ai")
        .and_then(Value::as_object_mut)
        .ok_or("settings.ai is not an object")?;
    let trimmed = key.trim();
    if trimmed.is_empty() {
        ai.remove(field);
    } else {
        ai.insert(field.to_string(), Value::String(trimmed.to_string()));
    }
    write_settings(&app, &settings)?;
    load_config(&app)
}

#[tauri::command]
pub async fn ai_complete(
    app: AppHandle,
    action: String,
    content: String,
) -> Result<String, String> {
    if content.trim().is_empty() {
        return Err("There is no note content to send to AI.".to_string());
    }
    let (system, user) = prompt_for(&action, &content)?;
    let settings = read_settings(&app)?;
    let config = load_config(&app)?;

    let result = match config.provider.as_str() {
        "groq" => {
            let key = ai_str(&settings, "groqApiKey").unwrap_or_default();
            cloud::groq_complete(&key, &config.groq_model, &system, &user).await?
        }
        "gemini" | "google" => {
            let key = ai_str(&settings, "geminiApiKey").unwrap_or_default();
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

#[tauri::command]
pub async fn ai_ollama_status(app: AppHandle) -> Result<OllamaInstallStatus, String> {
    let root = ollama_root(&app)?;
    let config = load_config(&app)?;
    Ok(installer::get_install_status(&root, &config.ollama_endpoint).await)
}

#[tauri::command]
pub async fn ai_ollama_catalog(app: AppHandle) -> Result<Vec<OllamaCatalogEntry>, String> {
    let config = load_config(&app)?;
    ollama::OllamaClient::new(config.ollama_endpoint)
        .list_catalog()
        .await
}

#[tauri::command]
pub async fn ai_start_ollama(app: AppHandle) -> Result<(), String> {
    let root = ollama_root(&app)?;
    let config = load_config(&app)?;
    installer::start_managed_server(&root, &config.ollama_endpoint).await
}

#[tauri::command]
pub async fn ai_install_ollama(
    app: AppHandle,
    on_event: Channel<OllamaInstallEvent>,
) -> Result<(), String> {
    let root = ollama_root(&app)?;
    let config = load_config(&app)?;
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
    app: AppHandle,
    model: String,
    on_event: Channel<OllamaPullEvent>,
) -> Result<(), String> {
    let config = load_config(&app)?;
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
pub async fn ai_delete_ollama_model(app: AppHandle, model: String) -> Result<(), String> {
    let config = load_config(&app)?;
    ollama::OllamaClient::new(config.ollama_endpoint)
        .delete_model(&model)
        .await
}

/// Best-effort: if a managed Ollama is already installed, start it in the
/// background at launch so the first AI action doesn't pay the cold-start.
pub fn autostart_managed(app: &AppHandle) {
    let Ok(root) = ollama_root(app) else {
        return;
    };
    if !installer::managed_install_exists(&root) {
        return;
    }
    let Ok(config) = load_config(app) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        let _ = installer::start_managed_server(&root, &config.ollama_endpoint).await;
    });
}
