//! Bring-your-own-key remote provider adapters.
//!
//! Every provider here implements the domain-owned [`AiComplete`] seam and
//! resolves its API key through the narrow [`AiCredentialSource`] capability at
//! the moment a consented request starts. Key bytes never enter a URL, a log
//! line, a contract type, or a safe provider error.

mod provider;

use std::{
    io::{BufRead, BufReader, Read},
    sync::Arc,
    time::{Duration, Instant},
};

use reqwest::{StatusCode, Url, blocking::Client};
use skriuw_domain::{
    AiCancellation, AiComplete, AiCompletionDelta, AiCompletionRequest, AiCompletionTerminal,
    AiCredential, AiCredentialSource, AiEventSink, AiProviderError, AiProviderErrorCategory,
    AiRecoveryAction, AiUsage, MAX_AI_RESPONSE_BYTES, RemoteAiCatalog, RemoteAiCatalogError,
};

use provider::ProviderEvent;
pub use provider::{GEMINI_PROVIDER_ID, GROQ_PROVIDER_ID, RemoteProviderKind};

const CATALOG_SOURCE: &str = include_str!("../models.json");
const MAX_STREAM_EVENT_BYTES: u64 = 64 * 1024;
const MAX_VERIFICATION_RESPONSE_BYTES: u64 = 256 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const VERIFICATION_TIMEOUT: Duration = Duration::from_secs(30);
const SSE_DATA_PREFIX: &str = "data:";
const SSE_DONE_PAYLOAD: &str = "[DONE]";

/// Parses and validates the repository-owned remote model catalog. There is no
/// discovery request: refreshing the catalog re-reads this embedded document.
pub fn remote_ai_catalog() -> Result<RemoteAiCatalog, RemoteAiCatalogError> {
    let catalog: RemoteAiCatalog = serde_json::from_str(CATALOG_SOURCE)
        .map_err(|_| RemoteAiCatalogError::UnversionedCatalog)?;
    catalog.validate()?;
    Ok(catalog)
}

pub struct RemoteAiProvider {
    kind: RemoteProviderKind,
    base_url: Url,
    client: Client,
    credentials: Arc<dyn AiCredentialSource>,
}

impl RemoteAiProvider {
    pub fn new(
        kind: RemoteProviderKind,
        credentials: Arc<dyn AiCredentialSource>,
    ) -> Result<Self, RemoteAiSetupError> {
        Self::with_base_url(kind, kind.default_base_url(), credentials)
    }

    fn with_base_url(
        kind: RemoteProviderKind,
        base_url: &str,
        credentials: Arc<dyn AiCredentialSource>,
    ) -> Result<Self, RemoteAiSetupError> {
        let base_url = Url::parse(base_url).map_err(|_| RemoteAiSetupError::InvalidEndpoint)?;
        let client = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .user_agent("Skriuw")
            .build()
            .map_err(|_| RemoteAiSetupError::TransportUnavailable)?;
        Ok(Self {
            kind,
            base_url,
            client,
            credentials,
        })
    }

    #[must_use]
    pub fn kind(&self) -> RemoteProviderKind {
        self.kind
    }

    #[must_use]
    pub fn supports_model(&self, model_id: &str) -> bool {
        remote_ai_catalog().ok().is_some_and(|catalog| {
            catalog
                .models_for(self.kind.id())
                .iter()
                .any(|model| model.model_id == model_id)
        })
    }

    /// Spends one key on the smallest metered request the provider supports and
    /// reports only whether it was accepted. Callers run this from an explicit
    /// user action; nothing here runs on startup or when settings open.
    pub fn verify_credential(
        &self,
        model_id: &str,
        credential: &AiCredential,
    ) -> Result<(), AiProviderError> {
        if !self.supports_model(model_id) {
            return Err(self.error(
                AiProviderErrorCategory::RejectedRequest,
                "the selected model is not available for this provider",
                AiRecoveryAction::ChooseDifferentModel,
            ));
        }
        let Some(url) = self.kind.endpoint(&self.base_url, model_id, false) else {
            return Err(self.error(
                AiProviderErrorCategory::InternalFailure,
                "provider endpoint could not be built",
                AiRecoveryAction::None,
            ));
        };
        let response = self
            .kind
            .authorize(self.client.post(url), credential)
            .timeout(VERIFICATION_TIMEOUT)
            .json(&self.kind.verification_body(model_id))
            .send()
            .map_err(|error| self.transport_error(&error))?;
        let status = response.status();
        // The body is drained under a bound and discarded: a provider error
        // body can contain the echoed request and must not reach the renderer.
        let mut sink = Vec::new();
        let _ = response
            .take(MAX_VERIFICATION_RESPONSE_BYTES)
            .read_to_end(&mut sink);
        if status.is_success() {
            Ok(())
        } else {
            Err(self.status_error(status))
        }
    }

