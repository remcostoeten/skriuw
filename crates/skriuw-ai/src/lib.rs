//! Skriuw's completion seam, now provided by `ai-core`.
//!
//! The service, its channel port, the start errors and the deterministic fake
//! were extracted unchanged apart from the two approved behaviour changes
//! recorded in the SDK's `docs/extraction-inventory.md` (D1 lifecycle
//! hardening, D2 recording port). This crate keeps the names Skriuw's command
//! layer already imports and owns the one thing the SDK will not: a service
//! wired to Skriuw's stand-in provider for prompt-library checks.

pub use ai_core::{
    AiCompletionChannel, AiCompletionService, AiStartError, FakeAiProvider, FakeCompletionOutcome,
    FakeCompletionScript,
};

use std::sync::Arc;

use ai_core::AiComplete;

/// A service whose only provider is the deterministic fake registered as
/// `fake`. Every surface that must run without a network, a credential, or a
/// model uses this.
#[must_use]
pub fn fake_provider_service() -> AiCompletionService {
    let provider: Arc<dyn AiComplete> =
        Arc::new(FakeAiProvider::new(FakeCompletionScript::success([
            "fake ",
            "completion",
        ])));
    AiCompletionService::new([("fake".to_owned(), provider)])
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Mutex},
        thread,
        time::{Duration, Instant},
    };

    use skriuw_domain::{
        AI_RUN_ORIGIN_PLAYGROUND, AiCompletionEvent, AiCompletionParameters, AiCompletionRequest,
        AiSinkError,
    };

    use super::{AiCompletionChannel, fake_provider_service};

    #[derive(Clone, Default)]
    struct RecordingChannel {
        events: Arc<Mutex<Vec<AiCompletionEvent>>>,
    }

    impl AiCompletionChannel for RecordingChannel {
        fn send(&self, event: AiCompletionEvent) -> Result<(), AiSinkError> {
            self.events
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(event);
            Ok(())
        }
    }

    fn wait_for_terminal(channel: &RecordingChannel) -> Vec<AiCompletionEvent> {
        let deadline = Instant::now() + Duration::from_secs(1);
        loop {
            let events = channel
                .events
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone();
            if events
                .last()
                .is_some_and(|event| !matches!(event, AiCompletionEvent::Delta(_)))
            {
                return events;
            }
            assert!(Instant::now() < deadline, "completion did not terminalize");
            thread::yield_now();
        }
    }

    /// Every shipped prompt must be runnable end to end without a provider,
    /// credential, or network. The fake adapter is the permanent stand-in, so a
    /// built-in whose system prompt or parameter defaults fall outside the
    /// completion seam's bounds fails here rather than at a user's first click.
    /// The prompt library is Skriuw's, so this check stayed behind when the
    /// seam was extracted.
    #[test]
    fn the_fake_provider_runs_every_built_in_prompt() {
        let service = fake_provider_service();
        for built_in in skriuw_domain::BUILT_IN_PROMPTS {
            let request = AiCompletionRequest {
                request_id: format!("built-in-{}", built_in.id),
                provider_id: "fake".into(),
                model_id: "deterministic-v1".into(),
                system_prompt: built_in.system_prompt.into(),
                user_prompt: "The text the writer selected.".into(),
                prior_messages: Vec::new(),
                parameters: AiCompletionParameters {
                    max_output_bytes: built_in.parameters.max_output_bytes,
                    temperature_millis: built_in.parameters.temperature_millis,
                    ..AiCompletionParameters::default()
                },
            };
            request
                .validate()
                .unwrap_or_else(|error| panic!("built-in {} is unrunnable: {error}", built_in.id));

            let channel = RecordingChannel::default();
            service
                .start(
                    AI_RUN_ORIGIN_PLAYGROUND.to_owned(),
                    request,
                    channel.clone(),
                )
                .unwrap_or_else(|error| panic!("built-in {} did not start: {error}", built_in.id));
            let events = wait_for_terminal(&channel);

            assert!(
                matches!(events.first(), Some(AiCompletionEvent::Delta(_))),
                "built-in {} produced no output",
                built_in.id
            );
            assert!(
                matches!(events.last(), Some(AiCompletionEvent::Done { .. })),
                "built-in {} did not complete",
                built_in.id
            );
        }
    }
}
