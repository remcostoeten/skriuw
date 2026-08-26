use std::collections::{BTreeMap, VecDeque};
use std::sync::{Mutex, OnceLock};

use std::sync::Arc;

use skriuw_ai::{AiCompletionChannel, AiCompletionService, FakeAiProvider, FakeCompletionScript};
use skriuw_ai_ollama::OllamaRuntime;
use skriuw_ai_remote::{RemoteAiProvider, remote_ai_catalog};
use skriuw_domain::{
    AiComplete, AiCompletionEvent, AiCompletionRequest, AiModelPricing, AiProviderError,
    AiProviderErrorCategory, AiRecoveryAction, AiRunRecorder, AiSinkError, AiTranscribe,
    AiTranscriptionRequest, AiTranscriptionTerminal, MAX_AI_AUDIO_BYTES,
};
use tauri::ipc::Channel;

use crate::ai_credentials::{AiCredentialStore, REMOTE_PROVIDERS};
use crate::ai_history::AiHistoryRecorder;

pub(crate) struct LazyAiCompletion {
    service: OnceLock<AiCompletionService>,
    ollama: Arc<OllamaRuntime>,
    credentials: Arc<AiCredentialStore>,
    history: Arc<AiHistoryRecorder>,
}

impl LazyAiCompletion {
    pub(crate) fn new(
        ollama: Arc<OllamaRuntime>,
        credentials: Arc<AiCredentialStore>,
        history: Arc<AiHistoryRecorder>,
    ) -> Self {
        Self {
            service: OnceLock::new(),
            ollama,
            credentials,
            history,
        }
    }

    /// Provider construction is deferred until the first completion so an
    /// opted-out workspace never builds a network client. A remote provider
    /// whose transport cannot be built is simply absent, which the service
    /// reports as an unavailable provider rather than a silent success.
    fn service(&self) -> &AiCompletionService {
        self.service.get_or_init(|| {
            let fake: Arc<dyn AiComplete> =
                Arc::new(FakeAiProvider::new(FakeCompletionScript::success([
                    "fake ",
                    "completion",
                ])));
            let ollama: Arc<dyn AiComplete> = self.ollama.clone();
            let mut providers: Vec<(String, Arc<dyn AiComplete>)> =
                vec![("fake".to_owned(), fake), ("ollama".to_owned(), ollama)];
            for kind in REMOTE_PROVIDERS {
                match RemoteAiProvider::new(kind, self.credentials.clone()) {
                    Ok(provider) => {
                        providers.push((kind.id().to_owned(), Arc::new(provider)));
                    }
                    Err(error) => {
                        eprintln!("remote AI provider {} unavailable: {error}", kind.id());
                    }
                }
            }
            let recorder: Arc<dyn AiRunRecorder> = self.history.clone();
            // Remote cost is priced from the shipped catalogue. A catalogue
            // that cannot be read leaves runs unpriced rather than guessed.
            let pricing: Arc<dyn AiModelPricing> = match remote_ai_catalog() {
                Ok(catalog) => Arc::new(catalog),
                Err(error) => {
                    eprintln!("remote model catalogue unavailable for pricing: {error}");
                    Arc::new(UnpricedModels)
                }
            };
            AiCompletionService::new(providers).recording(recorder, pricing)
        })
    }

    pub(crate) fn start(
        &self,
        origin: String,
        request: AiCompletionRequest,
        channel: Channel<AiCompletionEvent>,
    ) -> Result<(), String> {
        self.service()
            .start(origin, request, TauriCompletionChannel(channel))
            .map_err(|error| error.to_string())
    }

    pub(crate) fn history(&self) -> &Arc<AiHistoryRecorder> {
        &self.history
    }

    pub(crate) fn cancel(&self, request_id: &str) -> bool {
        self.service
            .get()
            .is_some_and(|service| service.cancel(request_id))
    }

    pub(crate) fn shutdown(&self) {
        if let Some(service) = self.service.get() {
            service.shutdown();
        }
    }
}

/// Recordings staged for transcription. Audio arrives over IPC as a raw-body
/// command, which Tauri only offers synchronously, while the provider call
/// must not run on the main thread — so the bytes are parked here between the
/// synchronous stage command and the async transcribe command that spends
/// them. The queue is bounded: a renderer that stages and never transcribes
/// evicts its own oldest recording instead of growing the process.
const MAX_STAGED_RECORDINGS: usize = 2;

/// Speech-to-text through the same lazily-built remote adapters as
/// completions. Nothing here is constructed until the first explicit
/// transcription request, so an opted-out workspace never builds a client.
pub(crate) struct LazyAiTranscription {
    providers: OnceLock<BTreeMap<String, Arc<dyn AiTranscribe>>>,
    credentials: Arc<AiCredentialStore>,
    staged: Mutex<VecDeque<(String, Vec<u8>)>>,
}