    fn stream_completion(
        &self,
        request: &AiCompletionRequest,
        credential: &AiCredential,
        cancellation: &AiCancellation,
        sink: &mut dyn AiEventSink,
    ) -> AiCompletionTerminal {
        let Some(url) = self.kind.endpoint(&self.base_url, &request.model_id, true) else {
            return AiCompletionTerminal::ProviderError(self.error(
                AiProviderErrorCategory::InternalFailure,
                "provider endpoint could not be built",
                AiRecoveryAction::None,
            ));
        };
        let timeout = Duration::from_millis(u64::from(request.parameters.timeout_ms));
        let deadline = Instant::now()
            .checked_add(timeout)
            .unwrap_or_else(Instant::now);
        let response = match self
            .kind
            .authorize(self.client.post(url), credential)
            .timeout(timeout)
            .json(&self.kind.completion_body(request, true))
            .send()
        {
            Ok(response) => response,
            Err(error) if error.is_timeout() => return AiCompletionTerminal::Timeout,
            Err(error) => {
                return AiCompletionTerminal::ProviderError(self.transport_error(&error));
            }
        };
        let status = response.status();
        if !status.is_success() {
            let mut discarded = Vec::new();
            let _ = response
                .take(MAX_VERIFICATION_RESPONSE_BYTES)
                .read_to_end(&mut discarded);
            return AiCompletionTerminal::ProviderError(self.status_error(status));
        }

        let mut reader = BufReader::new(response.take(MAX_AI_RESPONSE_BYTES as u64 + 1));
        let mut line = String::new();
        let mut sequence = 0u32;
        let mut response_bytes = 0usize;
        let mut usage: Option<AiUsage> = None;
        let mut saw_event = false;

        loop {
            if cancellation.is_cancelled() {
                return AiCompletionTerminal::Cancelled;
            }
            if Instant::now() >= deadline {
                cancellation.cancel();
                return AiCompletionTerminal::Timeout;
            }
            line.clear();
            let read = match reader
                .by_ref()
                .take(MAX_STREAM_EVENT_BYTES + 1)
                .read_line(&mut line)
            {
                Ok(read) => read,
                Err(_) => {
                    return AiCompletionTerminal::ProviderError(self.error(
                        AiProviderErrorCategory::TransportFailure,
                        "the provider response stream failed",
                        AiRecoveryAction::Retry,
                    ));
                }
            };
            if read == 0 {
                return if saw_event {
                    AiCompletionTerminal::Done { usage }
                } else {
                    AiCompletionTerminal::ProviderError(self.error(
                        AiProviderErrorCategory::MalformedResponse,
                        "the provider closed the stream without producing a response",
                        AiRecoveryAction::Retry,
                    ))
                };
            }
            if read as u64 > MAX_STREAM_EVENT_BYTES {
                cancellation.cancel();
                return AiCompletionTerminal::ProviderError(self.error(
                    AiProviderErrorCategory::MalformedResponse,
                    "the provider returned an oversized stream event",
                    AiRecoveryAction::Retry,
                ));
            }
            let Some(payload) = sse_payload(&line) else {
                continue;
            };
            if payload == SSE_DONE_PAYLOAD {
                return AiCompletionTerminal::Done { usage };
            }
            let Some(event) = self.kind.parse_event(payload) else {
                cancellation.cancel();
                return AiCompletionTerminal::ProviderError(self.error(
                    AiProviderErrorCategory::MalformedResponse,
                    "the provider returned malformed completion data",
                    AiRecoveryAction::Retry,
                ));
            };
            saw_event = true;
            if event.usage.is_some() {
                usage = event.usage.clone();
            }
            if !event.text.is_empty() {
                match self.forward(request, &event, sequence, &mut response_bytes, sink) {
                    Ok(()) => {}
                    Err(terminal) => {
                        cancellation.cancel();
                        return terminal;
                    }
                }
                let Some(next) = sequence.checked_add(1) else {
                    cancellation.cancel();
                    return AiCompletionTerminal::ProviderError(self.error(
                        AiProviderErrorCategory::MalformedResponse,
                        "the provider returned too many response deltas",
                        AiRecoveryAction::Retry,
                    ));
                };
                sequence = next;
            }
            if event.finished {
                return AiCompletionTerminal::Done { usage };
            }
        }
    }

