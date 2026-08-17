use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const MAX_AI_IDENTIFIER_BYTES: usize = 128;
pub const MAX_AI_PROMPT_BYTES: usize = 1024 * 1024;
pub const MAX_AI_RESPONSE_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_AI_DELTA_BYTES: usize = 64 * 1024;
pub const MAX_AI_DURATION_MS: u32 = 5 * 60 * 1_000;
pub const MAX_AI_RETRIES: u8 = 2;
pub const MAX_AI_ERROR_MESSAGE_BYTES: usize = 1_024;
pub const MAX_AI_TOKEN_COUNT: u64 = 1_000_000_000;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum AiValidationError {
    #[error("{field} cannot be empty")]
    Empty { field: &'static str },
    #[error("{field} exceeds {maximum} bytes")]
    TooLong { field: &'static str, maximum: usize },
    #[error("{field} contains unsupported characters")]
    InvalidIdentifier { field: &'static str },
    #[error("completion prompt exceeds {maximum} bytes")]
    PromptTooLong { maximum: usize },
    #[error("maximum output bytes must be between 1 and {maximum}")]
    InvalidOutputLimit { maximum: usize },
    #[error("completion timeout must be between 1 and {maximum} milliseconds")]
    InvalidTimeout { maximum: u32 },
    #[error("completion retries exceed {maximum}")]
    TooManyRetries { maximum: u8 },
    #[error("{field} must be between 0 and 1000")]
    InvalidSamplingParameter { field: &'static str },
    #[error("{field} exceeds {maximum}")]
    TokenCountTooLarge { field: &'static str, maximum: u64 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiCompletionParameters {
    pub max_output_bytes: u32,
    pub timeout_ms: u32,
    pub retry_count: u8,
    pub temperature_millis: Option<u16>,
    pub top_p_millis: Option<u16>,
}

impl Default for AiCompletionParameters {
    fn default() -> Self {
        Self {
            max_output_bytes: 256 * 1024,
            timeout_ms: 60_000,
            retry_count: 0,
            temperature_millis: None,
            top_p_millis: None,
        }
    }
}

impl AiCompletionParameters {
    pub fn validate(&self) -> Result<(), AiValidationError> {
        if self.max_output_bytes == 0
            || usize::try_from(self.max_output_bytes).unwrap_or(usize::MAX) > MAX_AI_RESPONSE_BYTES
        {
            return Err(AiValidationError::InvalidOutputLimit {
                maximum: MAX_AI_RESPONSE_BYTES,
            });
        }
        if self.timeout_ms == 0 || self.timeout_ms > MAX_AI_DURATION_MS {
            return Err(AiValidationError::InvalidTimeout {
                maximum: MAX_AI_DURATION_MS,
            });
        }
        if self.retry_count > MAX_AI_RETRIES {
            return Err(AiValidationError::TooManyRetries {
                maximum: MAX_AI_RETRIES,
            });
        }
        validate_sampling_parameter("temperature", self.temperature_millis)?;
        validate_sampling_parameter("top p", self.top_p_millis)?;
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiCompletionRequest {
    pub request_id: String,
    pub provider_id: String,
    pub model_id: String,
    pub system_prompt: String,
    pub user_prompt: String,
    pub parameters: AiCompletionParameters,
}

impl AiCompletionRequest {
    pub fn validate(&self) -> Result<(), AiValidationError> {
        validate_identifier("request id", &self.request_id)?;
        validate_identifier("provider id", &self.provider_id)?;
        validate_identifier("model id", &self.model_id)?;
        let prompt_bytes = self
            .system_prompt
            .len()
            .saturating_add(self.user_prompt.len());
        if prompt_bytes > MAX_AI_PROMPT_BYTES {
            return Err(AiValidationError::PromptTooLong {
                maximum: MAX_AI_PROMPT_BYTES,
            });
        }
        self.parameters.validate()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiCompletionDelta {
    pub request_id: String,
    pub sequence: u32,
    pub text: String,
}

impl AiCompletionDelta {
    pub fn validate(&self) -> Result<(), AiValidationError> {
        validate_identifier("request id", &self.request_id)?;
        if self.text.len() > MAX_AI_DELTA_BYTES {
            return Err(AiValidationError::TooLong {
                field: "completion delta",
                maximum: MAX_AI_DELTA_BYTES,
            });
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

impl AiUsage {
    pub fn validate(&self) -> Result<(), AiValidationError> {
        validate_token_count("input tokens", self.input_tokens)?;
        validate_token_count("output tokens", self.output_tokens)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AiProviderErrorCategory {
    UnavailableProvider,
    MissingCredential,
    InvalidCredential,
    QuotaExhausted,
    RateLimited,
    RejectedRequest,
    TransportFailure,
    MalformedResponse,
    InternalFailure,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AiRecoveryAction {
    ConfigureCredential,
    Retry,
    ChooseDifferentModel,
    CheckProviderStatus,
    ReduceRequest,
    ContactProvider,
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiProviderError {
    pub provider_id: String,
    pub category: AiProviderErrorCategory,
    pub message: String,
    pub recovery_action: AiRecoveryAction,
}

impl AiProviderError {
    #[must_use]
    pub fn new(
        provider_id: impl Into<String>,
        category: AiProviderErrorCategory,
        message: &str,
        recovery_action: AiRecoveryAction,
    ) -> Self {
        Self {
            provider_id: provider_id.into(),
            category,
            message: bounded_message(message),
            recovery_action,
        }
    }

    pub fn validate(&self) -> Result<(), AiValidationError> {
        validate_identifier("provider id", &self.provider_id)?;
        if self.message.is_empty() {
            return Err(AiValidationError::Empty {
                field: "provider error message",
            });
        }
        if self.message.len() > MAX_AI_ERROR_MESSAGE_BYTES {
            return Err(AiValidationError::TooLong {
                field: "provider error message",
                maximum: MAX_AI_ERROR_MESSAGE_BYTES,
            });
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum AiCompletionEvent {
    Delta(AiCompletionDelta),
    Done {
        request_id: String,
        usage: Option<AiUsage>,
    },
    Cancelled {
        request_id: String,
    },
    Timeout {
        request_id: String,
    },
    ProviderError {
        request_id: String,
        error: AiProviderError,
    },
}

impl AiCompletionEvent {
    pub fn validate(&self) -> Result<(), AiValidationError> {
        match self {
            Self::Delta(delta) => delta.validate(),
            Self::Done { request_id, usage } => {
                validate_identifier("request id", request_id)?;
                if let Some(usage) = usage {
                    usage.validate()?;
                }
                Ok(())
            }
            Self::Cancelled { request_id } | Self::Timeout { request_id } => {
                validate_identifier("request id", request_id)
            }
            Self::ProviderError { request_id, error } => {
                validate_identifier("request id", request_id)?;
                error.validate()
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AiCompletionTerminal {
    Done { usage: Option<AiUsage> },
    Cancelled,
    Timeout,
    ProviderError(AiProviderError),
}

impl AiCompletionTerminal {
    #[must_use]
    pub fn into_event(self, request_id: String) -> AiCompletionEvent {
        match self {
            Self::Done { usage } => AiCompletionEvent::Done { request_id, usage },
            Self::Cancelled => AiCompletionEvent::Cancelled { request_id },
            Self::Timeout => AiCompletionEvent::Timeout { request_id },
            Self::ProviderError(error) => AiCompletionEvent::ProviderError { request_id, error },
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct AiCancellation {
    cancelled: Arc<AtomicBool>,
}

impl AiCancellation {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    #[must_use]
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum AiSinkError {
    #[error("completion event consumer is closed")]
    Closed,
}

pub trait AiEventSink: Send {
    fn send_delta(&mut self, delta: AiCompletionDelta) -> Result<(), AiSinkError>;
}

pub trait AiComplete: Send + Sync {
    fn complete(
        &self,
        request: &AiCompletionRequest,
        cancellation: &AiCancellation,
        sink: &mut dyn AiEventSink,
    ) -> AiCompletionTerminal;
}

fn validate_identifier(field: &'static str, value: &str) -> Result<(), AiValidationError> {
    if value.is_empty() {
        return Err(AiValidationError::Empty { field });
    }
    if value.len() > MAX_AI_IDENTIFIER_BYTES {
        return Err(AiValidationError::TooLong {
            field,
            maximum: MAX_AI_IDENTIFIER_BYTES,
        });
    }
    if !value.bytes().all(|byte| {
        byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':' | b'/')
    }) {
        return Err(AiValidationError::InvalidIdentifier { field });
    }
    Ok(())
}

fn validate_sampling_parameter(
    field: &'static str,
    value: Option<u16>,
) -> Result<(), AiValidationError> {
    if value.is_some_and(|value| value > 1_000) {
        return Err(AiValidationError::InvalidSamplingParameter { field });
    }
    Ok(())
}

fn validate_token_count(field: &'static str, value: u64) -> Result<(), AiValidationError> {
    if value > MAX_AI_TOKEN_COUNT {
        return Err(AiValidationError::TokenCountTooLarge {
            field,
            maximum: MAX_AI_TOKEN_COUNT,
        });
    }
    Ok(())
}

fn bounded_message(message: &str) -> String {
    let mut bounded = String::with_capacity(message.len().min(MAX_AI_ERROR_MESSAGE_BYTES));
    let mut previous_was_whitespace = false;

    for character in message.chars() {
        let character = if character.is_control() || character.is_whitespace() {
            ' '
        } else {
            character
        };
        if character == ' ' && previous_was_whitespace {
            continue;
        }
        if bounded.len() + character.len_utf8() > MAX_AI_ERROR_MESSAGE_BYTES {
            break;
        }
        bounded.push(character);
        previous_was_whitespace = character == ' ';
    }

    let bounded = bounded.trim().to_owned();
    if bounded.is_empty() {
        "provider request failed".to_owned()
    } else {
        bounded
    }
}

#[cfg(test)]
mod tests {
    use super::{
        AiCompletionEvent, AiCompletionParameters, AiCompletionRequest, AiProviderError,
        AiProviderErrorCategory, AiRecoveryAction, AiValidationError, MAX_AI_ERROR_MESSAGE_BYTES,
        MAX_AI_PROMPT_BYTES,
    };

    fn request() -> AiCompletionRequest {
        AiCompletionRequest {
            request_id: "request-1".into(),
            provider_id: "provider.local/v1".into(),
            model_id: "model:small".into(),
            system_prompt: "system".into(),
            user_prompt: "user".into(),
            parameters: AiCompletionParameters::default(),
        }
    }

    #[test]
    fn validates_bounded_provider_neutral_request() {
        assert_eq!(request().validate(), Ok(()));

        let mut oversized = request();
        oversized.user_prompt = "x".repeat(MAX_AI_PROMPT_BYTES + 1);
        assert_eq!(
            oversized.validate(),
            Err(AiValidationError::PromptTooLong {
                maximum: MAX_AI_PROMPT_BYTES
            })
        );

        let mut retries = request();
        retries.parameters.retry_count = 3;
        assert!(matches!(
            retries.validate(),
            Err(AiValidationError::TooManyRetries { .. })
        ));

        let mut output = request();
        output.parameters.max_output_bytes = 0;
        assert!(matches!(
            output.validate(),
            Err(AiValidationError::InvalidOutputLimit { .. })
        ));

        let mut timeout = request();
        timeout.parameters.timeout_ms = 0;
        assert!(matches!(
            timeout.validate(),
            Err(AiValidationError::InvalidTimeout { .. })
        ));

        let mut sampling = request();
        sampling.parameters.temperature_millis = Some(1_001);
        assert!(matches!(
            sampling.validate(),
            Err(AiValidationError::InvalidSamplingParameter { .. })
        ));
    }

    #[test]
    fn bounds_and_normalizes_safe_provider_errors() {
        let source = format!("  failed\n\t{}", "é".repeat(MAX_AI_ERROR_MESSAGE_BYTES));
        let error = AiProviderError::new(
            "fake",
            AiProviderErrorCategory::TransportFailure,
            &source,
            AiRecoveryAction::Retry,
        );

        assert!(error.message.len() <= MAX_AI_ERROR_MESSAGE_BYTES);
        assert!(!error.message.contains('\n'));
        assert_eq!(error.validate(), Ok(()));
    }

    #[test]
    fn serializes_transport_events_with_stable_terminal_tags() {
        let event = AiCompletionEvent::Timeout {
            request_id: "request-1".into(),
        };

        assert_eq!(
            serde_json::to_value(event).expect("serialize"),
            serde_json::json!({"type": "timeout", "requestId": "request-1"})
        );
    }
}
