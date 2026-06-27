//! Cloud AI providers used directly from the desktop shell (no proxy server).
//! Both expose a single non-streaming `complete` — the web app's AI actions
//! (generate title / spell-check / continue writing) are one-shot generations.

use std::time::Duration;

use serde::Deserialize;

fn http_client() -> Result<reqwest::Client, String> {
	reqwest::Client::builder()
		.timeout(Duration::from_secs(60))
		.build()
		.map_err(|error| format!("client build failed: {error}"))
}

const GROQ_URL: &str = "https://api.groq.com/openai/v1/chat/completions";

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
