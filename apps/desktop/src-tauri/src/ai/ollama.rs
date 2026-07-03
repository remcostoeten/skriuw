//! HTTP client for a running Ollama server: list/pull/delete models and run
//! non-streaming chat completions. Pull progress is streamed to the frontend
//! over a Tauri channel with a computed ETA.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

const RECOMMENDED_MODELS: [(&str, &str, &str); 3] = [
    (
        "llama3.2",
        "Llama 3.2",
        "General-purpose local model with a good speed/quality balance.",
    ),
    (
        "qwen2.5:7b",
        "Qwen 2.5",
        "Strong all-round writing and reasoning for longer notes.",
    ),
    (
        "phi3.5",
        "Phi 3.5",
        "Small and fast — good on lower-end machines.",
    ),
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaCatalogEntry {
    pub name: String,
    pub label: String,
    pub description: String,
    pub installed: bool,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum OllamaPullEvent {
    Status {
        message: String,
    },
    Progress {
        completed: u64,
        total: u64,
        percent: f32,
        eta_seconds: Option<u32>,
    },
    Done {
        model: String,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatStreamLine {
    message: Option<ChatMessage>,
    #[serde(default)]
    done: bool,
}

#[derive(Debug, Deserialize)]
struct OllamaModel {
    name: String,
    #[serde(default)]
    size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize)]
struct PullLine {
    status: Option<String>,
    #[serde(default)]
    total: Option<u64>,
    #[serde(default)]
    completed: Option<u64>,
}

pub struct OllamaClient {
    endpoint: String,
    client: reqwest::Client,
    pull_client: reqwest::Client,
}

impl OllamaClient {
    pub fn new(endpoint: String) -> Self {
        Self {
            endpoint: endpoint.trim().trim_end_matches('/').to_string(),
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(120))
                .build()
                .unwrap_or_default(),
            pull_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(60 * 30))
                .build()
                .unwrap_or_default(),
        }
    }

    async fn list_installed(&self) -> Result<Vec<OllamaModel>, String> {
        let url = format!("{}/api/tags", self.endpoint);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|error| format!("Failed to list Ollama models: {error}"))?;
        if !response.status().is_success() {
            return Err("Failed to list Ollama models".to_string());
        }
        let parsed: ModelsResponse = response
            .json()
            .await
            .map_err(|error| format!("Failed to parse Ollama models: {error}"))?;
        Ok(parsed.models)
    }

    fn models_match(requested: &str, installed: &str) -> bool {
        if requested == installed {
            return true;
        }
        let req = requested.split(':').next().unwrap_or(requested);
        let ins = installed.split(':').next().unwrap_or(installed);
        req == ins
    }

    pub async fn list_catalog(&self) -> Result<Vec<OllamaCatalogEntry>, String> {
        let installed = self.list_installed().await.unwrap_or_default();
        let mut catalog = Vec::new();
        let mut seen = std::collections::HashSet::new();

        for (name, label, description) in RECOMMENDED_MODELS {
            seen.insert(name.to_string());
            let matched = installed.iter().find(|m| Self::models_match(name, &m.name));
            catalog.push(OllamaCatalogEntry {
                name: name.to_string(),
                label: label.to_string(),
                description: description.to_string(),
                installed: matched.is_some(),
                size_bytes: matched.and_then(|m| m.size),
            });
        }
        for model in installed {
            if seen.insert(model.name.clone()) {
                let base = model
                    .name
                    .split(':')
                    .next()
                    .unwrap_or(&model.name)
                    .to_string();
                catalog.push(OllamaCatalogEntry {
                    name: model.name.clone(),
                    label: base,
                    description: "Installed local model".into(),
                    installed: true,
                    size_bytes: model.size,
                });
            }
        }
        Ok(catalog)
    }

    pub async fn delete_model(&self, model: &str) -> Result<(), String> {
        let url = format!("{}/api/delete", self.endpoint);
        let response = self
            .client
            .delete(&url)
            .json(&serde_json::json!({ "name": model }))
            .send()
            .await
            .map_err(|error| format!("Failed to delete Ollama model: {error}"))?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Ollama delete failed ({status}): {body}"));
        }
        Ok(())
    }

    pub async fn pull_model(
        &self,
        model: &str,
        channel: Channel<OllamaPullEvent>,
        cancel: Arc<AtomicBool>,
    ) -> Result<(), String> {
        let url = format!("{}/api/pull", self.endpoint);
        let response = self
            .pull_client
            .post(&url)
            .json(&serde_json::json!({ "name": model, "stream": true }))
            .send()
            .await
            .map_err(|error| format!("Ollama pull failed: {error}"))?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            let message = format!("Ollama pull failed ({status}): {body}");
            let _ = channel.send(OllamaPullEvent::Error {
                message: message.clone(),
            });
            return Err(message);
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut last_progress_at = Instant::now();
        let mut last_completed = 0u64;

        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                return Ok(());
            }
            let chunk = chunk.map_err(|error| format!("Ollama pull stream error: {error}"))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(idx) = buffer.find('\n') {
                let line = buffer[..idx].trim().to_string();
                buffer = buffer[idx + 1..].to_string();
                if line.is_empty() {
                    continue;
                }
                let Ok(parsed) = serde_json::from_str::<PullLine>(&line) else {
                    continue;
                };
                let Some(status) = parsed.status.as_deref() else {
                    continue;
                };
                if status == "success" {
                    let _ = channel.send(OllamaPullEvent::Done {
                        model: model.to_string(),
                    });
                    return Ok(());
                }
                if let (Some(total), Some(completed)) = (parsed.total, parsed.completed) {
                    if total > 0 {
                        let percent = ((completed as f64 / total as f64) * 100.0) as f32;
                        let elapsed = last_progress_at.elapsed().as_secs_f64().max(0.001);
                        let delta = completed.saturating_sub(last_completed);
                        let rate = delta as f64 / elapsed;
                        let eta_seconds = if rate > 0.0 {
                            Some((total.saturating_sub(completed) as f64 / rate).round() as u32)
                        } else {
                            None
                        };
                        last_completed = completed;
                        last_progress_at = Instant::now();
                        let _ = channel.send(OllamaPullEvent::Progress {
                            completed,
                            total,
                            percent,
                            eta_seconds,
                        });
                    }
                }
                let _ = channel.send(OllamaPullEvent::Status {
                    message: status.to_string(),
                });
            }
        }
        let _ = channel.send(OllamaPullEvent::Done {
            model: model.to_string(),
        });
        Ok(())
    }

    /// Maps a configured model name onto an actually-installed one. An exact tag
    /// match wins; otherwise a family match (e.g. `llama3.2` → `llama3.2:3b`) is
    /// accepted so a tagless default still resolves. Returns a clear, listable
    /// error instead of letting Ollama answer a bare 404.
    async fn resolve_model(&self, requested: &str) -> Result<String, String> {
        let installed = self.list_installed().await.unwrap_or_default();
        if installed.is_empty() {
            return Err(format!(
				"Model '{requested}' is not available and no Ollama models are installed. Download one in Settings → AI."
			));
        }
        if let Some(found) = installed.iter().find(|m| m.name == requested) {
            return Ok(found.name.clone());
        }
        if let Some(found) = installed
            .iter()
            .find(|m| Self::models_match(requested, &m.name))
        {
            return Ok(found.name.clone());
        }
        let names = installed
            .iter()
            .map(|m| m.name.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        Err(format!(
			"Model '{requested}' is not installed. Installed models: {names}. Pick one in Settings → AI."
		))
    }

    pub async fn complete_stream<F: Fn(&str)>(
        &self,
        model: &str,
        system: &str,
        user: &str,
        on_chunk: F,
    ) -> Result<String, String> {
        if model.trim().is_empty() {
            return Err("No Ollama model selected. Pick one in Settings → AI.".to_string());
        }
        let model = self.resolve_model(model).await?;
        let body = ChatRequest {
            model,
            messages: vec![
                ChatMessage {
                    role: "system".into(),
                    content: system.to_string(),
                },
                ChatMessage {
                    role: "user".into(),
                    content: user.to_string(),
                },
            ],
            stream: true,
        };
        let url = format!("{}/api/chat", self.endpoint);
        let response = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("Ollama request failed: {error}. Is Ollama running?"))?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Ollama error ({status}): {text}"));
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut accumulated = String::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| format!("Ollama stream error: {error}"))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(idx) = buffer.find('\n') {
                let line = buffer[..idx].trim().to_string();
                buffer = buffer[idx + 1..].to_string();
                if line.is_empty() {
                    continue;
                }
                let Ok(parsed) = serde_json::from_str::<ChatStreamLine>(&line) else {
                    continue;
                };
                if let Some(message) = parsed.message {
                    if !message.content.is_empty() {
                        accumulated.push_str(&message.content);
                        on_chunk(&message.content);
                    }
                }
                if parsed.done {
                    return Ok(accumulated);
                }
            }
        }
        Ok(accumulated)
    }

    pub async fn complete(&self, model: &str, system: &str, user: &str) -> Result<String, String> {
        if model.trim().is_empty() {
            return Err("No Ollama model selected. Pick one in Settings → AI.".to_string());
        }
        let model = self.resolve_model(model).await?;
        let body = ChatRequest {
            model,
            messages: vec![
                ChatMessage {
                    role: "system".into(),
                    content: system.to_string(),
                },
                ChatMessage {
                    role: "user".into(),
                    content: user.to_string(),
                },
            ],
            stream: false,
        };
        let url = format!("{}/api/chat", self.endpoint);
        let response = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("Ollama request failed: {error}. Is Ollama running?"))?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Ollama error ({status}): {text}"));
        }
        let parsed: ChatResponse = response
            .json()
            .await
            .map_err(|error| format!("Failed to parse Ollama response: {error}"))?;
        Ok(parsed.message.content)
    }
}
