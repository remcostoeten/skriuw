use std::sync::Mutex;

use skriuw_sync::{SyncCoordinator, SyncStatus};

/// Stable message for every sync action that requires the cloud service.
/// Production sync stays disabled until the identity provider and membership
/// store decided in `v2/docs/specs/cloud-sync-authentication.md` are
/// configured; nothing in the desktop app may bypass that gate.
pub const SYNC_UNAVAILABLE: &str =
    "cloud sync is unavailable: production authentication and workspace authorization are not configured";

/// Narrow runtime seam between Tauri commands and the background
/// [`SyncCoordinator`]. The desktop app currently constructs it disabled, so
/// local startup, editing, and navigation never gain a network dependency;
/// every trigger below becomes a cheap no-op.
pub struct SyncRuntime {
    coordinator: Mutex<Option<SyncCoordinator>>,
}

impl SyncRuntime {
    #[must_use]
    pub fn disabled() -> Self {
        Self {
            coordinator: Mutex::new(None),
        }
    }

    #[must_use]
    pub fn status(&self) -> SyncStatus {
        self.coordinator
            .lock()
            .ok()
            .and_then(|coordinator| {
                coordinator
                    .as_ref()
                    .map(skriuw_sync::SyncCoordinator::status)
            })
            .unwrap_or(SyncStatus::LocalOnly)
    }

    pub fn notify_local_commit(&self) {
        self.with_coordinator(SyncCoordinator::notify_local_commit);
    }

    pub fn notify_focus(&self) {
        self.with_coordinator(SyncCoordinator::notify_focus);
    }

    pub fn request_refresh(&self) {
        self.with_coordinator(SyncCoordinator::request_refresh);
    }

    pub fn connect(&self) -> Result<(), String> {
        Err(SYNC_UNAVAILABLE.into())
    }

    pub fn disconnect(&self) -> Result<(), String> {
        Err(SYNC_UNAVAILABLE.into())
    }

    pub fn shutdown(&self) {
        let coordinator = self
            .coordinator
            .lock()
            .ok()
            .and_then(|mut coordinator| coordinator.take());
        if let Some(coordinator) = coordinator {
            coordinator.shutdown();
        }
    }

    fn with_coordinator(&self, action: impl Fn(&SyncCoordinator)) {
        if let Ok(coordinator) = self.coordinator.lock()
            && let Some(coordinator) = coordinator.as_ref()
        {
            action(coordinator);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{SYNC_UNAVAILABLE, SyncRuntime};
    use skriuw_sync::SyncStatus;

    #[test]
    fn disabled_runtime_stays_local_only_and_inert() {
        let runtime = SyncRuntime::disabled();

        assert_eq!(runtime.status(), SyncStatus::LocalOnly);
        runtime.notify_local_commit();
        runtime.notify_focus();
        runtime.request_refresh();
        assert_eq!(runtime.status(), SyncStatus::LocalOnly);
    }

    #[test]
    fn connect_and_disconnect_report_the_stable_unavailable_error() {
        let runtime = SyncRuntime::disabled();

        assert_eq!(runtime.connect(), Err(SYNC_UNAVAILABLE.into()));
        assert_eq!(runtime.disconnect(), Err(SYNC_UNAVAILABLE.into()));
    }

    #[test]
    fn shutdown_is_idempotent_without_a_coordinator() {
        let runtime = SyncRuntime::disabled();

        runtime.shutdown();
        runtime.shutdown();
        assert_eq!(runtime.status(), SyncStatus::LocalOnly);
    }
}
