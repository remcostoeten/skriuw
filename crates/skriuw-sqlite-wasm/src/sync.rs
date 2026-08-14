//! Browser-worker ownership of the authenticated sync lifecycle.
//!
//! The desktop coordinator's cycle, hydration, checkpoint, and content rules
//! from `skriuw-sync` run unchanged inside the storage worker; only the thread
//! and timer scheduling moves to the JavaScript owner, which submits one
//! bounded `sync_cycle` request at a time and schedules the next one from the
//! reported outcome. Identity, cursor, idempotency, and local-echo behavior
//! therefore stay byte-identical with native replication.

use std::sync::{Arc, Mutex};

use skriuw_domain::{SyncPullResponse, SyncPushRequest, SyncPushResponse, WorkspaceCheckpoint};
use skriuw_storage::{NewSyncConnection, WorkspaceMaintenance, WorkspaceSyncQueue};
use skriuw_sync::{
    CheckpointPublication, CheckpointPublicationConfig, CheckpointPublicationState, SyncBackoff,
    SyncBackoffConfig, SyncCancellation, SyncClock, SyncCycleConfig, SyncCycleOutcome, SyncStatus,
    SyncTransport, TransportError, run_checkpoint_publication, run_sync_cycle,
};

use crate::protocol::{
    BrowserStorageError, BrowserSyncConnection, BrowserSyncCycleReport, BrowserSyncProgress,
    BrowserSyncProgressPhase,
};
use crate::runtime::map_storage_error;

/// Creates the transport bound to one session credential. The factory seam
/// keeps authentication material out of this module and lets tests drive the
/// full worker sync surface over the deterministic fake transport.
pub type SyncTransportFactory<'a> =
    &'a dyn Fn(&str, &str) -> Result<Box<dyn SyncTransport>, BrowserStorageError>;

/// Capabilities the sync commands need beyond the storage backend.
pub struct BrowserSyncEnvironment<'a> {
    pub clock: &'a dyn SyncClock,
    pub assets: &'a dyn skriuw_sync::SyncAssetStore,
    pub transport_factory: SyncTransportFactory<'a>,
}

struct BrowserSyncSession {
    transport: Box<dyn SyncTransport>,
    backoff: SyncBackoff,
    checkpoint_state: CheckpointPublicationState,
    cancellation: SyncCancellation,
}

/// Bounded per-request work: the storage worker serializes sync cycles with
/// renderer persistence requests, so one cycle must stay short instead of
/// draining an arbitrarily deep queue. `Pending` outcomes make the scheduler
/// run again immediately, which yields between cycles.
fn browser_cycle_config() -> SyncCycleConfig {
    SyncCycleConfig {
        worker_id: "browser-sync".into(),
        max_push_batches_per_cycle: 4,
        max_pull_pages_per_cycle: 4,
        ..SyncCycleConfig::default()
    }
}

pub struct BrowserSyncRuntime {
    session: Option<BrowserSyncSession>,
    last_status: SyncStatus,
    cycle_config: SyncCycleConfig,
    checkpoint_config: CheckpointPublicationConfig,
}

impl Default for BrowserSyncRuntime {
    fn default() -> Self {
        Self::new()
    }
}

impl BrowserSyncRuntime {
    #[must_use]
    pub fn new() -> Self {
        Self {
            session: None,
            last_status: SyncStatus::LocalOnly,
            cycle_config: browser_cycle_config(),
            checkpoint_config: CheckpointPublicationConfig::default(),
        }
    }

    pub fn connection(
        &self,
        queue: &dyn WorkspaceSyncQueue,
    ) -> Result<Option<BrowserSyncConnection>, BrowserStorageError> {
        let connection = queue.sync_connection().map_err(map_storage_error)?;
        Ok(connection.map(|connection| BrowserSyncConnection {
            workspace_id: connection.workspace_id,
            device_id: connection.device_id,
            observed_server_sequence: connection.observed_server_sequence,
        }))
    }