    fn forward(
        &self,
        request: &AiCompletionRequest,
        event: &ProviderEvent,
        sequence: u32,
        response_bytes: &mut usize,
        sink: &mut dyn AiEventSink,
    ) -> Result<(), AiCompletionTerminal> {
        *response_bytes = response_bytes.saturating_add(event.text.len());
        if *response_bytes > request.parameters.max_output_bytes as usize
            || *response_bytes > MAX_AI_RESPONSE_BYTES
        {
            return Err(AiCompletionTerminal::ProviderError(self.error(
                AiProviderErrorCategory::MalformedResponse,
                "the provider response exceeded the configured output limit",
                AiRecoveryAction::ReduceRequest,
            )));
        }
        let delta = AiCompletionDelta {
            request_id: request.request_id.clone(),
            sequence,
            text: event.text.clone(),
        };
        if delta.validate().is_err() {
            return Err(AiCompletionTerminal::ProviderError(self.error(
                AiProviderErrorCategory::MalformedResponse,
                "the provider returned an invalid response delta",
                AiRecoveryAction::Retry,
            )));
        }
        if sink.send_delta(delta).is_err() {
            return Err(AiCompletionTerminal::Cancelled);
        }
        Ok(())
    }

    fn error(
        &self,
        category: AiProviderErrorCategory,
        message: &str,
        recovery_action: AiRecoveryAction,
    ) -> AiProviderError {
        AiProviderError::new(self.kind.id(), category, message, recovery_action)
    }

    /// Maps provider HTTP status onto the distinct, actionable states the
    /// settings and editor surfaces render. Response bodies stay out: they can
    /// echo the request and, for some providers, the key prefix.
    fn status_error(&self, status: StatusCode) -> AiProviderError {
        match status {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => self.error(
                AiProviderErrorCategory::InvalidCredential,
                "the provider rejected this API key",
                AiRecoveryAction::ConfigureCredential,
            ),
            StatusCode::PAYMENT_REQUIRED => self.error(
                AiProviderErrorCategory::QuotaExhausted,
                "this provider account has no remaining credit",
                AiRecoveryAction::ContactProvider,
            ),
            StatusCode::TOO_MANY_REQUESTS => self.error(
                AiProviderErrorCategory::RateLimited,
                "the provider is rate limiting this key",
                AiRecoveryAction::Retry,
            ),
            StatusCode::NOT_FOUND => self.error(
                AiProviderErrorCategory::UnavailableProvider,
                "the provider does not offer this model to this key",
                AiRecoveryAction::ChooseDifferentModel,
            ),
            StatusCode::PAYLOAD_TOO_LARGE => self.error(
                AiProviderErrorCategory::RejectedRequest,
                "the request was larger than the provider accepts",
                AiRecoveryAction::ReduceRequest,
            ),
            status if status.is_server_error() => self.error(
                AiProviderErrorCategory::UnavailableProvider,
                "the provider reported a server-side failure",
                AiRecoveryAction::CheckProviderStatus,
            ),
            _ => self.error(
                AiProviderErrorCategory::RejectedRequest,
                "the provider rejected the request",
                AiRecoveryAction::ReduceRequest,
            ),
        }
    }

    fn transport_error(&self, error: &reqwest::Error) -> AiProviderError {
        if error.is_timeout() {
            return self.error(
                AiProviderErrorCategory::TransportFailure,
                "the provider did not respond in time",
                AiRecoveryAction::Retry,
            );
        }
        if error.is_connect() {
            return self.error(
                AiProviderErrorCategory::TransportFailure,
                "Skriuw could not reach the provider. Check your network connection.",
                AiRecoveryAction::Retry,
            );
        }
        self.error(
            AiProviderErrorCategory::TransportFailure,
            "the request to the provider failed",
            AiRecoveryAction::Retry,
        )
    }
}

