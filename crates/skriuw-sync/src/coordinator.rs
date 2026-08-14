use std::{
    sync::{Arc, Condvar, Mutex},
    thread::{self, JoinHandle},
    time::Duration,
};

use skriuw_storage::{WorkspaceMaintenance, WorkspaceSyncQueue};

use crate::{
    backoff::{SyncBackoff, SyncBackoffConfig},
    checkpoint::{
        CheckpointPublication, CheckpointPublicationConfig, CheckpointPublicationState,
        run_checkpoint_publication,
    },
    content::SyncAssetStore,
    cycle::{SyncCycleConfig, SyncStatus, run_sync_cycle},
    transport::{SyncCancellation, SyncClock, SyncTransport},
};

pub type SyncStatusObserver = Arc<dyn Fn(&SyncStatus) + Send + Sync>;
pub type SyncWorkspaceObserver = Arc<dyn Fn() + Send + Sync>;

#[derive(Clone)]
pub struct SyncCoordinatorConfig {
    pub cycle: SyncCycleConfig,
    pub backoff: SyncBackoffConfig,
    pub checkpoint: CheckpointPublicationConfig,
    pub poll_interval_ms: i64,
    pub status_observer: Option<SyncStatusObserver>,
    pub workspace_observer: Option<SyncWorkspaceObserver>,
}

impl Default for SyncCoordinatorConfig {
    fn default() -> Self {
        Self {
            cycle: SyncCycleConfig::default(),
            backoff: SyncBackoffConfig::default(),
            checkpoint: CheckpointPublicationConfig::default(),
            poll_interval_ms: 60_000,
            status_observer: None,
            workspace_observer: None,
        }
    }
}

struct Control {
    shutdown: bool,
    wake_requested: bool,
    online: bool,
    session_valid: bool,
}

struct CoordinatorShared {
    control: Mutex<Control>,
    wake: Condvar,
    status: Mutex<SyncStatus>,
    cancellation: SyncCancellation,
}

