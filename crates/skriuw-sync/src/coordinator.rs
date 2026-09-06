use std::{
    sync::{Arc, Condvar, Mutex, RwLock},
    thread::{self, JoinHandle},
    time::Duration,
};

use skriuw_storage::{WorkspaceMaintenance, WorkspaceSyncQueue};

use crate::{
    backoff::SyncBackoffConfig,
    checkpoint::{
        CheckpointPublication, CheckpointPublicationConfig, CheckpointPublicationState,
        run_checkpoint_publication,
    },
    content::SyncAssetStore,
    cycle::{RemoteChangeSet, SyncCycleConfig, SyncCycleState, SyncStatus, run_sync_cycle},
    transport::{SyncCancellation, SyncClock, SyncTransport},
};

pub type SyncStatusObserver = Arc<dyn Fn(&SyncStatus) + Send + Sync>;
pub type SyncWorkspaceObserver = Arc<dyn Fn(&RemoteChangeSet) + Send + Sync>;

/// Fallback poll cadence. The wake channel is the fast path; these bound how
/// stale a device can be when the channel is down, scaled by whether anyone
/// is looking at the window, and how often a device flagged offline probes
/// the network to find out it is back.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SyncPollIntervals {
    pub channel_connected_ms: i64,
    pub visible_focused_ms: i64,
    pub visible_unfocused_ms: i64,
    pub hidden_ms: i64,
    pub offline_probe_ms: i64,
}

impl Default for SyncPollIntervals {
    fn default() -> Self {
        Self {
            channel_connected_ms: 60_000,
            visible_focused_ms: 15_000,
            visible_unfocused_ms: 60_000,
            hidden_ms: 5 * 60_000,
            offline_probe_ms: 15_000,
        }
    }
}

/// Selects the fallback poll interval from the wake-channel state and the
/// renderer-reported window visibility.
#[must_use]
pub fn poll_interval_ms(
    intervals: &SyncPollIntervals,
    channel_connected: bool,
    visible: bool,
    focused: bool,
) -> i64 {
    if channel_connected {
        intervals.channel_connected_ms
    } else if !visible {
        intervals.hidden_ms
    } else if focused {
        intervals.visible_focused_ms
    } else {
        intervals.visible_unfocused_ms
    }
}

#[derive(Clone, Default)]
pub struct SyncCoordinatorConfig {
    pub cycle: SyncCycleConfig,
    pub backoff: SyncBackoffConfig,
    pub checkpoint: CheckpointPublicationConfig,
    pub poll: SyncPollIntervals,
    pub status_observer: Option<SyncStatusObserver>,
    pub workspace_observer: Option<SyncWorkspaceObserver>,
    /// Bearer token shared with the transport and the wake listener, so a
    /// refreshed session is used by every later request without rebuilding
    /// the coordinator.
    pub session_token: Option<Arc<RwLock<String>>>,
}