impl LazyAiTranscription {
    pub(crate) fn new(credentials: Arc<AiCredentialStore>) -> Self {
        Self {
            providers: OnceLock::new(),
            credentials,
            staged: Mutex::new(VecDeque::new()),
        }
    }

    pub(crate) fn stage(&self, audio: Vec<u8>) -> Result<String, String> {
        if audio.is_empty() {
            return Err("recording is empty".to_owned());
        }
        if audio.len() > MAX_AI_AUDIO_BYTES {
            return Err(format!(
                "recording exceeds {MAX_AI_AUDIO_BYTES} bytes; record a shorter note"
            ));
        }
        let staged_id = uuid::Uuid::new_v4().to_string();
        let mut staged = self
            .staged
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        while staged.len() >= MAX_STAGED_RECORDINGS {
            staged.pop_front();
        }
        staged.push_back((staged_id.clone(), audio));
        Ok(staged_id)
    }

    pub(crate) fn take_staged(&self, staged_id: &str) -> Option<Vec<u8>> {
        let mut staged = self
            .staged
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let index = staged.iter().position(|(id, _)| id == staged_id)?;
        staged.remove(index).map(|(_, audio)| audio)
    }

    fn providers(&self) -> &BTreeMap<String, Arc<dyn AiTranscribe>> {
        self.providers.get_or_init(|| {
            let mut providers: BTreeMap<String, Arc<dyn AiTranscribe>> = BTreeMap::new();
            for kind in REMOTE_PROVIDERS {
                match RemoteAiProvider::new(kind, self.credentials.clone()) {
                    Ok(provider) => {
                        providers.insert(kind.id().to_owned(), Arc::new(provider));
                    }
                    Err(error) => {
                        eprintln!(
                            "remote transcription provider {} unavailable: {error}",
                            kind.id()
                        );
                    }
                }
            }
            providers
        })
    }

    pub(crate) fn transcribe(&self, request: &AiTranscriptionRequest) -> AiTranscriptionTerminal {
        let Some(provider) = self.providers().get(&request.provider_id) else {
            // The renderer-sent provider id is not echoed: it would put
            // arbitrary text into an error the dictation surface renders.
            return AiTranscriptionTerminal::ProviderError(AiProviderError::new(
                "remote",
                AiProviderErrorCategory::UnavailableProvider,
                "selected transcription provider is unavailable",
                AiRecoveryAction::CheckProviderStatus,
            ));
        };
        provider.transcribe(request, &skriuw_domain::AiCancellation::new())
    }
}

struct UnpricedModels;

impl AiModelPricing for UnpricedModels {
    fn price(&self, _provider_id: &str, _model_id: &str) -> Option<skriuw_domain::AiModelPrice> {
        None
    }
}

struct TauriCompletionChannel(Channel<AiCompletionEvent>);

