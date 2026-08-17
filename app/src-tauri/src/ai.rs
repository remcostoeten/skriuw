use std::sync::OnceLock;

use skriuw_ai::{AiCompletionChannel, AiCompletionService};
use skriuw_domain::{AiCompletionEvent, AiCompletionRequest, AiSinkError};
use tauri::ipc::Channel;

#[derive(Default)]
pub(crate) struct LazyAiCompletion {
    service: OnceLock<AiCompletionService>,
}

impl LazyAiCompletion {
    fn service(&self) -> &AiCompletionService {
        self.service
            .get_or_init(AiCompletionService::with_fake_provider)
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
    use super::LazyAiCompletion;

    #[test]
    fn cancellation_and_shutdown_do_not_initialize_ai() {
        let completion = LazyAiCompletion::default();

        assert!(!completion.cancel("missing"));
        completion.shutdown();

        assert!(completion.service.get().is_none());
    }
}