impl AiComplete for RemoteAiProvider {
    fn complete(
        &self,
        request: &AiCompletionRequest,
        cancellation: &AiCancellation,
        sink: &mut dyn AiEventSink,
    ) -> AiCompletionTerminal {
        if request.validate().is_err()
            || request.provider_id != self.kind.id()
            || !self.supports_model(&request.model_id)
        {
            return AiCompletionTerminal::ProviderError(self.error(
                AiProviderErrorCategory::RejectedRequest,
                "the completion request is not valid for this provider",
                AiRecoveryAction::ReduceRequest,
            ));
        }
        if cancellation.is_cancelled() {
            return AiCompletionTerminal::Cancelled;
        }
        // Resolving the credential first means an unconfigured or unconsented
        // provider terminalizes before any socket is opened.
        let credential = match self.credentials.resolve(self.kind.id()) {
            Ok(credential) => credential,
            Err(error) => {
                return AiCompletionTerminal::ProviderError(
                    error.into_provider_error(self.kind.id()),
                );
            }
        };
        self.stream_completion(request, &credential, cancellation, sink)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteAiSetupError {
    InvalidEndpoint,
    TransportUnavailable,
}

impl std::fmt::Display for RemoteAiSetupError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidEndpoint => formatter.write_str("remote provider endpoint is invalid"),
            Self::TransportUnavailable => {
                formatter.write_str("remote provider transport is unavailable")
            }
        }
    }
}

impl std::error::Error for RemoteAiSetupError {}