impl AiCompletionChannel for TauriCompletionChannel {
    fn send(&self, event: AiCompletionEvent) -> Result<(), AiSinkError> {
        self.0.send(event).map_err(|_| AiSinkError::Closed)
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Mutex},
        thread,
        time::Duration,
    };

    use skriuw_ai::AiCompletionChannel;
    use skriuw_ai_ollama::OllamaRuntime;
    use skriuw_ai_remote::remote_ai_catalog;
    use skriuw_domain::{
        AiCompletionEvent, AiCompletionParameters, AiCompletionRequest, AiProviderError,
        AiProviderErrorCategory, AiRecoveryAction, AiSinkError,
    };
    use tempfile::tempdir;

    use super::LazyAiCompletion;
    use crate::ai_credentials::AiCredentialStore;
    use crate::ai_history::AiHistoryRecorder;

    fn history(directory: &tempfile::TempDir) -> Arc<AiHistoryRecorder> {
        Arc::new(AiHistoryRecorder::new(
            &directory.path().join("skriuw.db"),
            || 0,
        ))
    }

    #[test]
    fn cancellation_and_shutdown_do_not_initialize_ai() {
        let directory = tempdir().expect("tempdir");
        let ollama = Arc::new(
            OllamaRuntime::new(directory.path().to_path_buf(), None).expect("ollama runtime"),
        );
        let credentials = Arc::new(AiCredentialStore::new(directory.path()));
        let completion = LazyAiCompletion::new(ollama, credentials, history(&directory));

        assert!(!completion.cancel("missing"));
        completion.shutdown();

        assert!(completion.service.get().is_none());
    }

    /// The remote adapters are reachable through the same seam as Ollama, and an
    /// unconsented provider terminalizes on the credential gate. Nothing here
    /// touches the network: a socket would make this test hang, not fail.
    #[test]
    fn routes_remote_providers_through_the_credential_gate() {
        let directory = tempdir().expect("tempdir");
        let ollama = Arc::new(
            OllamaRuntime::new(directory.path().to_path_buf(), None).expect("ollama runtime"),
        );
        let completion = LazyAiCompletion::new(
            ollama,
            Arc::new(AiCredentialStore::new(directory.path())),
            history(&directory),
        );

        for provider_id in ["gemini", "groq"] {
            let events = Arc::new(Mutex::new(Vec::new()));
            completion
                .service()
                .start(
                    skriuw_domain::AI_RUN_ORIGIN_PLAYGROUND.to_owned(),
                    request(provider_id),
                    RecordingChannel(Arc::clone(&events)),
                )
                .expect("start");

            let error = await_provider_error(&events);
            assert_eq!(error.provider_id, provider_id);
            assert_eq!(error.category, AiProviderErrorCategory::MissingCredential);
            assert_eq!(error.recovery_action, AiRecoveryAction::ConfigureCredential);
        }
        completion.shutdown();
    }

    /// The transcription adapters sit behind the same credential gate as
    /// completions, and an unstaged or unconsented provider terminalizes
    /// before any socket is opened. Nothing here touches the network.
    #[test]
    fn routes_transcription_through_the_credential_gate() {
        use skriuw_ai_remote::ai_transcription_models;
        use skriuw_domain::{AiTranscriptionRequest, AiTranscriptionTerminal};

        let directory = tempdir().expect("tempdir");
        let transcription =
            super::LazyAiTranscription::new(Arc::new(AiCredentialStore::new(directory.path())));

        for provider_id in ["gemini", "groq"] {
            let model_id = ai_transcription_models()
                .iter()
                .find(|model| model.provider_id == provider_id)
                .expect("catalogued transcription model")
                .model_id
                .clone();
            let terminal = transcription.transcribe(&AiTranscriptionRequest {
                request_id: format!("request-{provider_id}"),
                provider_id: provider_id.to_owned(),
                model_id,
                mime_type: "audio/webm".to_owned(),
                language: None,
                audio: vec![1, 2, 3],
            });

            let AiTranscriptionTerminal::ProviderError(error) = terminal else {
                panic!("expected a provider error for {provider_id}");
            };
            assert_eq!(error.provider_id, provider_id);
            assert_eq!(error.category, AiProviderErrorCategory::MissingCredential);
            assert_eq!(error.recovery_action, AiRecoveryAction::ConfigureCredential);
        }
    }

    /// Staged recordings are bounded and consumed exactly once, so an
    /// abandoned recording cannot pin audio in process memory.
    #[test]
    fn staging_is_bounded_and_single_use() {
        let directory = tempdir().expect("tempdir");
        let transcription =
            super::LazyAiTranscription::new(Arc::new(AiCredentialStore::new(directory.path())));

        assert!(transcription.stage(Vec::new()).is_err());

        let first = transcription.stage(vec![1]).expect("stage first");
        let second = transcription.stage(vec![2]).expect("stage second");
        let third = transcription.stage(vec![3]).expect("stage third");

        assert!(
            transcription.take_staged(&first).is_none(),
            "oldest staged recording must be evicted"
        );
        assert_eq!(transcription.take_staged(&second), Some(vec![2]));
        assert_eq!(
            transcription.take_staged(&second),
            None,
            "a staged recording is consumed exactly once"
        );
        assert_eq!(transcription.take_staged(&third), Some(vec![3]));
    }

    /// The model is taken from the catalogue rather than written here: a
    /// provider rejects an unknown model before the credential gate, so a
    /// literal would silently stop testing the gate whenever the catalogue moves.
    fn request(provider_id: &str) -> AiCompletionRequest {
        let catalog = remote_ai_catalog().expect("catalogue");
        let model_id = catalog
            .models_for(provider_id)
            .first()
            .expect("catalogued model")
            .model_id
            .clone();
        AiCompletionRequest {
            request_id: format!("request-{provider_id}"),
            provider_id: provider_id.to_owned(),
            model_id,
            system_prompt: String::new(),
            user_prompt: "Name a colour.".to_owned(),
            parameters: AiCompletionParameters::default(),
        }
    }

    fn await_provider_error(events: &Mutex<Vec<AiCompletionEvent>>) -> AiProviderError {
        for _ in 0..200 {
            let recorded = events.lock().expect("events").clone();
            if let Some(AiCompletionEvent::ProviderError { error, .. }) = recorded.first() {
                return error.clone();
            }
            thread::sleep(Duration::from_millis(10));
        }
        panic!("no provider error was published");
    }

    struct RecordingChannel(Arc<Mutex<Vec<AiCompletionEvent>>>);

    impl AiCompletionChannel for RecordingChannel {
        fn send(&self, event: AiCompletionEvent) -> Result<(), AiSinkError> {
            self.0.lock().expect("events").push(event);
            Ok(())
        }
    }
}
