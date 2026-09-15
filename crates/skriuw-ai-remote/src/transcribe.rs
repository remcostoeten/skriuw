//! Speech-to-text through the SDK's adapters.
//!
//! The provider request syntax — Groq's multipart upload, Gemini's base64
//! `inlineData` part, the endpoint joins and the transcript parsing — moved into
//! `ai-providers` with its ADR 0006. What remains here is the projection onto
//! Skriuw's own [`AiTranscribe`] seam and its catalogue type, the same shape
//! [`model_listing`] already has for model listings.
//!
//! [`model_listing`]: crate::model_listing

use std::sync::Arc;

use skriuw_domain::{
    AiCancellation, AiTranscribe, AiTranscriptionModel, AiTranscriptionRequest,
    AiTranscriptionTerminal,
};

use crate::{RemoteAiModelAuthority, RemoteAiProvider, RemoteAiSetupError, RemoteProviderKind};

/// The speech-to-text catalogue, projected onto the renderer contract.
///
/// There is no discovery request: an entry exists exactly when the SDK ships an
/// adapter mapping for it.
#[must_use]
pub fn ai_transcription_models() -> Vec<AiTranscriptionModel> {
    ai_providers::transcription_models()
        .into_iter()
        .map(|model| AiTranscriptionModel {
            provider_id: model.provider_id,
            model_id: model.model_id,
            label: model.label,
        })
        .collect()
}

/// A remote provider offered through Skriuw's transcription seam.
///
/// A wrapper rather than an impl on the provider itself: both the trait and the
/// provider are now defined outside this crate, so the projection needs a local
/// type to hang on.
pub struct RemoteAiTranscriber {
    provider: RemoteAiProvider,
}

impl RemoteAiTranscriber {
    /// Builds a transcriber bound to Skriuw's user agent.
    ///
    /// # Errors
    ///
    /// [`RemoteAiSetupError`] when the endpoint or the HTTP client cannot be
    /// built.
    pub fn new(
        kind: RemoteProviderKind,
        credentials: Arc<dyn ai_providers::AiCredentialSource>,
        models: Arc<dyn RemoteAiModelAuthority>,
    ) -> Result<Self, RemoteAiSetupError> {
        Ok(Self {
            provider: crate::remote_provider(kind, credentials, models)?,
        })
    }
}

impl AiTranscribe for RemoteAiTranscriber {
    fn transcribe(
        &self,
        request: &AiTranscriptionRequest,
        cancellation: &AiCancellation,
    ) -> AiTranscriptionTerminal {
        // The recording is cloned once, at the boundary: the SDK owns its
        // request type and the domain type stays the renderer's.
        let sdk_request = ai_providers::AiTranscriptionRequest {
            request_id: request.request_id.clone(),
            provider_id: request.provider_id.clone(),
            model_id: request.model_id.clone(),
            mime_type: request.mime_type.clone(),
            language: request.language.clone(),
            audio: request.audio.clone(),
        };
        match self.provider.transcribe(&sdk_request, cancellation) {
            ai_providers::AiTranscriptionTerminal::Done { transcript } => {
                AiTranscriptionTerminal::Done { transcript }
            }
            ai_providers::AiTranscriptionTerminal::Cancelled => AiTranscriptionTerminal::Cancelled,
            ai_providers::AiTranscriptionTerminal::Timeout => AiTranscriptionTerminal::Timeout,
            ai_providers::AiTranscriptionTerminal::ProviderError(error) => {
                AiTranscriptionTerminal::ProviderError(error)
            }
            // `AiTranscriptionTerminal` is `#[non_exhaustive]`: a terminal this
            // build does not know is a malformed result rather than a silent
            // success, and upgrading the SDK is where it gets a real mapping.
            _ => AiTranscriptionTerminal::ProviderError(skriuw_domain::AiProviderError::new(
                &request.provider_id,
                skriuw_domain::AiProviderErrorCategory::MalformedResponse,
                "the transcription adapter reported an outcome this build does not understand",
                skriuw_domain::AiRecoveryAction::Retry,
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ai_transcription_models;
    use crate::{GEMINI_PROVIDER_ID, GROQ_PROVIDER_ID, RemoteProviderKind};

    /// The renderer reads this catalogue, so its projection must survive the
    /// crossing with valid entries and both transcribing providers present.
    #[test]
    fn projects_a_valid_transcription_catalogue() {
        let models = ai_transcription_models();

        assert!(!models.is_empty());
        for model in &models {
            assert_eq!(model.validate(), Ok(()));
            assert!(RemoteProviderKind::from_id(&model.provider_id).is_some());
        }
        assert!(
            models
                .iter()
                .any(|model| model.provider_id == GROQ_PROVIDER_ID)
        );
        assert!(
            models
                .iter()
                .any(|model| model.provider_id == GEMINI_PROVIDER_ID)
        );
    }
}