fn sse_payload(line: &str) -> Option<&str> {
    let trimmed = line.trim_end_matches(['\r', '\n']);
    let payload = trimmed.strip_prefix(SSE_DATA_PREFIX)?.trim_start();
    (!payload.is_empty()).then_some(payload)
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::Arc,
        thread,
    };

    use skriuw_domain::{
        AiCancellation, AiComplete, AiCompletionDelta, AiCompletionParameters, AiCompletionRequest,
        AiCompletionTerminal, AiCredential, AiCredentialError, AiCredentialSource, AiEventSink,
        AiProviderErrorCategory, AiRecoveryAction, AiSinkError,
    };

    use super::{
        GEMINI_PROVIDER_ID, GROQ_PROVIDER_ID, RemoteAiProvider, RemoteProviderKind, sse_payload,
    };

    const KEY: &str = "sk-test-provider-key";

    struct StoredKey;

    impl AiCredentialSource for StoredKey {
        fn resolve(&self, _provider_id: &str) -> Result<AiCredential, AiCredentialError> {
            AiCredential::new(KEY)
        }
    }

    struct RefusedKey(AiCredentialError);

    impl AiCredentialSource for RefusedKey {
        fn resolve(&self, _provider_id: &str) -> Result<AiCredential, AiCredentialError> {
            Err(self.0)
        }
    }

    #[derive(Default)]
    struct RecordingSink {
        deltas: Vec<AiCompletionDelta>,
        close_after: Option<usize>,
    }

    impl AiEventSink for RecordingSink {
        fn send_delta(&mut self, delta: AiCompletionDelta) -> Result<(), AiSinkError> {
            if self.close_after == Some(self.deltas.len()) {
                return Err(AiSinkError::Closed);
            }
            self.deltas.push(delta);
            Ok(())
        }
    }

    struct Captured {
        request: String,
    }

    fn request(provider_id: &str, model_id: &str) -> AiCompletionRequest {
        AiCompletionRequest {
            request_id: "request-1".into(),
            provider_id: provider_id.into(),
            model_id: model_id.into(),
            system_prompt: "Be concise.".into(),
            user_prompt: "Name a colour.".into(),
            parameters: AiCompletionParameters::default(),
        }
    }

    fn serve_once(
        status_line: &'static str,
        content_type: &'static str,
        body: String,
    ) -> (String, thread::JoinHandle<Captured>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut buffer = [0u8; 16 * 1024];
            let read = stream.read(&mut buffer).expect("read request");
            write!(
                stream,
                "HTTP/1.1 {status_line}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len(),
            )
            .expect("write response");
            Captured {
                request: String::from_utf8_lossy(&buffer[..read]).into_owned(),
            }
        });
        (format!("http://{address}/"), server)
    }

    fn build_provider(
        kind: RemoteProviderKind,
        base_url: &str,
        credentials: Arc<dyn AiCredentialSource>,
    ) -> RemoteAiProvider {
        RemoteAiProvider::with_base_url(kind, base_url, credentials).expect("provider")
    }

    #[test]
    fn parses_only_sse_data_frames() {
        assert_eq!(sse_payload("data: {\"a\":1}\n"), Some("{\"a\":1}"));
        assert_eq!(sse_payload("data:[DONE]\r\n"), Some("[DONE]"));
        assert_eq!(sse_payload("event: message\n"), None);
        assert_eq!(sse_payload("\n"), None);
        assert_eq!(sse_payload("data: \n"), None);
    }

    #[test]
    fn ships_a_valid_repository_catalogue_for_both_providers() {
        let catalog = super::remote_ai_catalog().expect("catalog");

        assert_eq!(catalog.validate(), Ok(()));
        assert!(!catalog.models_for(GEMINI_PROVIDER_ID).is_empty());
        assert_eq!(catalog.models_for(GROQ_PROVIDER_ID).len(), 3);
        assert!(
            catalog
                .models_for(GROQ_PROVIDER_ID)
                .iter()
                .all(|model| model.provider_id == GROQ_PROVIDER_ID)
        );
        assert!(catalog.models_for("openai").is_empty());
    }

    #[test]
    fn streams_gemini_deltas_and_reports_usage() {
        let body = concat!(
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"blue\"}]}}]}\n\n",
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\" green\"}]}}],",
            "\"usageMetadata\":{\"promptTokenCount\":7,\"candidatesTokenCount\":2}}\n\n"
        )
        .to_owned();
        let (base, server) = serve_once("200 OK", "text/event-stream", body);
        let provider = build_provider(RemoteProviderKind::Gemini, &base, Arc::new(StoredKey));
        let mut sink = RecordingSink::default();

        let terminal = provider.complete(
            &request(GEMINI_PROVIDER_ID, "gemini-2.5-flash"),
            &AiCancellation::new(),
            &mut sink,
        );

        assert_eq!(
            terminal,
            AiCompletionTerminal::Done {
                usage: Some(skriuw_domain::AiUsage {
                    input_tokens: 7,
                    output_tokens: 2,
                }),
            }
        );
        assert_eq!(sink.deltas.len(), 2);
        assert_eq!(sink.deltas[0].text, "blue");
        assert_eq!(sink.deltas[1].sequence, 1);
        let captured = server.join().expect("server");
        assert!(
            captured
                .request
                .contains("POST /v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse")
        );
        assert!(captured.request.contains("x-goog-api-key"));
    }

    #[test]
    fn streams_groq_deltas_and_stops_at_the_done_sentinel() {
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"blue\"},\"finish_reason\":null}]}\n\n",
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":1}}\n\n",
            "data: [DONE]\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"late\"}}]}\n\n"
        )
        .to_owned();
        let (base, server) = serve_once("200 OK", "text/event-stream", body);
        let provider = build_provider(RemoteProviderKind::Groq, &base, Arc::new(StoredKey));
        let mut sink = RecordingSink::default();

        let terminal = provider.complete(
            &request(GROQ_PROVIDER_ID, "openai/gpt-oss-20b"),
            &AiCancellation::new(),
            &mut sink,
        );

        assert_eq!(
            terminal,
            AiCompletionTerminal::Done {
                usage: Some(skriuw_domain::AiUsage {
                    input_tokens: 5,
                    output_tokens: 1,
                }),
            }
        );
        assert_eq!(sink.deltas.len(), 1, "text after [DONE] must be discarded");
        let captured = server.join().expect("server");
        assert!(
            captured
                .request
                .contains("POST /openai/v1/chat/completions")
        );
        assert!(captured.request.contains("authorization: Bearer"));
        assert!(captured.request.contains("\"include_usage\":true"));
    }

    #[test]
    fn never_opens_a_socket_without_a_credential() {
        let unreachable = "http://127.0.0.1:1/";
        for (kind, provider_id) in [
            (RemoteProviderKind::Gemini, GEMINI_PROVIDER_ID),
            (RemoteProviderKind::Groq, GROQ_PROVIDER_ID),
        ] {
            let provider = build_provider(
                kind,
                unreachable,
                Arc::new(RefusedKey(AiCredentialError::Missing)),
            );
            let mut sink = RecordingSink::default();

            let model_id = match kind {
                RemoteProviderKind::Gemini => "gemini-2.5-flash",
                RemoteProviderKind::Groq => "openai/gpt-oss-20b",
            };
            let terminal = provider.complete(
                &request(provider_id, model_id),
                &AiCancellation::new(),
                &mut sink,
            );

            let AiCompletionTerminal::ProviderError(error) = terminal else {
                panic!("expected a provider error for {provider_id}");
            };
            assert_eq!(error.category, AiProviderErrorCategory::MissingCredential);
            assert_eq!(error.recovery_action, AiRecoveryAction::ConfigureCredential);
            assert!(sink.deltas.is_empty());
        }
    }

    #[test]
    fn refuses_a_request_whose_disclosure_consent_is_stale() {
        let provider = build_provider(
            RemoteProviderKind::Groq,
            "http://127.0.0.1:1/",
            Arc::new(RefusedKey(AiCredentialError::ConsentStale)),
        );
        let mut sink = RecordingSink::default();

        let terminal = provider.complete(
            &request(GROQ_PROVIDER_ID, "openai/gpt-oss-20b"),
            &AiCancellation::new(),
            &mut sink,
        );

        let AiCompletionTerminal::ProviderError(error) = terminal else {
            panic!("expected a provider error");
        };
        assert_eq!(error.category, AiProviderErrorCategory::MissingCredential);
        assert_eq!(error.recovery_action, AiRecoveryAction::ConfigureCredential);
        assert!(sink.deltas.is_empty());
    }

    #[test]
    fn maps_provider_status_codes_onto_distinct_recoverable_states() {
        for (status_line, category, recovery_action) in [
            (
                "401 Unauthorized",
                AiProviderErrorCategory::InvalidCredential,
                AiRecoveryAction::ConfigureCredential,
            ),
            (
                "429 Too Many Requests",
                AiProviderErrorCategory::RateLimited,
                AiRecoveryAction::Retry,
            ),
            (
                "402 Payment Required",
                AiProviderErrorCategory::QuotaExhausted,
                AiRecoveryAction::ContactProvider,
            ),
            (
                "404 Not Found",
                AiProviderErrorCategory::UnavailableProvider,
                AiRecoveryAction::ChooseDifferentModel,
            ),
            (
                "503 Service Unavailable",
                AiProviderErrorCategory::UnavailableProvider,
                AiRecoveryAction::CheckProviderStatus,
            ),
        ] {
            let (base, server) = serve_once(
                status_line,
                "application/json",
                format!("{{\"error\":{{\"message\":\"{KEY} was rejected\"}}}}"),
            );
            let provider = build_provider(RemoteProviderKind::Groq, &base, Arc::new(StoredKey));
            let mut sink = RecordingSink::default();

            let terminal = provider.complete(
                &request(GROQ_PROVIDER_ID, "openai/gpt-oss-20b"),
                &AiCancellation::new(),
                &mut sink,
            );

            let AiCompletionTerminal::ProviderError(error) = terminal else {
                panic!("expected a provider error for {status_line}");
            };
            assert_eq!(error.category, category, "category for {status_line}");
            assert_eq!(
                error.recovery_action, recovery_action,
                "recovery for {status_line}"
            );
            assert!(
                !error.message.contains(KEY),
                "provider error leaked key material for {status_line}"
            );
            server.join().expect("server");
        }
    }

    #[test]
    fn fails_visibly_on_malformed_stream_data() {
        let (base, server) = serve_once(
            "200 OK",
            "text/event-stream",
            "data: not json at all\n\n".to_owned(),
        );
        let provider = build_provider(RemoteProviderKind::Gemini, &base, Arc::new(StoredKey));
        let mut sink = RecordingSink::default();

        let terminal = provider.complete(
            &request(GEMINI_PROVIDER_ID, "gemini-2.5-flash"),
            &AiCancellation::new(),
            &mut sink,
        );

        let AiCompletionTerminal::ProviderError(error) = terminal else {
            panic!("expected a provider error");
        };
        assert_eq!(error.category, AiProviderErrorCategory::MalformedResponse);
        server.join().expect("server");
    }

    #[test]
    fn fails_visibly_when_a_provider_closes_a_stream_with_no_events() {
        let (base, server) = serve_once("200 OK", "text/event-stream", String::new());
        let provider = build_provider(RemoteProviderKind::Groq, &base, Arc::new(StoredKey));
        let mut sink = RecordingSink::default();

        let terminal = provider.complete(
            &request(GROQ_PROVIDER_ID, "openai/gpt-oss-20b"),
            &AiCancellation::new(),
            &mut sink,
        );

        let AiCompletionTerminal::ProviderError(error) = terminal else {
            panic!("expected a provider error");
        };
        assert_eq!(error.category, AiProviderErrorCategory::MalformedResponse);
        server.join().expect("server");
    }

    #[test]
    fn rejects_stream_bytes_beyond_the_requested_output_limit() {
        let body = format!(
            "data: {{\"choices\":[{{\"delta\":{{\"content\":\"{}\"}}}}]}}\n\n",
            "x".repeat(64)
        );
        let (base, server) = serve_once("200 OK", "text/event-stream", body);
        let provider = build_provider(RemoteProviderKind::Groq, &base, Arc::new(StoredKey));
        let mut bounded = request(GROQ_PROVIDER_ID, "openai/gpt-oss-20b");
        bounded.parameters.max_output_bytes = 8;
        let mut sink = RecordingSink::default();

        let terminal = provider.complete(&bounded, &AiCancellation::new(), &mut sink);

        let AiCompletionTerminal::ProviderError(error) = terminal else {
            panic!("expected a provider error");
        };
        assert_eq!(error.category, AiProviderErrorCategory::MalformedResponse);
        assert_eq!(error.recovery_action, AiRecoveryAction::ReduceRequest);
        assert!(sink.deltas.is_empty());
        server.join().expect("server");
    }

    #[test]
    fn rejects_an_oversized_stream_event() {
        let body = format!(
            "data: {{\"choices\":[{{\"delta\":{{\"content\":\"{}\"}}}}]}}\n\n",
            "x".repeat(super::MAX_STREAM_EVENT_BYTES as usize + 1)
        );
        let (base, server) = serve_once("200 OK", "text/event-stream", body);
        let provider = build_provider(RemoteProviderKind::Groq, &base, Arc::new(StoredKey));
        let mut sink = RecordingSink::default();

        let terminal = provider.complete(
            &request(GROQ_PROVIDER_ID, "openai/gpt-oss-20b"),
            &AiCancellation::new(),
            &mut sink,
        );

        let AiCompletionTerminal::ProviderError(error) = terminal else {
            panic!("expected a provider error");
        };
        assert_eq!(error.category, AiProviderErrorCategory::MalformedResponse);
        assert!(sink.deltas.is_empty());
        server.join().expect("server");
    }

    #[test]
    fn a_closed_consumer_cancels_the_request() {
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"one\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"two\"}}]}\n\n",
            "data: [DONE]\n\n"
        )
        .to_owned();
        let (base, server) = serve_once("200 OK", "text/event-stream", body);
        let provider = build_provider(RemoteProviderKind::Groq, &base, Arc::new(StoredKey));
        let cancellation = AiCancellation::new();
        let mut sink = RecordingSink {
            deltas: Vec::new(),
            close_after: Some(0),
        };

        let terminal = provider.complete(
            &request(GROQ_PROVIDER_ID, "openai/gpt-oss-20b"),
            &cancellation,
            &mut sink,
        );

        assert_eq!(terminal, AiCompletionTerminal::Cancelled);
        assert!(cancellation.is_cancelled());
        assert!(sink.deltas.is_empty());
        server.join().expect("server");
    }

    #[test]
    fn stops_before_reading_when_the_request_is_already_cancelled() {
        let provider = build_provider(
            RemoteProviderKind::Groq,
            "http://127.0.0.1:1/",
            Arc::new(StoredKey),
        );
        let cancellation = AiCancellation::new();
        cancellation.cancel();
        let mut sink = RecordingSink::default();

        let terminal = provider.complete(
            &request(GROQ_PROVIDER_ID, "openai/gpt-oss-20b"),
            &cancellation,
            &mut sink,
        );

        assert_eq!(terminal, AiCompletionTerminal::Cancelled);
    }

    #[test]
    fn refuses_a_request_addressed_to_another_provider() {
        let provider = build_provider(
            RemoteProviderKind::Groq,
            "http://127.0.0.1:1/",
            Arc::new(StoredKey),
        );
        let mut sink = RecordingSink::default();

        let terminal = provider.complete(
            &request(GEMINI_PROVIDER_ID, "gemini-2.5-flash"),
            &AiCancellation::new(),
            &mut sink,
        );

        let AiCompletionTerminal::ProviderError(error) = terminal else {
            panic!("expected a provider error");
        };
        assert_eq!(error.category, AiProviderErrorCategory::RejectedRequest);
    }

    #[test]
    fn verification_reports_acceptance_and_rejection_without_echoing_the_key() {
        let (base, server) = serve_once("200 OK", "application/json", "{}".to_owned());
        let provider = build_provider(RemoteProviderKind::Gemini, &base, Arc::new(StoredKey));
        let credential = AiCredential::new(KEY).expect("credential");

        assert_eq!(
            provider.verify_credential("gemini-2.5-flash", &credential),
            Ok(())
        );
        let captured = server.join().expect("server");
        assert!(
            captured
                .request
                .contains("POST /v1beta/models/gemini-2.5-flash:generateContent")
        );
        assert!(!captured.request.contains("?alt=sse"));

        let (base, server) = serve_once(
            "401 Unauthorized",
            "application/json",
            format!("{{\"error\":\"{KEY} is invalid\"}}"),
        );
        let rejecting = build_provider(RemoteProviderKind::Gemini, &base, Arc::new(StoredKey));

        let error = rejecting
            .verify_credential("gemini-2.5-flash", &credential)
            .expect_err("rejection");

        assert_eq!(error.category, AiProviderErrorCategory::InvalidCredential);
        assert!(!error.message.contains(KEY));
        server.join().expect("server");
    }

    #[test]
    fn resolves_provider_identity_from_a_bounded_identifier() {
        assert_eq!(
            RemoteProviderKind::from_id(GEMINI_PROVIDER_ID),
            Some(RemoteProviderKind::Gemini)
        );
        assert_eq!(
            RemoteProviderKind::from_id(GROQ_PROVIDER_ID),
            Some(RemoteProviderKind::Groq)
        );
        assert_eq!(RemoteProviderKind::from_id("ollama"), None);
        assert_eq!(
            RemoteProviderKind::Gemini.destination(),
            "generativelanguage.googleapis.com"
        );
        assert_eq!(RemoteProviderKind::Groq.destination(), "api.groq.com");
    }

    #[test]
    #[ignore = "device verification: needs a real Gemini API key in SKRIUW_GEMINI_API_KEY"]
    fn verifies_a_real_gemini_key() {
        let key = std::env::var("SKRIUW_GEMINI_API_KEY").expect("SKRIUW_GEMINI_API_KEY");
        let credential = AiCredential::new(key).expect("credential");
        let provider = RemoteAiProvider::new(RemoteProviderKind::Gemini, Arc::new(StoredKey))
            .expect("provider");

        provider
            .verify_credential("gemini-2.5-flash-lite", &credential)
            .expect("real Gemini key must verify");
    }

    #[test]
    #[ignore = "device verification: needs a real Groq API key in SKRIUW_GROQ_API_KEY"]
    fn streams_a_real_groq_completion() {
        struct EnvironmentKey;
        impl AiCredentialSource for EnvironmentKey {
            fn resolve(&self, _provider_id: &str) -> Result<AiCredential, AiCredentialError> {
                AiCredential::new(std::env::var("SKRIUW_GROQ_API_KEY").unwrap_or_default())
            }
        }
        let provider = RemoteAiProvider::new(RemoteProviderKind::Groq, Arc::new(EnvironmentKey))
            .expect("provider");
        let mut sink = RecordingSink::default();

        let terminal = provider.complete(
            &request(GROQ_PROVIDER_ID, "openai/gpt-oss-20b"),
            &AiCancellation::new(),
            &mut sink,
        );

        assert!(matches!(terminal, AiCompletionTerminal::Done { .. }));
        assert!(!sink.deltas.is_empty());
    }
}
