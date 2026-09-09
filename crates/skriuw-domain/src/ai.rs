//! The provider-neutral completion seam, now owned by `ai-core`.
//!
//! These names and their serialized shapes were extracted from this module; the
//! re-export keeps `skriuw_domain::Ai*` working for every existing consumer and
//! keeps the renderer contract generated from one definition. Skriuw-specific
//! concerns — prompts, history, consent, catalogs — stay in this crate.

pub use ai_core::{
    AiCancellation, AiComplete, AiCompletionDelta, AiCompletionEvent, AiCompletionParameters,
    AiCompletionRequest, AiCompletionTerminal, AiEventSink, AiProviderError,
    AiProviderErrorCategory, AiRecoveryAction, AiSinkError, AiUsage, AiValidationError,
    MAX_AI_DELTA_BYTES, MAX_AI_DURATION_MS, MAX_AI_ERROR_MESSAGE_BYTES, MAX_AI_IDENTIFIER_BYTES,
    MAX_AI_PROMPT_BYTES, MAX_AI_RESPONSE_BYTES, MAX_AI_RETRIES, MAX_AI_TOKEN_COUNT,
};

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
            prior_messages: Vec::new(),
            parameters: AiCompletionParameters::default(),
        }
    }

    /// Retained after extraction on purpose: these are Skriuw's own assertions
    /// about the bounds and wire tags it depends on, and they must keep passing
    /// against the extracted definition, not only against the SDK's copy.
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
