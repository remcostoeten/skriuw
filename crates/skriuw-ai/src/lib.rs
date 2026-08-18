use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use skriuw_domain::{
    AiCancellation, AiComplete, AiCompletionDelta, AiCompletionRequest, AiCompletionTerminal,
    AiEventSink, AiProviderError, AiProviderErrorCategory, AiRecoveryAction, AiUsage,
    MAX_AI_RESPONSE_BYTES,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AiStartError {
    DuplicateRequest(String),
    InvalidRequest,
    WorkerUnavailable,
}

impl std::fmt::Display for AiStartError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateRequest(request_id) => {
                write!(formatter, "AI request {request_id} is already active")
            }
            Self::InvalidRequest => formatter.write_str("AI completion request is invalid"),
            Self::WorkerUnavailable => formatter.write_str("AI completion worker is unavailable"),
        }
    }
}

impl std::error::Error for AiStartError {}

pub trait AiCompletionChannel: Send + Sync + 'static {
    fn send(
        &self,
        event: skriuw_domain::AiCompletionEvent,
    ) -> Result<(), skriuw_domain::AiSinkError>;
}

#[derive(Default)]
pub struct AiCompletionService {
    providers: BTreeMap<String, Arc<dyn AiComplete>>,
    active: Arc<Mutex<HashMap<String, AiCancellation>>>,
}

