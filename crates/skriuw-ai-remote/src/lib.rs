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
    AiRecoveryAction, AiUsage, MAX_AI_RESPONSE_BYTES, MAX_REMOTE_AI_CATALOG_MODELS,
    RemoteAiCatalog, RemoteAiCatalogError, RemoteAiModelListing,
};

use provider::ProviderEvent;
pub use provider::{
    AIMLAPI_PROVIDER_ID, DASHSCOPE_PROVIDER_ID, DEEPSEEK_PROVIDER_ID, GEMINI_PROVIDER_ID,
    GROQ_PROVIDER_ID, MOONSHOT_PROVIDER_ID, RemoteProviderKind, ZAI_PROVIDER_ID,
};

const CATALOG_SOURCE: &str = include_str!("../models.json");
const MAX_STREAM_EVENT_BYTES: u64 = 64 * 1024;
const MAX_VERIFICATION_RESPONSE_BYTES: u64 = 256 * 1024;
const MAX_MODEL_LIST_RESPONSE_BYTES: u64 = 2 * 1024 * 1024;
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

/// The set of models a provider adapter may address. The shipped catalog is the
/// default authority; the application widens it with models the provider itself
/// reported, and every admitted id has passed domain identifier validation, so
/// the gate keeps renderer text out of provider URLs.
pub trait RemoteAiModelAuthority: Send + Sync {
    fn permits(&self, provider_id: &str, model_id: &str) -> bool;
}

struct CatalogModelAuthority;

impl RemoteAiModelAuthority for CatalogModelAuthority {
    fn permits(&self, provider_id: &str, model_id: &str) -> bool {
        remote_ai_catalog().ok().is_some_and(|catalog| {
            catalog
                .models_for(provider_id)
                .iter()
                .any(|model| model.model_id == model_id)
        })
    }
}

pub struct RemoteAiProvider {
    kind: RemoteProviderKind,
    base_url: Url,
    client: Client,
    credentials: Arc<dyn AiCredentialSource>,
    models: Arc<dyn RemoteAiModelAuthority>,
}

impl RemoteAiProvider {
    pub fn new(
        kind: RemoteProviderKind,
        credentials: Arc<dyn AiCredentialSource>,
    ) -> Result<Self, RemoteAiSetupError> {
        Self::with_model_authority(kind, credentials, Arc::new(CatalogModelAuthority))
    }

    pub fn with_model_authority(
        kind: RemoteProviderKind,
        credentials: Arc<dyn AiCredentialSource>,
        models: Arc<dyn RemoteAiModelAuthority>,
    ) -> Result<Self, RemoteAiSetupError> {
        Self::with_base_url(kind, kind.default_base_url(), credentials, models)
    }

