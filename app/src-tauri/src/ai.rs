use std::sync::OnceLock;

use std::sync::Arc;

use skriuw_ai::{AiCompletionChannel, AiCompletionService, FakeAiProvider, FakeCompletionScript};
use skriuw_ai_ollama::OllamaRuntime;
use skriuw_ai_remote::{RemoteAiProvider, remote_ai_catalog};
use skriuw_domain::{
    AiComplete, AiCompletionEvent, AiCompletionRequest, AiModelPricing, AiRunRecorder, AiSinkError,
};
use tauri::ipc::Channel;

use crate::ai_credentials::{AiCredentialStore, REMOTE_PROVIDERS};
use crate::ai_history::AiHistoryRecorder;
use crate::ai_models::FetchedModelStore;

pub(crate) struct LazyAiCompletion {
    service: OnceLock<AiCompletionService>,
    ollama: Arc<OllamaRuntime>,
    credentials: Arc<AiCredentialStore>,
    history: Arc<AiHistoryRecorder>,
    models: Arc<FetchedModelStore>,
}

impl LazyAiCompletion {
    pub(crate) fn new(
        ollama: Arc<OllamaRuntime>,
        credentials: Arc<AiCredentialStore>,
        history: Arc<AiHistoryRecorder>,
        models: Arc<FetchedModelStore>,
    ) -> Self {
        Self {
            service: OnceLock::new(),
            ollama,
            credentials,
            history,
            models,
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
                match RemoteAiProvider::with_model_authority(
                    kind,
                    self.credentials.clone(),
                    self.models.clone(),
                ) {
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
        let completion = LazyAiCompletion::new(
            ollama,
            credentials,
            history(&directory),
            Arc::new(crate::ai_models::FetchedModelStore::new(directory.path())),
        );

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
            Arc::new(crate::ai_models::FetchedModelStore::new(directory.path())),
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