    /// Persists the provisioned identity and opens an authenticated session.
    /// The identity rules mirror the desktop runtime: an existing device
    /// identity is never replaced, and a workspace already linked to another
    /// account refuses to connect instead of merging histories.
    pub fn connect(
        &mut self,
        queue: &dyn WorkspaceSyncQueue,
        environment: &BrowserSyncEnvironment<'_>,
        token: &str,
        base_url: &str,
        workspace_id: &str,
        device_id: &str,
    ) -> Result<SyncStatus, BrowserStorageError> {
        let existing = queue.sync_connection().map_err(map_storage_error)?;
        if let Some(existing) = &existing {
            if existing.workspace_id != workspace_id {
                return Err(BrowserStorageError::invalid(
                    "This workspace is linked to another cloud workspace. Sign back into its original account and cloud environment, or open a fresh local workspace before linking a different account.",
                ));
            }
            if existing.device_id != device_id {
                return Err(BrowserStorageError::invalid(
                    "This workspace already has a different device identity.",
                ));
            }
        }
        self.disconnect_session();
        let transport = (environment.transport_factory)(token, base_url)?;
        queue
            .connect_sync(&NewSyncConnection {
                workspace_id: workspace_id.into(),
                device_id: device_id.into(),
                connected_at: environment.clock.now_ms(),
                observed_server_sequence: existing
                    .map_or(0, |connection| connection.observed_server_sequence),
            })
            .map_err(map_storage_error)?;
        self.session = Some(BrowserSyncSession {
            transport,
            backoff: SyncBackoff::new(SyncBackoffConfig::default()),
            checkpoint_state: CheckpointPublicationState::new(),
            cancellation: SyncCancellation::new(),
        });
        self.last_status = SyncStatus::Connecting;
        Ok(self.last_status.clone())
    }

    /// Pauses network work without discarding the durable connection or the
    /// outbox. A later connect with a fresh credential resumes from durable
    /// state.
    pub fn disconnect(
        &mut self,
        queue: &dyn WorkspaceSyncQueue,
    ) -> Result<SyncStatus, BrowserStorageError> {
        self.disconnect_session();
        self.last_status = self.resting_status(queue)?;
        Ok(self.last_status.clone())
    }

    pub fn status(
        &mut self,
        queue: &dyn WorkspaceSyncQueue,
    ) -> Result<SyncStatus, BrowserStorageError> {
        if self.session.is_some() {
            return Ok(self.last_status.clone());
        }
        self.last_status = self.resting_status(queue)?;
        Ok(self.last_status.clone())
    }

    /// One deterministic push-then-pull pass plus due checkpoint publication,
    /// exactly like a single wake of the desktop coordinator worker thread.
    pub fn cycle<B>(
        &mut self,
        backend: &B,
        environment: &BrowserSyncEnvironment<'_>,
    ) -> Result<BrowserSyncCycleReport, BrowserStorageError>
    where
        B: WorkspaceSyncQueue + WorkspaceMaintenance,
    {
        let Some(session) = self.session.as_mut() else {
            return Err(BrowserStorageError::invalid(
                "Cloud sync has no active session; connect before requesting a cycle.",
            ));
        };
        session.cancellation.clear_interrupt();
        let mut outcome = run_sync_cycle(
            backend,
            session.transport.as_ref(),
            environment.assets,
            environment.clock,
            &session.cancellation,
            &mut session.backoff,
            &self.cycle_config,
        );
        if outcome.status == SyncStatus::UpToDate
            && let Some(failure) = run_checkpoint_publication(
                &CheckpointPublication {
                    queue: backend,
                    workspace: backend,
                    transport: session.transport.as_ref(),
                    clock: environment.clock,
                    cancellation: &session.cancellation,
                    cycle_config: &self.cycle_config,
                    config: &self.checkpoint_config,
                },
                &mut session.backoff,
                &mut session.checkpoint_state,
            )
        {
            outcome = SyncCycleOutcome {
                workspace_changed: outcome.workspace_changed,
                ..failure
            };
        }
        self.last_status = outcome.status.clone();
        Ok(BrowserSyncCycleReport {
            status: outcome.status,
            retry_at_ms: outcome.retry_at_ms,
            workspace_changed: outcome.workspace_changed,
        })
    }

    fn disconnect_session(&mut self) {
        if let Some(session) = self.session.take() {
            session.cancellation.interrupt();
        }
    }

    /// A workspace with a durable connection but no session credential needs
    /// a fresh sign-in before sync can resume; a never-linked workspace is
    /// simply local-only. Every reload passes through this state until the
    /// renderer reopens the session, from a persisted credential or an
    /// interactive sign-in.
    fn resting_status(
        &self,
        queue: &dyn WorkspaceSyncQueue,
    ) -> Result<SyncStatus, BrowserStorageError> {
        let connection = queue.sync_connection().map_err(map_storage_error)?;
        Ok(match connection {
            Some(_) => SyncStatus::AuthenticationRequired,
            None => SyncStatus::LocalOnly,
        })
    }
}