    fn with_base_url(
        kind: RemoteProviderKind,
        base_url: &str,
        credentials: Arc<dyn AiCredentialSource>,
        models: Arc<dyn RemoteAiModelAuthority>,
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
            models,
        })
    }

    #[must_use]
    pub fn kind(&self) -> RemoteProviderKind {
        self.kind
    }

    #[must_use]
    pub fn supports_model(&self, model_id: &str) -> bool {
        self.models.permits(self.kind.id(), model_id)
    }

    /// Asks the provider which models the stored key can reach. This spends no
    /// tokens but does send the key, so callers run it only from the explicit
    /// "Refresh models" action; the credential resolve enforces consent first.
    pub fn list_models(&self) -> Result<Vec<RemoteAiModelListing>, AiProviderError> {
        let Some(url) = self.kind.models_endpoint(&self.base_url) else {
            return Err(self.error(
                AiProviderErrorCategory::UnavailableProvider,
                "this provider does not publish a model listing; its models come from the catalog",
                AiRecoveryAction::None,
            ));
        };
        let credential = self
            .credentials
            .resolve(self.kind.id())
            .map_err(|error| error.into_provider_error(self.kind.id()))?;
        let response = self
            .kind
            .authorize(self.client.get(url), &credential)
            .timeout(VERIFICATION_TIMEOUT)
            .send()
            .map_err(|error| self.transport_error(&error))?;
        let status = response.status();
        let mut body = Vec::new();
        let _ = response
            .take(MAX_MODEL_LIST_RESPONSE_BYTES)
            .read_to_end(&mut body);
        if !status.is_success() {
            return Err(self.status_error(status));
        }
        let payload = String::from_utf8_lossy(&body);
        let mut listings = self.kind.parse_model_listing(&payload).ok_or_else(|| {
            self.error(
                AiProviderErrorCategory::MalformedResponse,
                "the provider returned an unrecognisable model listing",
                AiRecoveryAction::Retry,
            )
        })?;
        listings.truncate(MAX_REMOTE_AI_CATALOG_MODELS);
        Ok(listings)
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
        RemoteAiProvider::with_base_url(
            kind,
            base_url,
            credentials,
            Arc::new(super::CatalogModelAuthority),
        )
        .expect("provider")
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
    fn ships_a_valid_repository_catalogue_covering_every_provider() {
        let catalog = super::remote_ai_catalog().expect("catalog");

        assert_eq!(catalog.validate(), Ok(()));
        for kind in RemoteProviderKind::ALL {
            assert!(
                !catalog.models_for(kind.id()).is_empty(),
                "no catalog model seeds provider {}",
                kind.id()
            );
        }
        assert_eq!(catalog.models_for(GROQ_PROVIDER_ID).len(), 3);
        assert!(
            catalog
                .models_for(GROQ_PROVIDER_ID)
                .iter()
                .all(|model| model.provider_id == GROQ_PROVIDER_ID)
        );
        assert!(catalog.models_for("openai").is_empty());
    }

    /// Z.ai's OpenAI-compatible endpoint is the one dialect speaker whose
    /// tolerance of `stream_options` is unverified, so its body omits it.
    #[test]
    fn stream_usage_option_is_gated_per_provider() {
        let request = request("deepseek", "deepseek-v4-flash");
        let deepseek = RemoteProviderKind::DeepSeek.completion_body(&request, true);
        assert_eq!(
            deepseek["stream_options"]["include_usage"],
            serde_json::json!(true)
        );

        let zai = RemoteProviderKind::Zai.completion_body(&request, true);
        assert!(zai.get("stream_options").is_none());
    }

    #[test]
    fn streams_an_openai_compatible_first_party_provider_through_the_shared_path() {
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"blue\"},\"finish_reason\":null}]}\n\n",
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":1}}\n\n",
            "data: [DONE]\n\n"
        )
        .to_owned();
        let (base, server) = serve_once("200 OK", "text/event-stream", body);
        let provider = build_provider(RemoteProviderKind::DeepSeek, &base, Arc::new(StoredKey));
        let mut sink = RecordingSink::default();

        let terminal = provider.complete(
            &request("deepseek", "deepseek-v4-flash"),
            &AiCancellation::new(),
            &mut sink,
        );

        assert!(matches!(terminal, AiCompletionTerminal::Done { .. }));
        assert_eq!(sink.deltas.len(), 1);
        let captured = server.join().expect("server");
        assert!(captured.request.contains("POST /chat/completions"));
        assert!(captured.request.contains("authorization: Bearer"));
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
            &request(GEMINI_PROVIDER_ID, "gemini-3.7-flash"),
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
                .contains("POST /v1beta/models/gemini-3.7-flash:streamGenerateContent?alt=sse")
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
                RemoteProviderKind::Gemini => "gemini-3.7-flash",
                _ => "openai/gpt-oss-20b",
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
            &request(GEMINI_PROVIDER_ID, "gemini-3.7-flash"),
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
            &request(GEMINI_PROVIDER_ID, "gemini-3.7-flash"),
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
            provider.verify_credential("gemini-3.7-flash", &credential),
            Ok(())
        );
        let captured = server.join().expect("server");
        assert!(
            captured
                .request
                .contains("POST /v1beta/models/gemini-3.7-flash:generateContent")
        );
        assert!(!captured.request.contains("?alt=sse"));

        let (base, server) = serve_once(
            "401 Unauthorized",
            "application/json",
            format!("{{\"error\":\"{KEY} is invalid\"}}"),
        );
        let rejecting = build_provider(RemoteProviderKind::Gemini, &base, Arc::new(StoredKey));

        let error = rejecting
            .verify_credential("gemini-3.7-flash", &credential)
            .expect_err("rejection");

        assert_eq!(error.category, AiProviderErrorCategory::InvalidCredential);
        assert!(!error.message.contains(KEY));
        server.join().expect("server");
    }

    #[test]
    fn resolves_provider_identity_from_a_bounded_identifier() {
        for kind in RemoteProviderKind::ALL {
            assert_eq!(RemoteProviderKind::from_id(kind.id()), Some(kind));
            assert!(!kind.label().is_empty());
        }
        assert_eq!(RemoteProviderKind::from_id("ollama"), None);
        assert_eq!(
            RemoteProviderKind::Gemini.destination(),
            "generativelanguage.googleapis.com"
        );
        assert_eq!(RemoteProviderKind::Groq.destination(), "api.groq.com");
        assert_eq!(RemoteProviderKind::AimlApi.destination(), "api.aimlapi.com");
    }

    /// Every request an OpenAI-compatible kind can make must reach the host
    /// its privacy disclosure names.
    #[test]
    fn every_endpoint_stays_on_the_disclosed_destination() {
        for kind in RemoteProviderKind::ALL {
            let base = super::Url::parse(kind.default_base_url()).expect("default base url parses");
            let mut endpoints = vec![
                kind.endpoint(&base, "some-model", true)
                    .expect("chat endpoint"),
                kind.endpoint(&base, "some-model", false)
                    .expect("verify endpoint"),
            ];
            match kind.models_endpoint(&base) {
                Some(url) => endpoints.push(url),
                None => assert!(
                    !kind.supports_model_listing(),
                    "{} has no listing endpoint but claims listing support",
                    kind.id()
                ),
            }
            for url in endpoints {
                assert_eq!(
                    url.host_str(),
                    Some(kind.destination()),
                    "{} endpoint left the disclosed destination: {url}",
                    kind.id()
                );
            }
        }
    }

    #[test]
    fn lists_gemini_completion_models_from_the_provider() {
        let body = concat!(
            "{\"models\":[",
            "{\"name\":\"models/gemini-3.0-flash\",\"displayName\":\"Gemini 3.0 Flash\",",
            "\"inputTokenLimit\":1048576,\"supportedGenerationMethods\":[\"generateContent\"]},",
            "{\"name\":\"models/embedding-001\",\"displayName\":\"Embedding\",",
            "\"supportedGenerationMethods\":[\"embedContent\"]},",
            "{\"name\":\"models/../escape\",\"supportedGenerationMethods\":[\"generateContent\"]}",
            "]}"
        )
        .to_owned();
        let (base, server) = serve_once("200 OK", "application/json", body);
        let provider = build_provider(RemoteProviderKind::Gemini, &base, Arc::new(StoredKey));

        let listings = provider.list_models().expect("listing");

        assert_eq!(listings.len(), 1, "non-completion and invalid ids drop out");
        assert_eq!(listings[0].model_id, "gemini-3.0-flash");
        assert_eq!(listings[0].label, "Gemini 3.0 Flash");
        assert_eq!(listings[0].context_window_tokens, Some(1_048_576));
        assert_eq!(listings[0].input_price_micros_per_mtok, None);
        assert_eq!(
            listings[0].source,
            skriuw_domain::RemoteAiModelSource::Fetched
        );
        let captured = server.join().expect("server");
        assert!(captured.request.contains("GET /v1beta/models"));
        assert!(captured.request.contains("x-goog-api-key"));
    }

    #[test]
    fn lists_groq_models_and_skips_inactive_entries() {
        let body = concat!(
            "{\"object\":\"list\",\"data\":[",
            "{\"id\":\"openai/gpt-oss-20b\",\"context_window\":131072,\"active\":true},",
            "{\"id\":\"whisper-large-v3\",\"active\":false}",
            "]}"
        )
        .to_owned();
        let (base, server) = serve_once("200 OK", "application/json", body);
        let provider = build_provider(RemoteProviderKind::Groq, &base, Arc::new(StoredKey));

        let listings = provider.list_models().expect("listing");

        assert_eq!(listings.len(), 1);
        assert_eq!(listings[0].model_id, "openai/gpt-oss-20b");
        assert_eq!(listings[0].context_window_tokens, Some(131_072));
        let captured = server.join().expect("server");
        assert!(captured.request.contains("GET /openai/v1/models"));
        assert!(captured.request.contains("authorization: Bearer"));
    }

    #[test]
    fn model_listing_never_opens_a_socket_without_consent_and_maps_rejections() {
        let provider = build_provider(
            RemoteProviderKind::Groq,
            "http://127.0.0.1:1/",
            Arc::new(RefusedKey(AiCredentialError::ConsentStale)),
        );
        let error = provider.list_models().expect_err("consent gate");
        assert_eq!(error.category, AiProviderErrorCategory::MissingCredential);

        let (base, server) = serve_once(
            "401 Unauthorized",
            "application/json",
            format!("{{\"error\":\"{KEY} rejected\"}}"),
        );
        let rejecting = build_provider(RemoteProviderKind::Groq, &base, Arc::new(StoredKey));
        let error = rejecting.list_models().expect_err("rejection");
        assert_eq!(error.category, AiProviderErrorCategory::InvalidCredential);
        assert!(!error.message.contains(KEY));
        server.join().expect("server");

        let (base, server) = serve_once("200 OK", "application/json", "not json".to_owned());
        let malformed = build_provider(RemoteProviderKind::Gemini, &base, Arc::new(StoredKey));
        let error = malformed.list_models().expect_err("malformed");
        assert_eq!(error.category, AiProviderErrorCategory::MalformedResponse);
        server.join().expect("server");
    }

    #[test]
    fn a_model_authority_can_widen_the_supported_set_beyond_the_catalog() {
        struct FetchedToo;
        impl super::RemoteAiModelAuthority for FetchedToo {
            fn permits(&self, provider_id: &str, model_id: &str) -> bool {
                provider_id == GROQ_PROVIDER_ID && model_id == "brand-new-model"
            }
        }
        let provider = RemoteAiProvider::with_base_url(
            RemoteProviderKind::Groq,
            "http://127.0.0.1:1/",
            Arc::new(StoredKey),
            Arc::new(FetchedToo),
        )
        .expect("provider");

        assert!(provider.supports_model("brand-new-model"));
        assert!(!provider.supports_model("openai/gpt-oss-20b"));
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