struct Control {
    shutdown: bool,
    wake_requested: bool,
    offline_notice: bool,
    reset_requested: bool,
    online: bool,
    session_valid: bool,
    channel_connected: bool,
    visible: bool,
    focused: bool,
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
    session_token: Option<Arc<RwLock<String>>>,
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
                offline_notice: false,
                reset_requested: false,
                online: true,
                session_valid: true,
                channel_connected: false,
                visible: true,
                focused: true,
            }),
            wake: Condvar::new(),
            status: Mutex::new(SyncStatus::Connecting),
            cancellation: SyncCancellation::new(),
        });
        let session_token = config.session_token.clone();
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
            session_token,
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

    /// User intent, focus, or a wake: clears durable retry delays and the
    /// backoff before the next cycle so nothing recorded earlier defers it.
    pub fn request_refresh(&self) {
        self.update(|control| {
            control.reset_requested = true;
        });
    }

    pub fn notify_reconnected(&self) {
        self.update(|control| {
            control.online = true;
            control.reset_requested = true;
        });
    }

    /// Reports the renderer's online hint. Offline is scheduling advice, not
    /// a gate: the coordinator keeps probing at the offline cadence, any wake
    /// clears the flag, and a successful cycle flips it back.
    pub fn set_online(&self, online: bool) {
        if online {
            self.notify_reconnected();
            return;
        }
        if let Ok(mut control) = self.shared.control.lock() {
            control.online = false;
            control.offline_notice = true;
            control.wake_requested = true;
            self.shared.cancellation.interrupt();
        }
        self.shared.wake.notify_all();
    }

    pub fn set_wake_channel_connected(&self, connected: bool) {
        if let Ok(mut control) = self.shared.control.lock() {
            control.channel_connected = connected;
        }
        self.shared.wake.notify_all();
    }

    pub fn set_visibility(&self, visible: bool, focused: bool) {
        if let Ok(mut control) = self.shared.control.lock() {
            control.visible = visible;
            control.focused = focused;
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

    /// Installs a fresh session credential into the shared token and resumes
    /// polling from the preserved durable state.
    pub fn resume_with_session(&self, token: &str) {
        if let Some(shared) = &self.session_token
            && let Ok(mut current) = shared.write()
        {
            *current = token.to_string();
        }
        self.update(|control| {
            control.session_valid = true;
            control.online = true;
            control.reset_requested = true;
        });
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
        self.update(|_| {});
    }

    fn update(&self, change: impl FnOnce(&mut Control)) {
        if let Ok(mut control) = self.shared.control.lock() {
            change(&mut control);
            control.online = true;
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

struct Snapshot {
    online: bool,
    session_valid: bool,
    offline_notice: bool,
    reset_requested: bool,
    channel_connected: bool,
    visible: bool,
    focused: bool,
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
    let mut state = SyncCycleState::new(config.backoff);
    let mut checkpoint_state = CheckpointPublicationState::new();
    let mut deadline_ms: Option<i64> = None;
    loop {
        let snapshot = {
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
                    .filter(|_| control.session_valid)
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
            let snapshot = Snapshot {
                online: control.online,
                session_valid: control.session_valid,
                offline_notice: control.offline_notice,
                reset_requested: control.reset_requested,
                channel_connected: control.channel_connected,
                visible: control.visible,
                focused: control.focused,
            };
            control.offline_notice = false;
            control.reset_requested = false;
            snapshot
        };

        if !snapshot.session_valid {
            publish(&shared, &config, paused_status(queue.as_ref()));
            deadline_ms = None;
            continue;
        }
        if snapshot.offline_notice {
            publish(&shared, &config, offline_status(queue.as_ref()));
            deadline_ms = Some(clock.now_ms().saturating_add(config.poll.offline_probe_ms));
            continue;
        }
        if snapshot.reset_requested {
            let _ = queue.reset_sync_retry_times(clock.now_ms());
            state.backoff.reset();
        }

        shared.cancellation.clear_interrupt();
        let mut outcome = run_sync_cycle(
            queue.as_ref(),
            transport.as_ref(),
            assets.as_ref(),
            clock.as_ref(),
            &shared.cancellation,
            &mut state,
            &config.cycle,
        );
        if !outcome.changes.is_empty()
            && let Some(observer) = &config.workspace_observer
        {
            observer(&outcome.changes);
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
                &mut state.backoff,
                &mut checkpoint_state,
            )
        {
            outcome = failure;
        }

        let online = match &outcome.status {
            SyncStatus::Retrying { .. } => snapshot.online,
            _ => true,
        };
        let status = match &outcome.status {
            SyncStatus::Retrying { .. } if !online => offline_status(queue.as_ref()),
            status => status.clone(),
        };
        if let Ok(mut control) = shared.control.lock() {
            control.online = online;
            if status == SyncStatus::AuthenticationRequired {
                control.session_valid = false;
            }
        }
        publish(&shared, &config, status.clone());
        deadline_ms = match status {
            SyncStatus::LocalOnly | SyncStatus::AuthenticationRequired => None,
            _ => {
                let interval = if online {
                    poll_interval_ms(
                        &config.poll,
                        snapshot.channel_connected,
                        snapshot.visible,
                        snapshot.focused,
                    )
                } else {
                    config.poll.offline_probe_ms
                };
                let poll_at = clock.now_ms().saturating_add(interval);
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

#[cfg(test)]
mod tests {
    use super::{SyncPollIntervals, poll_interval_ms};

    #[test]
    fn poll_interval_follows_the_channel_and_window_state() {
        let intervals = SyncPollIntervals::default();
        assert_eq!(poll_interval_ms(&intervals, true, true, true), 60_000);
        assert_eq!(poll_interval_ms(&intervals, true, false, false), 60_000);
        assert_eq!(poll_interval_ms(&intervals, false, true, true), 15_000);
        assert_eq!(poll_interval_ms(&intervals, false, true, false), 60_000);
        assert_eq!(poll_interval_ms(&intervals, false, false, true), 300_000);
        assert_eq!(poll_interval_ms(&intervals, false, false, false), 300_000);
    }
}