impl AiCompletionService {
    #[must_use]
    pub fn new(providers: impl IntoIterator<Item = (String, Arc<dyn AiComplete>)>) -> Self {
        Self {
            providers: providers.into_iter().collect(),
            active: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[must_use]
    pub fn with_fake_provider() -> Self {
        let provider: Arc<dyn AiComplete> =
            Arc::new(FakeAiProvider::new(FakeCompletionScript::success([
                "fake ",
                "completion",
            ])));
        Self::new([("fake".to_owned(), provider)])
    }

    pub fn start(
        &self,
        request: AiCompletionRequest,
        channel: impl AiCompletionChannel,
    ) -> Result<(), AiStartError> {
        let channel: Arc<dyn AiCompletionChannel> = Arc::new(channel);
        if request.validate().is_err() {
            return Err(AiStartError::InvalidRequest);
        }
        let Some(provider) = self.providers.get(&request.provider_id).cloned() else {
            let terminal = AiCompletionTerminal::ProviderError(AiProviderError::new(
                request.provider_id.clone(),
                AiProviderErrorCategory::UnavailableProvider,
                "selected AI provider is unavailable",
                AiRecoveryAction::CheckProviderStatus,
            ));
            let _ = channel.send(terminal.into_event(request.request_id));
            return Ok(());
        };

        let cancellation = AiCancellation::new();
        {
            let mut active = self
                .active
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if active.contains_key(&request.request_id) {
                return Err(AiStartError::DuplicateRequest(request.request_id));
            }
            active.insert(request.request_id.clone(), cancellation.clone());
        }

        let active = Arc::clone(&self.active);
        let request_id = request.request_id.clone();
        let cleanup_request_id = request_id.clone();
        let worker = thread::Builder::new()
            .name(format!("skriuw-ai-{request_id}"))
            .spawn(move || {
                let mut sink = CompletionServiceSink {
                    channel: Arc::clone(&channel),
                    cancellation: cancellation.clone(),
                };
                let mut terminal = provider.complete(&request, &cancellation, &mut sink);
                let was_active = active
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .remove(&request_id)
                    .is_some();
                if !was_active {
                    return;
                }
                if cancellation.is_cancelled()
                    && matches!(terminal, AiCompletionTerminal::Done { .. })
                {
                    terminal = AiCompletionTerminal::Cancelled;
                }
                let _ = channel.send(terminal.into_event(request_id));
            });

        if worker.is_err() {
            self.active
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .remove(&cleanup_request_id);
            return Err(AiStartError::WorkerUnavailable);
        }
        Ok(())
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        let active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(cancellation) = active.get(request_id) else {
            return false;
        };
        cancellation.cancel();
        true
    }

    pub fn shutdown(&self) {
        let active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        for cancellation in active.values() {
            cancellation.cancel();
        }
    }
}

struct CompletionServiceSink {
    channel: Arc<dyn AiCompletionChannel>,
    cancellation: AiCancellation,
}

impl AiEventSink for CompletionServiceSink {
    fn send_delta(&mut self, delta: AiCompletionDelta) -> Result<(), skriuw_domain::AiSinkError> {
        self.channel
            .send(skriuw_domain::AiCompletionEvent::Delta(delta))
            .inspect_err(|_| self.cancellation.cancel())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FakeCompletionOutcome {
    Done { usage: Option<AiUsage> },
    Timeout,
    MalformedOutput,
    ProviderError(AiProviderError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FakeCompletionScript {
    pub tokens: Vec<String>,
    pub token_delay: Duration,
    pub outcome: FakeCompletionOutcome,
}

impl FakeCompletionScript {
    #[must_use]
    pub fn success(tokens: impl IntoIterator<Item = impl Into<String>>) -> Self {
        Self {
            tokens: tokens.into_iter().map(Into::into).collect(),
            token_delay: Duration::ZERO,
            outcome: FakeCompletionOutcome::Done { usage: None },
        }
    }
}

#[derive(Debug, Clone)]
pub struct FakeAiProvider {
    script: FakeCompletionScript,
}

impl FakeAiProvider {
    #[must_use]
    pub fn new(script: FakeCompletionScript) -> Self {
        Self { script }
    }

    fn wait_for_token(
        &self,
        cancellation: &AiCancellation,
        remaining: Duration,
        deadline: std::time::Instant,
    ) -> Result<(), AiCompletionTerminal> {
        let mut waited = Duration::ZERO;
        while waited < remaining {
            if cancellation.is_cancelled() {
                return Err(AiCompletionTerminal::Cancelled);
            }
            let until_deadline = deadline.saturating_duration_since(std::time::Instant::now());
            if until_deadline.is_zero() {
                cancellation.cancel();
                return Err(AiCompletionTerminal::Timeout);
            }
            let interval = (remaining - waited)
                .min(Duration::from_millis(1))
                .min(until_deadline);
            thread::sleep(interval);
            waited += interval;
        }
        Ok(())
    }

    fn rejected_request(&self, request: &AiCompletionRequest) -> AiCompletionTerminal {
        AiCompletionTerminal::ProviderError(AiProviderError::new(
            request.provider_id.clone(),
            AiProviderErrorCategory::RejectedRequest,
            "completion request is invalid",
            AiRecoveryAction::ReduceRequest,
        ))
    }

    fn malformed_response(
        &self,
        request: &AiCompletionRequest,
        message: &str,
        recovery_action: AiRecoveryAction,
    ) -> AiCompletionTerminal {
        AiCompletionTerminal::ProviderError(AiProviderError::new(
            request.provider_id.clone(),
            AiProviderErrorCategory::MalformedResponse,
            message,
            recovery_action,
        ))
    }
}

impl AiComplete for FakeAiProvider {
    fn complete(
        &self,
        request: &AiCompletionRequest,
        cancellation: &AiCancellation,
        sink: &mut dyn AiEventSink,
    ) -> AiCompletionTerminal {
        if request.validate().is_err() {
            return self.rejected_request(request);
        }

        let deadline = std::time::Instant::now()
            .checked_add(Duration::from_millis(u64::from(
                request.parameters.timeout_ms,
            )))
            .unwrap_or_else(std::time::Instant::now);
        let mut response_bytes = 0usize;

        for (sequence, token) in self.script.tokens.iter().enumerate() {
            if cancellation.is_cancelled() {
                return AiCompletionTerminal::Cancelled;
            }
            if let Err(terminal) =
                self.wait_for_token(cancellation, self.script.token_delay, deadline)
            {
                return terminal;
            }
            if std::time::Instant::now() >= deadline {
                cancellation.cancel();
                return AiCompletionTerminal::Timeout;
            }

            response_bytes = response_bytes.saturating_add(token.len());
            if response_bytes > usize::try_from(request.parameters.max_output_bytes).unwrap_or(0)
                || response_bytes > MAX_AI_RESPONSE_BYTES
            {
                cancellation.cancel();
                return self.malformed_response(
                    request,
                    "provider response exceeded the configured output limit",
                    AiRecoveryAction::ReduceRequest,
                );
            }

            let Ok(sequence) = u32::try_from(sequence) else {
                cancellation.cancel();
                return self.malformed_response(
                    request,
                    "provider returned too many response deltas",
                    AiRecoveryAction::Retry,
                );
            };
            let delta = AiCompletionDelta {
                request_id: request.request_id.clone(),
                sequence,
                text: token.clone(),
            };
            if delta.validate().is_err() {
                cancellation.cancel();
                return self.malformed_response(
                    request,
                    "provider returned an invalid delta",
                    AiRecoveryAction::Retry,
                );
            }
            if sink.send_delta(delta).is_err() {
                cancellation.cancel();
                return AiCompletionTerminal::Cancelled;
            }
        }

        if cancellation.is_cancelled() {
            return AiCompletionTerminal::Cancelled;
        }

        match &self.script.outcome {
            FakeCompletionOutcome::Done { usage } => {
                if usage
                    .as_ref()
                    .is_some_and(|usage| usage.validate().is_err())
                {
                    cancellation.cancel();
                    return self.malformed_response(
                        request,
                        "provider returned invalid usage",
                        AiRecoveryAction::Retry,
                    );
                }
                AiCompletionTerminal::Done {
                    usage: usage.clone(),
                }
            }
            FakeCompletionOutcome::Timeout => {
                cancellation.cancel();
                AiCompletionTerminal::Timeout
            }
            FakeCompletionOutcome::MalformedOutput => {
                cancellation.cancel();
                self.malformed_response(
                    request,
                    "provider returned malformed output",
                    AiRecoveryAction::Retry,
                )
            }
            FakeCompletionOutcome::ProviderError(error) => {
                if error.validate().is_err() {
                    cancellation.cancel();
                    return self.malformed_response(
                        request,
                        "provider returned an invalid error",
                        AiRecoveryAction::Retry,
                    );
                }
                AiCompletionTerminal::ProviderError(error.clone())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Mutex},
        thread,
        time::{Duration, Instant},
    };

    use skriuw_domain::{
        AiCancellation, AiComplete, AiCompletionDelta, AiCompletionEvent, AiCompletionParameters,
        AiCompletionRequest, AiCompletionTerminal, AiEventSink, AiProviderErrorCategory,
        AiSinkError,
    };

    use super::{
        AiCompletionChannel, AiCompletionService, AiStartError, FakeAiProvider,
        FakeCompletionOutcome, FakeCompletionScript,
    };

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

    struct RecordingSink {
        deltas: Vec<AiCompletionDelta>,
        cancellation: Option<AiCancellation>,
        close_after: Option<usize>,
    }

    impl RecordingSink {
        fn open() -> Self {
            Self {
                deltas: Vec::new(),
                cancellation: None,
                close_after: None,
            }
        }
    }

    impl AiEventSink for RecordingSink {
        fn send_delta(&mut self, delta: AiCompletionDelta) -> Result<(), AiSinkError> {
            if self.close_after == Some(self.deltas.len()) {
                return Err(AiSinkError::Closed);
            }
            self.deltas.push(delta);
            if let Some(cancellation) = &self.cancellation {
                cancellation.cancel();
            }
            Ok(())
        }
    }

    fn request(timeout_ms: u32) -> AiCompletionRequest {
        AiCompletionRequest {
            request_id: "request-1".into(),
            provider_id: "fake".into(),
            model_id: "deterministic-v1".into(),
            system_prompt: "Be concise.".into(),
            user_prompt: "Write a sentence.".into(),
            parameters: AiCompletionParameters {
                timeout_ms,
                ..AiCompletionParameters::default()
            },
        }
    }

    #[test]
    fn streams_ordered_tokens_and_completes() {
        let provider = FakeAiProvider::new(FakeCompletionScript::success(["one", " two"]));
        let mut sink = RecordingSink::open();

        let terminal = provider.complete(&request(100), &AiCancellation::new(), &mut sink);

        assert_eq!(terminal, AiCompletionTerminal::Done { usage: None });
        assert_eq!(sink.deltas.len(), 2);
        assert_eq!(sink.deltas[0].sequence, 0);
        assert_eq!(sink.deltas[1].sequence, 1);
        assert_eq!(sink.deltas[0].request_id, "request-1");
    }

    #[test]
    fn aborts_token_production_mid_stream() {
        let provider = FakeAiProvider::new(FakeCompletionScript::success(["one", "two"]));
        let cancellation = AiCancellation::new();
        let mut sink = RecordingSink {
            deltas: Vec::new(),
            cancellation: Some(cancellation.clone()),
            close_after: None,
        };

        let terminal = provider.complete(&request(100), &cancellation, &mut sink);

        assert_eq!(terminal, AiCompletionTerminal::Cancelled);
        assert_eq!(sink.deltas.len(), 1);
    }

    #[test]
    fn times_out_before_delivering_a_late_token() {
        let provider = FakeAiProvider::new(FakeCompletionScript {
            tokens: vec!["late".into()],
            token_delay: Duration::from_millis(5),
            outcome: FakeCompletionOutcome::Done { usage: None },
        });
        let cancellation = AiCancellation::new();
        let mut sink = RecordingSink::open();

        let terminal = provider.complete(&request(1), &cancellation, &mut sink);

        assert_eq!(terminal, AiCompletionTerminal::Timeout);
        assert!(cancellation.is_cancelled());
        assert!(sink.deltas.is_empty());
    }

    #[test]
    fn classifies_malformed_provider_output() {
        let provider = FakeAiProvider::new(FakeCompletionScript {
            tokens: Vec::new(),
            token_delay: Duration::ZERO,
            outcome: FakeCompletionOutcome::MalformedOutput,
        });
        let mut sink = RecordingSink::open();

        let terminal = provider.complete(&request(100), &AiCancellation::new(), &mut sink);

        let AiCompletionTerminal::ProviderError(error) = terminal else {
            panic!("expected provider error");
        };
        assert_eq!(error.category, AiProviderErrorCategory::MalformedResponse);
    }

    #[test]
    fn rejects_response_bytes_beyond_the_request_limit() {
        let provider = FakeAiProvider::new(FakeCompletionScript::success(["large"]));
        let mut bounded_request = request(100);
        bounded_request.parameters.max_output_bytes = 4;
        let mut sink = RecordingSink::open();

        let terminal = provider.complete(&bounded_request, &AiCancellation::new(), &mut sink);

        let AiCompletionTerminal::ProviderError(error) = terminal else {
            panic!("expected provider error");
        };
        assert_eq!(error.category, AiProviderErrorCategory::MalformedResponse);
        assert!(sink.deltas.is_empty());
    }

    #[test]
    fn closed_surface_cancels_and_discards_late_results() {
        let provider = FakeAiProvider::new(FakeCompletionScript::success(["late", "later"]));
        let cancellation = AiCancellation::new();
        let mut sink = RecordingSink {
            deltas: Vec::new(),
            cancellation: None,
            close_after: Some(0),
        };

        let terminal = provider.complete(&request(100), &cancellation, &mut sink);

        assert_eq!(terminal, AiCompletionTerminal::Cancelled);
        assert!(cancellation.is_cancelled());
        assert!(sink.deltas.is_empty());
    }

    /// Every shipped prompt must be runnable end to end without a provider,
    /// credential, or network. The fake adapter is the permanent stand-in, so a
    /// built-in whose system prompt or parameter defaults fall outside the
    /// completion seam's bounds fails here rather than at a user's first click.
    #[test]
    fn the_fake_provider_runs_every_built_in_prompt() {
        let service = AiCompletionService::with_fake_provider();
        for built_in in skriuw_domain::BUILT_IN_PROMPTS {
            let request = AiCompletionRequest {
                request_id: format!("built-in-{}", built_in.id),
                provider_id: "fake".into(),
                model_id: "deterministic-v1".into(),
                system_prompt: built_in.system_prompt.into(),
                user_prompt: "The text the writer selected.".into(),
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
                .start(request, channel.clone())
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

    #[test]
    fn service_streams_events_and_releases_the_request_id() {
        let service = AiCompletionService::with_fake_provider();
        let channel = RecordingChannel::default();

        service
            .start(request(100), channel.clone())
            .expect("start completion");
        let events = wait_for_terminal(&channel);

        assert!(matches!(events[0], AiCompletionEvent::Delta(_)));
        assert!(matches!(
            events.last(),
            Some(AiCompletionEvent::Done { .. })
        ));
        assert!(!service.cancel("request-1"));
    }

    #[test]
    fn service_rejects_duplicate_ids_and_cancels_the_active_provider() {
        let provider: Arc<dyn AiComplete> = Arc::new(FakeAiProvider::new(FakeCompletionScript {
            tokens: vec!["late".into()],
            token_delay: Duration::from_millis(100),
            outcome: FakeCompletionOutcome::Done { usage: None },
        }));
        let service = AiCompletionService::new([("fake".to_owned(), provider)]);
        let channel = RecordingChannel::default();

        service
            .start(request(500), channel.clone())
            .expect("start completion");
        assert_eq!(
            service.start(request(500), RecordingChannel::default()),
            Err(AiStartError::DuplicateRequest("request-1".into()))
        );
        assert!(service.cancel("request-1"));

        let events = wait_for_terminal(&channel);
        assert!(matches!(
            events.last(),
            Some(AiCompletionEvent::Cancelled { .. })
        ));
    }
}
