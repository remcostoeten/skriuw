//! Cloud AI providers used directly from the desktop shell (no proxy server).
//! Both expose a non-streaming `complete` for one-shot actions and a
//! `_stream` variant used by continue-writing to surface tokens as they arrive.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use serde::Deserialize;

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("client build failed: {error}"))
}

const GROQ_URL: &str = "https://api.groq.com/openai/v1/chat/completions";

/// Reads an SSE body and invokes `on_data` with the payload of every
/// `data:` line (the `[DONE]` sentinel is skipped). Stops early, without
/// error, once `cancel` is flagged.
async fn read_sse<F: FnMut(&str)>(
    response: reqwest::Response,
    provider: &str,
    cancel: &Arc<AtomicBool>,
    mut on_data: F,
) -> Result<(), String> {
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        let chunk = chunk.map_err(|error| format!("{provider} stream error: {error}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(idx) = buffer.find('\n') {
            let line = buffer[..idx].trim().to_string();
            buffer = buffer[idx + 1..].to_string();
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            on_data(data);
        }
    }
    Ok(())
}

pub async fn groq_complete(
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("No Groq API key set. Add one in Settings → AI.".to_string());
    }
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user },
        ],
        "temperature": 0.35,
    });
    let response = http_client()?
        .post(GROQ_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Groq request failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Groq error ({status}): {text}"));
    }

    #[derive(Deserialize)]
    struct Response {
        choices: Vec<Choice>,
    }
    #[derive(Deserialize)]
    struct Choice {
        message: Message,
    }
    #[derive(Deserialize)]
    struct Message {
        content: Option<String>,
    }

    let parsed: Response = response
        .json()
        .await
        .map_err(|error| format!("Failed to parse Groq response: {error}"))?;
    Ok(parsed
        .choices
        .into_iter()
        .next()
        .and_then(|choice| choice.message.content)
        .unwrap_or_default())
}

pub async fn groq_complete_stream<F: Fn(&str)>(
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
    on_chunk: F,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("No Groq API key set. Add one in Settings → AI.".to_string());
    }
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user },
        ],
        "temperature": 0.35,
        "stream": true,
    });
    let response = http_client()?
        .post(GROQ_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Groq request failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Groq error ({status}): {text}"));
    }

    #[derive(Deserialize)]
    struct StreamResponse {
        choices: Vec<StreamChoice>,
    }
    #[derive(Deserialize)]
    struct StreamChoice {
        delta: Delta,
    }
    #[derive(Deserialize)]
    struct Delta {
        content: Option<String>,
    }

    let mut accumulated = String::new();
    read_sse(response, "Groq", &cancel, |data| {
        let Ok(parsed) = serde_json::from_str::<StreamResponse>(data) else {
            return;
        };
        if let Some(text) = parsed
            .choices
            .into_iter()
            .next()
            .and_then(|choice| choice.delta.content)
        {
            if !text.is_empty() {
                accumulated.push_str(&text);
                on_chunk(&text);
            }
        }
    })
    .await?;
    Ok(accumulated)
}

pub async fn gemini_complete(
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("No Gemini API key set. Add one in Settings → AI.".to_string());
    }
    let url = format!(
		"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
	);
    let body = serde_json::json!({
        "systemInstruction": { "parts": [{ "text": system }] },
        "contents": [{ "parts": [{ "text": user }] }],
    });
    let response = http_client()?
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Gemini request failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Gemini error ({status}): {text}"));
    }

    #[derive(Deserialize)]
    struct Response {
        candidates: Option<Vec<Candidate>>,
    }
    #[derive(Deserialize)]
    struct Candidate {
        content: Option<Content>,
    }
    #[derive(Deserialize)]
    struct Content {
        parts: Option<Vec<Part>>,
    }
    #[derive(Deserialize)]
    struct Part {
        text: Option<String>,
    }

    let parsed: Response = response
        .json()
        .await
        .map_err(|error| format!("Failed to parse Gemini response: {error}"))?;
    let text = parsed
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|c| c.parts)
        .and_then(|parts| parts.into_iter().next())
        .and_then(|part| part.text)
        .unwrap_or_default();
    Ok(text)
}

pub async fn gemini_complete_stream<F: Fn(&str)>(
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
    on_chunk: F,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("No Gemini API key set. Add one in Settings → AI.".to_string());
    }
    let url = format!(
		"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={api_key}"
	);
    let body = serde_json::json!({
        "systemInstruction": { "parts": [{ "text": system }] },
        "contents": [{ "parts": [{ "text": user }] }],
    });
    let response = http_client()?
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Gemini request failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Gemini error ({status}): {text}"));
    }

    #[derive(Deserialize)]
    struct StreamResponse {
        candidates: Option<Vec<StreamCandidate>>,
    }
    #[derive(Deserialize)]
    struct StreamCandidate {
        content: Option<StreamContent>,
    }
    #[derive(Deserialize)]
    struct StreamContent {
        parts: Option<Vec<StreamPart>>,
    }
    #[derive(Deserialize)]
    struct StreamPart {
        text: Option<String>,
    }

    let mut accumulated = String::new();
    read_sse(response, "Gemini", &cancel, |data| {
        let Ok(parsed) = serde_json::from_str::<StreamResponse>(data) else {
            return;
        };
        let text = parsed
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content)
            .and_then(|c| c.parts)
            .map(|parts| {
                parts
                    .into_iter()
                    .filter_map(|part| part.text)
                    .collect::<String>()
            })
            .unwrap_or_default();
        if !text.is_empty() {
            accumulated.push_str(&text);
            on_chunk(&text);
        }
    })
    .await?;
    Ok(accumulated)
}
