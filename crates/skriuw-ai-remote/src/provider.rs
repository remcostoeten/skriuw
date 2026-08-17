use reqwest::{Url, blocking::RequestBuilder};
use serde_json::{Value, json};
use skriuw_domain::{AiCompletionRequest, AiCredential, AiUsage};

pub const GEMINI_PROVIDER_ID: &str = "gemini";
pub const GROQ_PROVIDER_ID: &str = "groq";

const GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/";
const GROQ_BASE_URL: &str = "https://api.groq.com/";

/// One parsed provider stream event, normalised away from provider syntax
/// before it reaches the seam.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct ProviderEvent {
    pub(crate) text: String,
    pub(crate) usage: Option<AiUsage>,
    pub(crate) finished: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteProviderKind {
    Gemini,
    Groq,
}

impl RemoteProviderKind {
    #[must_use]
    pub fn id(self) -> &'static str {
        match self {
            Self::Gemini => GEMINI_PROVIDER_ID,
            Self::Groq => GROQ_PROVIDER_ID,
        }
    }

    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            Self::Gemini => "Google Gemini",
            Self::Groq => "Groq",
        }
    }

    /// The human-readable destination named in the privacy disclosure. It must
    /// stay in step with the host every request actually reaches.
    #[must_use]
    pub fn destination(self) -> &'static str {
        match self {
            Self::Gemini => "generativelanguage.googleapis.com",
            Self::Groq => "api.groq.com",
        }
    }

    #[must_use]
    pub fn from_id(provider_id: &str) -> Option<Self> {
        match provider_id {
            GEMINI_PROVIDER_ID => Some(Self::Gemini),
            GROQ_PROVIDER_ID => Some(Self::Groq),
            _ => None,
        }
    }

    #[must_use]
    pub(crate) fn default_base_url(self) -> &'static str {
        match self {
            Self::Gemini => GEMINI_BASE_URL,
            Self::Groq => GROQ_BASE_URL,
        }
    }

    pub(crate) fn endpoint(self, base: &Url, model_id: &str, streaming: bool) -> Option<Url> {
        match self {
            Self::Gemini => {
                let method = if streaming {
                    "streamGenerateContent?alt=sse"
                } else {
                    "generateContent"
                };
                base.join(&format!("v1beta/models/{model_id}:{method}"))
                    .ok()
            }
            Self::Groq => base.join("openai/v1/chat/completions").ok(),
        }
    }

    /// Attaches the key to a single outbound request. The credential is never
    /// stored on the builder beyond this call and never enters a URL, so it
    /// cannot reach a redirect target, a log line, or an error message.
    pub(crate) fn authorize(
        self,
        builder: RequestBuilder,
        credential: &AiCredential,
    ) -> RequestBuilder {
        match self {
            Self::Gemini => builder.header("x-goog-api-key", credential.expose()),
            Self::Groq => builder.bearer_auth(credential.expose()),
        }
    }

    pub(crate) fn completion_body(self, request: &AiCompletionRequest, streaming: bool) -> Value {
        let temperature = fraction(request.parameters.temperature_millis);
        let top_p = fraction(request.parameters.top_p_millis);
        match self {
            Self::Gemini => {
                let mut generation_config = json!({});
                if let Some(temperature) = temperature {
                    generation_config["temperature"] = json!(temperature);
                }
                if let Some(top_p) = top_p {
                    generation_config["topP"] = json!(top_p);
                }
                let mut body = json!({
                    "contents": [{"role": "user", "parts": [{"text": request.user_prompt}]}],
                    "generationConfig": generation_config,
                });
                if !request.system_prompt.is_empty() {
                    body["systemInstruction"] = json!({"parts": [{"text": request.system_prompt}]});
                }
                body
            }
            Self::Groq => {
                let mut messages = Vec::with_capacity(2);
                if !request.system_prompt.is_empty() {
                    messages.push(json!({"role": "system", "content": request.system_prompt}));
                }
                messages.push(json!({"role": "user", "content": request.user_prompt}));
                let mut body = json!({
                    "model": request.model_id,
                    "messages": messages,
                    "stream": streaming,
                });
                if streaming {
                    body["stream_options"] = json!({"include_usage": true});
                }
                if let Some(temperature) = temperature {
                    body["temperature"] = json!(temperature);
                }
                if let Some(top_p) = top_p {
                    body["top_p"] = json!(top_p);
                }
                body
            }
        }
    }

    pub(crate) fn verification_body(self, model_id: &str) -> Value {
        match self {
            Self::Gemini => json!({
                "contents": [{"role": "user", "parts": [{"text": "ping"}]}],
                "generationConfig": {"maxOutputTokens": 1},
            }),
            Self::Groq => json!({
                "model": model_id,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1,
                "stream": false,
            }),
        }
    }

    /// Translates one provider payload into the neutral event shape. `None`
    /// means the payload was not the documented shape and the stream is
    /// malformed; an empty event means "nothing to forward yet".
    pub(crate) fn parse_event(self, payload: &str) -> Option<ProviderEvent> {
        let value: Value = serde_json::from_str(payload).ok()?;
        match self {
            Self::Gemini => {
                if value.get("error").is_some() {
                    return None;
                }
                let mut event = ProviderEvent::default();
                if let Some(parts) = value
                    .get("candidates")
                    .and_then(Value::as_array)
                    .and_then(|candidates| candidates.first())
                    .and_then(|candidate| candidate.get("content"))
                    .and_then(|content| content.get("parts"))
                    .and_then(Value::as_array)
                {
                    for part in parts {
                        if let Some(text) = part.get("text").and_then(Value::as_str) {
                            event.text.push_str(text);
                        }
                    }
                }
                event.usage = value.get("usageMetadata").and_then(|usage| {
                    bounded_usage(
                        usage.get("promptTokenCount").and_then(Value::as_u64),
                        usage.get("candidatesTokenCount").and_then(Value::as_u64),
                    )
                });
                Some(event)
            }
            Self::Groq => {
                if value.get("error").is_some() {
                    return None;
                }
                let mut event = ProviderEvent::default();
                if let Some(choice) = value
                    .get("choices")
                    .and_then(Value::as_array)
                    .and_then(|choices| choices.first())
                {
                    if let Some(text) = choice
                        .get("delta")
                        .and_then(|delta| delta.get("content"))
                        .and_then(Value::as_str)
                    {
                        event.text.push_str(text);
                    }
                    event.finished = choice
                        .get("finish_reason")
                        .is_some_and(|reason| !reason.is_null());
                }
                event.usage = value.get("usage").and_then(|usage| {
                    bounded_usage(
                        usage.get("prompt_tokens").and_then(Value::as_u64),
                        usage.get("completion_tokens").and_then(Value::as_u64),
                    )
                });
                Some(event)
            }
        }
    }
}

fn fraction(millis: Option<u16>) -> Option<f32> {
    millis.map(|value| f32::from(value) / 1_000.0)
}

fn bounded_usage(input_tokens: Option<u64>, output_tokens: Option<u64>) -> Option<AiUsage> {
    let usage = AiUsage {
        input_tokens: input_tokens?,
        output_tokens: output_tokens?,
    };
    usage.validate().ok().map(|()| usage)
}