pub type SyncProgressObserver = Arc<dyn Fn(&BrowserSyncProgress) + Send + Sync>;

#[derive(Default)]
struct ProgressState {
    phase: Option<BrowserSyncProgressPhase>,
    transferred_chunks: u64,
    transferred_bytes: u64,
    expected_chunks: Option<u64>,
    expected_bytes: Option<u64>,
}

/// Decorates a transport with per-chunk progress reporting so multi-chunk
/// checkpoint hydrations and uploads stay visible while a single worker
/// request is in flight. Totals come from the most recent checkpoint record
/// seen on this transport; ordinary pull-content downloads report without
/// totals.
pub struct ProgressReportingTransport<T: SyncTransport> {
    inner: T,
    observer: SyncProgressObserver,
    state: Mutex<ProgressState>,
}

impl<T: SyncTransport> ProgressReportingTransport<T> {
    pub fn new(inner: T, observer: SyncProgressObserver) -> Self {
        Self {
            inner,
            observer,
            state: Mutex::new(ProgressState::default()),
        }
    }

    fn emit(&self, update: impl FnOnce(&mut ProgressState)) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        update(&mut state);
        let Some(phase) = state.phase else {
            return;
        };
        (self.observer)(&BrowserSyncProgress {
            phase,
            transferred_chunks: state.transferred_chunks,
            transferred_bytes: state.transferred_bytes,
            expected_chunks: state.expected_chunks,
            expected_bytes: state.expected_bytes,
        });
    }
}

impl<T: SyncTransport> SyncTransport for ProgressReportingTransport<T> {
    fn push(
        &self,
        workspace_id: &str,
        request: &SyncPushRequest,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPushResponse, TransportError> {
        self.inner.push(workspace_id, request, cancellation)
    }

    fn pull(
        &self,
        workspace_id: &str,
        after_server_sequence: u64,
        limit: usize,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPullResponse, TransportError> {
        self.inner
            .pull(workspace_id, after_server_sequence, limit, cancellation)
    }

    fn has_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<bool, TransportError> {
        self.inner.has_chunk(workspace_id, digest, cancellation)
    }

    fn put_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        bytes: &[u8],
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.inner
            .put_chunk(workspace_id, digest, bytes, cancellation)?;
        let byte_length = bytes.len() as u64;
        self.emit(|state| {
            if state.phase != Some(BrowserSyncProgressPhase::Uploading) {
                *state = ProgressState {
                    phase: Some(BrowserSyncProgressPhase::Uploading),
                    ..ProgressState::default()
                };
            }
            state.transferred_chunks += 1;
            state.transferred_bytes += byte_length;
        });
        Ok(())
    }

    fn get_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Vec<u8>, TransportError> {
        let bytes = self.inner.get_chunk(workspace_id, digest, cancellation)?;
        let byte_length = bytes.len() as u64;
        self.emit(|state| {
            if !matches!(
                state.phase,
                Some(BrowserSyncProgressPhase::Hydrating | BrowserSyncProgressPhase::Downloading)
            ) {
                *state = ProgressState {
                    phase: Some(BrowserSyncProgressPhase::Downloading),
                    ..ProgressState::default()
                };
            }
            state.transferred_chunks += 1;
            state.transferred_bytes += byte_length;
        });
        Ok(bytes)
    }

    fn latest_checkpoint(
        &self,
        workspace_id: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Option<WorkspaceCheckpoint>, TransportError> {
        let checkpoint = self.inner.latest_checkpoint(workspace_id, cancellation)?;
        if let Some(checkpoint) = &checkpoint {
            let expected_chunks = checkpoint.content.chunks.len() as u64;
            let expected_bytes = checkpoint.content.total_byte_length;
            self.emit(|state| {
                *state = ProgressState {
                    phase: Some(BrowserSyncProgressPhase::Hydrating),
                    expected_chunks: Some(expected_chunks),
                    expected_bytes: Some(expected_bytes),
                    ..ProgressState::default()
                };
            });
        }
        Ok(checkpoint)
    }

    fn publish_checkpoint(
        &self,
        workspace_id: &str,
        checkpoint: &WorkspaceCheckpoint,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.inner
            .publish_checkpoint(workspace_id, checkpoint, cancellation)
    }

    fn acknowledge(
        &self,
        workspace_id: &str,
        device_id: &str,
        server_sequence: u64,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.inner
            .acknowledge(workspace_id, device_id, server_sequence, cancellation)
    }
}
