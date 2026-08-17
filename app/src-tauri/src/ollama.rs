use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use skriuw_ai_ollama::OllamaRuntime;
use skriuw_domain::{
    AiCancellation, LocalAiError, LocalAiErrorCategory, LocalAiModel, LocalAiProgress,
    LocalAiProgressSink, LocalAiRuntime, LocalAiStatus,
};
use tauri::ipc::Channel;

#[derive(Default)]
struct OperationRegistry {
    active: Mutex<HashMap<String, AiCancellation>>,
}

impl OperationRegistry {
    fn begin(&self, operation_id: &str) -> Result<AiCancellation, LocalAiError> {
        let mut active = lock(&self.active);
        if active.contains_key(operation_id) {
            return Err(LocalAiError::new(
                LocalAiErrorCategory::InvalidRequest,
                "Local AI operation is already active",
            ));
        }
        let cancellation = AiCancellation::new();
        active.insert(operation_id.to_owned(), cancellation.clone());
        Ok(cancellation)
    }

    fn end(&self, operation_id: &str) {
        lock(&self.active).remove(operation_id);
    }

    fn cancel(&self, operation_id: &str) -> bool {
        let active = lock(&self.active);
        let Some(cancellation) = active.get(operation_id) else {
            return false;
        };
        cancellation.cancel();
        true
    }

    fn cancel_all(&self) {
        for cancellation in lock(&self.active).values() {
            cancellation.cancel();
        }
    }
}

pub(crate) struct OllamaManager {
    runtime: Arc<OllamaRuntime>,
    active: OperationRegistry,
}

impl OllamaManager {
    pub(crate) fn new(runtime: Arc<OllamaRuntime>) -> Self {
        Self {
            runtime,
            active: OperationRegistry::default(),
        }
    }

    pub(crate) fn status(&self) -> Result<LocalAiStatus, LocalAiError> {
        self.runtime.status()
    }

    pub(crate) fn start(&self) -> Result<LocalAiStatus, LocalAiError> {
        self.runtime.start()
    }

    pub(crate) fn stop(&self) -> Result<LocalAiStatus, LocalAiError> {
        self.active.cancel_all();
        self.runtime.stop()
    }

    pub(crate) fn install(
        &self,
        operation_id: String,
        channel: Channel<LocalAiProgress>,
    ) -> Result<LocalAiStatus, LocalAiError> {
        self.run(operation_id, channel, |runtime, id, cancellation, sink| {
            runtime.install(id, cancellation, sink)
        })
    }

    pub(crate) fn list_models(&self) -> Result<Vec<LocalAiModel>, LocalAiError> {
        self.runtime.list_models()
    }

    pub(crate) fn pull_model(
        &self,
        operation_id: String,
        model: String,
        channel: Channel<LocalAiProgress>,
    ) -> Result<(), LocalAiError> {
        self.run(operation_id, channel, move |runtime, id, cancellation, sink| {
            runtime.pull_model(id, &model, cancellation, sink)
        })
    }

    pub(crate) fn remove_model(&self, model: &str) -> Result<(), LocalAiError> {
        self.runtime.remove_model(model)
    }

    pub(crate) fn cancel(&self, operation_id: &str) -> bool {
        self.active.cancel(operation_id)
    }

    pub(crate) fn shutdown(&self) {
        self.active.cancel_all();
        self.runtime.shutdown();
    }

    fn run<T>(
        &self,
        operation_id: String,
        channel: Channel<LocalAiProgress>,
        operation: impl FnOnce(
            &OllamaRuntime,
            &str,
            &AiCancellation,
            &mut dyn LocalAiProgressSink,
        ) -> Result<T, LocalAiError>,
    ) -> Result<T, LocalAiError> {
        let cancellation = self.active.begin(&operation_id)?;
        let mut sink = TauriProgressSink(channel, cancellation.clone());
        let result = operation(&self.runtime, &operation_id, &cancellation, &mut sink);
        self.active.end(&operation_id);
        result
    }
}

struct TauriProgressSink(Channel<LocalAiProgress>, AiCancellation);

impl LocalAiProgressSink for TauriProgressSink {
    fn send(&mut self, progress: LocalAiProgress) -> Result<(), LocalAiError> {
        self.0.send(progress).map_err(|_| {
            self.1.cancel();
            LocalAiError::new(
                LocalAiErrorCategory::Cancelled,
                "Local AI progress consumer closed",
            )
        })
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::OperationRegistry;
    use skriuw_domain::LocalAiErrorCategory;

    #[test]
    fn rejects_a_second_operation_reusing_an_active_id() {
        let registry = OperationRegistry::default();
        let first = registry.begin("install-1").unwrap();

        let error = registry.begin("install-1").unwrap_err();

        assert_eq!(error.category, LocalAiErrorCategory::InvalidRequest);
        assert!(!first.is_cancelled());
    }

    #[test]
    fn releases_an_id_once_its_operation_ends() {
        let registry = OperationRegistry::default();
        registry.begin("pull-1").unwrap();
        registry.end("pull-1");

        assert!(registry.begin("pull-1").is_ok());
    }

    #[test]
    fn cancels_only_the_named_operation() {
        let registry = OperationRegistry::default();
        let install = registry.begin("install-1").unwrap();
        let pull = registry.begin("pull-1").unwrap();

        assert!(registry.cancel("pull-1"));

        assert!(pull.is_cancelled());
        assert!(!install.is_cancelled());
    }

    #[test]
    fn reports_an_unknown_operation_as_not_cancelled() {
        let registry = OperationRegistry::default();

        assert!(!registry.cancel("pull-1"));
    }

    #[test]
    fn cancels_every_active_operation_at_shutdown() {
        let registry = OperationRegistry::default();
        let install = registry.begin("install-1").unwrap();
        let pull = registry.begin("pull-1").unwrap();

        registry.cancel_all();

        assert!(install.is_cancelled());
        assert!(pull.is_cancelled());
    }
}
