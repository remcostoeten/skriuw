use std::sync::OnceLock;

use std::sync::Arc;

use skriuw_ai::{
    AiCompletionChannel, AiCompletionService, FakeAiProvider, FakeCompletionScript,
};
use skriuw_ai_ollama::OllamaRuntime;
use skriuw_domain::{AiComplete, AiCompletionEvent, AiCompletionRequest, AiSinkError};
use tauri::ipc::Channel;

pub(crate) struct LazyAiCompletion {
    service: OnceLock<AiCompletionService>,
    ollama: Arc<OllamaRuntime>,
}

impl LazyAiCompletion {
    pub(crate) fn new(ollama: Arc<OllamaRuntime>) -> Self {
        Self {
            service: OnceLock::new(),
            ollama,
        }
    }

    fn service(&self) -> &AiCompletionService {
        self.service.get_or_init(|| {
            let fake: Arc<dyn AiComplete> = Arc::new(FakeAiProvider::new(
                FakeCompletionScript::success(["fake ", "completion"]),
            ));
            let ollama: Arc<dyn AiComplete> = self.ollama.clone();
            AiCompletionService::new([
                ("fake".to_owned(), fake),
                ("ollama".to_owned(), ollama),
            ])
        })
    }

    pub(crate) fn start(
        &self,
        request: AiCompletionRequest,
        channel: Channel<AiCompletionEvent>,
    ) -> Result<(), String> {
        self.service()
            .start(request, TauriCompletionChannel(channel))
            .map_err(|error| error.to_string())
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

struct TauriCompletionChannel(Channel<AiCompletionEvent>);

impl AiCompletionChannel for TauriCompletionChannel {
    fn send(&self, event: AiCompletionEvent) -> Result<(), AiSinkError> {
        self.0.send(event).map_err(|_| AiSinkError::Closed)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use skriuw_ai_ollama::OllamaRuntime;
    use tempfile::tempdir;

    use super::LazyAiCompletion;

    #[test]
    fn cancellation_and_shutdown_do_not_initialize_ai() {
        let directory = tempdir().expect("tempdir");
        let ollama = Arc::new(
            OllamaRuntime::new(directory.path().to_path_buf(), None).expect("ollama runtime"),
        );
        let completion = LazyAiCompletion::new(ollama);

        assert!(!completion.cancel("missing"));
        completion.shutdown();

        assert!(completion.service.get().is_none());
    }
}
