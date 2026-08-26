use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    AiCancellation, AiProviderError, AiValidationError, MAX_AI_IDENTIFIER_BYTES,
    MAX_REMOTE_AI_LABEL_BYTES,
};

/// Groq's transcription endpoint caps uploads at 25 MB, which is the smallest
/// limit among the shipped adapters, so every provider shares it: a recording
/// either transcribes everywhere or is refused before any bytes leave.
pub const MAX_AI_AUDIO_BYTES: usize = 25 * 1024 * 1024;
pub const MAX_AI_TRANSCRIPT_BYTES: usize = 512 * 1024;
pub const MAX_AI_LANGUAGE_BYTES: usize = 16;

/// The audio containers a recorder is allowed to submit. This is the contract
/// with the renderer's `MediaRecorder`, not a sniffing layer: an adapter still
/// forwards the payload as opaque bytes and the provider does its own decoding.
pub const AI_AUDIO_MIME_TYPES: [&str; 5] = [
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
];

/// One bounded transcription request in transit from the shell to a provider
/// adapter. The audio rides here as raw bytes; the type is deliberately not
/// serializable so a recording can never enter a contract, an event, a log
/// line, or the run history by accident.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AiTranscriptionRequest {
    pub request_id: String,
    pub provider_id: String,
    pub model_id: String,
    pub mime_type: String,
    /// BCP-47 style hint such as `en` or `nl`. `None` lets the model detect.
    pub language: Option<String>,
    pub audio: Vec<u8>,
}

impl AiTranscriptionRequest {
    pub fn validate(&self) -> Result<(), AiValidationError> {
        validate_identifier("request id", &self.request_id)?;
        validate_identifier("provider id", &self.provider_id)?;
        validate_identifier("model id", &self.model_id)?;
        if !AI_AUDIO_MIME_TYPES.contains(&self.mime_type.as_str()) {
            return Err(AiValidationError::InvalidIdentifier {
                field: "audio mime type",
            });
        }
        if let Some(language) = &self.language {
            if language.is_empty() || language.len() > MAX_AI_LANGUAGE_BYTES {
                return Err(AiValidationError::InvalidIdentifier {
                    field: "language hint",
                });
            }
            if !language
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            {
                return Err(AiValidationError::InvalidIdentifier {
                    field: "language hint",
                });
            }
        }
        if self.audio.is_empty() {
            return Err(AiValidationError::Empty { field: "audio" });
        }
        if self.audio.len() > MAX_AI_AUDIO_BYTES {
            return Err(AiValidationError::TooLong {
                field: "audio",
                maximum: MAX_AI_AUDIO_BYTES,
            });
        }
        Ok(())
    }
}

/// How one transcription request ended. Transcription is request/response, not
/// a stream, so unlike completions there is no delta sink: the whole bounded
/// transcript arrives with the terminal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AiTranscriptionTerminal {
    Done { transcript: String },
    Cancelled,
    Timeout,
    ProviderError(AiProviderError),
}

/// The narrow speech-to-text capability. Adapters translate provider syntax
/// behind this seam exactly as [`crate::AiComplete`] adapters do for
/// completions, so the shell can swap or add vendors without the renderer or
/// the command layer changing shape.
pub trait AiTranscribe: Send + Sync {
    fn transcribe(
        &self,
        request: &AiTranscriptionRequest,
        cancellation: &AiCancellation,
    ) -> AiTranscriptionTerminal;
}

/// What the renderer receives for a finished transcription.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiTranscriptionResult {
    pub request_id: String,
    pub transcript: String,
}

/// One speech-to-text model the repository ships an adapter mapping for. This
/// is a separate catalogue from [`crate::RemoteAiCatalog`]: transcription
/// models are priced per audio minute rather than per token, so forcing them
/// into the completion catalogue would fabricate token prices.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiTranscriptionModel {
    pub provider_id: String,
    pub model_id: String,
    pub label: String,
}

impl AiTranscriptionModel {
    pub fn validate(&self) -> Result<(), AiValidationError> {
        validate_identifier("provider id", &self.provider_id)?;
        validate_identifier("model id", &self.model_id)?;
        if self.label.is_empty()
            || self.label.len() > MAX_REMOTE_AI_LABEL_BYTES
            || self.label.chars().any(char::is_control)
        {
            return Err(AiValidationError::InvalidIdentifier { field: "label" });
        }
        Ok(())
    }
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

#[cfg(test)]
mod tests {
    use super::{AiTranscriptionModel, AiTranscriptionRequest, MAX_AI_AUDIO_BYTES};
    use crate::AiValidationError;

    fn request() -> AiTranscriptionRequest {
        AiTranscriptionRequest {
            request_id: "request-1".into(),
            provider_id: "groq".into(),
            model_id: "whisper-large-v3-turbo".into(),
            mime_type: "audio/webm".into(),
            language: Some("en".into()),
            audio: vec![0x1a, 0x45, 0xdf, 0xa3],
        }
    }

    #[test]
    fn validates_bounded_transcription_requests() {
        assert_eq!(request().validate(), Ok(()));

        let mut no_hint = request();
        no_hint.language = None;
        assert_eq!(no_hint.validate(), Ok(()));

        let mut empty = request();
        empty.audio = Vec::new();
        assert_eq!(
            empty.validate(),
            Err(AiValidationError::Empty { field: "audio" })
        );

        let mut oversized = request();
        oversized.audio = vec![0; MAX_AI_AUDIO_BYTES + 1];
        assert!(matches!(
            oversized.validate(),
            Err(AiValidationError::TooLong { field: "audio", .. })
        ));
    }

    #[test]
    fn refuses_unsupported_containers_and_malformed_hints() {
        let mut mime = request();
        mime.mime_type = "video/webm".into();
        assert!(matches!(
            mime.validate(),
            Err(AiValidationError::InvalidIdentifier {
                field: "audio mime type"
            })
        ));

        let mut hint = request();
        hint.language = Some("en US".into());
        assert!(matches!(
            hint.validate(),
            Err(AiValidationError::InvalidIdentifier {
                field: "language hint"
            })
        ));

        let mut long_hint = request();
        long_hint.language = Some("x".repeat(17));
        assert!(long_hint.validate().is_err());
    }

    #[test]
    fn validates_catalogue_entries() {
        let model = AiTranscriptionModel {
            provider_id: "groq".into(),
            model_id: "whisper-large-v3-turbo".into(),
            label: "Whisper Large v3 Turbo".into(),
        };
        assert_eq!(model.validate(), Ok(()));

        let mut control = model.clone();
        control.label = "bad\nlabel".into();
        assert!(control.validate().is_err());
    }
}