/// Single owner of the background sync lifecycle for one workspace database.
/// All triggers coalesce into one wake flag consumed by one worker thread, so
/// concurrent commits, focus events, and refresh requests can never create
/// duplicate push or pull loops.
pub struct SyncCoordinator {
    shared: Arc<CoordinatorShared>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl SyncCoordinator {
    #[must_use]
    pub fn spawn(
        queue: Arc<dyn WorkspaceSyncQueue>,
        workspace: Arc<dyn WorkspaceMaintenance>,
        transport: Arc<dyn SyncTransport>,
        assets: Arc<dyn SyncAssetStore>,
        clock: Arc<dyn SyncClock>,
        config: SyncCoordinatorConfig,
    ) -> Self {
        let shared = Arc::new(CoordinatorShared {
            control: Mutex::new(Control {
                shutdown: false,
                wake_requested: true,
                online: true,
                session_valid: true,
            }),
            wake: Condvar::new(),
            status: Mutex::new(SyncStatus::Connecting),
            cancellation: SyncCancellation::new(),
        });
        let worker_shared = Arc::clone(&shared);
        let worker = thread::Builder::new()
            .name("skriuw-sync".into())
            .spawn(move || {
                run(
                    worker_shared,
                    queue,
                    workspace,
                    transport,
                    assets,
                    clock,
                    config,
                )
            })
            .expect("sync coordinator thread must start");
        Self {
            shared,
            worker: Mutex::new(Some(worker)),
        }
    }

    #[must_use]
    pub fn status(&self) -> SyncStatus {
        self.shared
            .status
            .lock()
            .map(|status| status.clone())
            .unwrap_or(SyncStatus::LocalOnly)
    }

    pub fn notify_local_commit(&self) {
        self.request_wake();
    }

    pub fn notify_focus(&self) {
        self.request_wake();
    }

    pub fn notify_startup(&self) {
        self.request_wake();
    }

    /// The push channel reported that another device changed the workspace.
    pub fn notify_remote_change(&self) {
        self.request_wake();
    }

    pub fn request_refresh(&self) {
        self.request_wake();
    }

    pub fn notify_reconnected(&self) {
        self.set_online(true);
    }

    pub fn set_online(&self, online: bool) {
        if let Ok(mut control) = self.shared.control.lock() {
            control.online = online;
            control.wake_requested = true;
            if !online {
                self.shared.cancellation.interrupt();
            }
        }
        self.shared.wake.notify_all();
    }

    /// Logout pauses synchronization: the in-flight network call is
    /// interrupted, leases are released through the normal cancellation path,
    /// and the durable queue and local database are preserved untouched.
    pub fn pause_for_logout(&self) {
        if let Ok(mut control) = self.shared.control.lock() {
            control.session_valid = false;
            control.wake_requested = true;
            self.shared.cancellation.interrupt();
        }
        self.shared.wake.notify_all();
    }

    pub fn resume_with_session(&self) {
        if let Ok(mut control) = self.shared.control.lock() {
            control.session_valid = true;
            control.wake_requested = true;
        }
        self.shared.wake.notify_all();
    }

    pub fn shutdown(&self) {
        if let Ok(mut control) = self.shared.control.lock() {
            control.shutdown = true;
        }
        self.shared.cancellation.shutdown();
        self.shared.wake.notify_all();
        let handle = self.worker.lock().ok().and_then(|mut worker| worker.take());
        if let Some(handle) = handle {
            let _ = handle.join();
        }
    }

    fn request_wake(&self) {
        if let Ok(mut control) = self.shared.control.lock() {
            control.wake_requested = true;
        }
        self.shared.wake.notify_all();
    }
}

impl Drop for SyncCoordinator {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn run(
    shared: Arc<CoordinatorShared>,
    queue: Arc<dyn WorkspaceSyncQueue>,
    workspace: Arc<dyn WorkspaceMaintenance>,
    transport: Arc<dyn SyncTransport>,
    assets: Arc<dyn SyncAssetStore>,
    clock: Arc<dyn SyncClock>,
    config: SyncCoordinatorConfig,
) {
    let mut backoff = SyncBackoff::new(config.backoff);
    let mut checkpoint_state = CheckpointPublicationState::new();
    let mut deadline_ms: Option<i64> = None;
    loop {
        let (online, session_valid) = {
            let mut control = match shared.control.lock() {
                Ok(control) => control,
                Err(_) => return,
            };
            loop {
                if control.shutdown {
                    return;
                }
                if control.wake_requested {
                    control.wake_requested = false;
                    break;
                }
                let wait = deadline_ms
                    .filter(|_| control.online && control.session_valid)
                    .map(|deadline| deadline.saturating_sub(clock.now_ms()));
                match wait {
                    Some(remaining) if remaining <= 0 => break,
                    Some(remaining) => {
                        let (next, _) = match shared
                            .wake
                            .wait_timeout(control, Duration::from_millis(remaining as u64))
                        {
                            Ok(result) => result,
                            Err(_) => return,
                        };
                        control = next;
                    }
                    None => {
                        control = match shared.wake.wait(control) {
                            Ok(control) => control,
                            Err(_) => return,
                        };
                    }
                }
            }
            (control.online, control.session_valid)
        };

        if !online {
            publish(&shared, &config, offline_status(queue.as_ref()));
            continue;
        }
        if !session_valid {
            publish(&shared, &config, paused_status(queue.as_ref()));
            continue;
        }

        shared.cancellation.clear_interrupt();
        let mut outcome = run_sync_cycle(
            queue.as_ref(),
            transport.as_ref(),
            assets.as_ref(),
            clock.as_ref(),
            &shared.cancellation,
            &mut backoff,
            &config.cycle,
        );
        if outcome.workspace_changed
            && let Some(observer) = &config.workspace_observer
        {
            observer();
        }
        if outcome.status == SyncStatus::UpToDate
            && let Some(failure) = run_checkpoint_publication(
                &CheckpointPublication {
                    queue: queue.as_ref(),
                    workspace: workspace.as_ref(),
                    transport: transport.as_ref(),
                    clock: clock.as_ref(),
                    cancellation: &shared.cancellation,
                    cycle_config: &config.cycle,
                    config: &config.checkpoint,
                },
                &mut backoff,
                &mut checkpoint_state,
            )
        {
            outcome = failure;
        }
        publish(&shared, &config, outcome.status.clone());
        deadline_ms = match outcome.status {
            SyncStatus::LocalOnly => None,
            _ => {
                let poll_at = clock.now_ms().saturating_add(config.poll_interval_ms);
                Some(
                    outcome
                        .retry_at_ms
                        .map_or(poll_at, |retry| retry.min(poll_at)),
                )
            }
        };
    }
}

fn offline_status(queue: &dyn WorkspaceSyncQueue) -> SyncStatus {
    match queue.sync_connection() {
        Ok(Some(_)) => SyncStatus::Offline,
        _ => SyncStatus::LocalOnly,
    }
}

fn paused_status(queue: &dyn WorkspaceSyncQueue) -> SyncStatus {
    match queue.sync_connection() {
        Ok(Some(_)) => SyncStatus::AuthenticationRequired,
        _ => SyncStatus::LocalOnly,
    }
}

fn publish(shared: &CoordinatorShared, config: &SyncCoordinatorConfig, status: SyncStatus) {
    let changed = shared
        .status
        .lock()
        .map(|mut current| {
            if *current == status {
                false
            } else {
                *current = status.clone();
                true
            }
        })
        .unwrap_or(false);
    if changed && let Some(observer) = &config.status_observer {
        observer(&status);
    }
}
