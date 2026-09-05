use serde::{Deserialize, Serialize};
use skriuw_domain::{
    MAX_SYNC_BATCH_OPERATIONS, MAX_SYNC_PULL_OPERATIONS, ReplicatedWorkspaceOperation,
    SyncPullResponse, WORKSPACE_SYNC_PROTOCOL_VERSION, WorkspaceOperation,
};
use skriuw_storage::{
    Diagnostic, DiagnosticCategory, DiagnosticContext, RemoteSyncApplyOutcome, StorageError,
    SyncConnection, WorkspaceSyncQueue,
};

use crate::{
    backoff::{SyncBackoff, SyncBackoffConfig},
    checkpoint::{hydrate_from_latest_checkpoint, rehydrate_from_latest_checkpoint},
    content::{
        SyncAssetStore, externalize_asset_content, externalize_oversized_operations,
        resolve_asset_content, resolve_chunked_operations,
    },
    transport::{SyncCancellation, SyncClock, SyncTransport, TransportError},
};

pub const BLOCKED_REASON_AUTHORIZATION_DENIED: &str = "authorization_denied";
pub const BLOCKED_REASON_REJECTED_BATCH: &str = "rejected_batch";
pub const BLOCKED_REASON_PUSH_CONFLICT: &str = "push_conflict";
pub const BLOCKED_REASON_PROTOCOL_MISMATCH: &str = "protocol_mismatch";
pub const BLOCKED_REASON_REJECTED_ACKNOWLEDGEMENT: &str = "rejected_acknowledgement";
pub const BLOCKED_REASON_STORAGE_FAILURE: &str = "storage_failure";
pub const BLOCKED_REASON_REJECTED_CHECKPOINT: &str = "rejected_checkpoint";
pub const BLOCKED_REASON_REJECTED_PULL: &str = "rejected_pull";
pub const BLOCKED_REASON_LOG_TRUNCATED: &str = "log_truncated";
pub const BLOCKED_REASON_LOG_TRUNCATED_WITHOUT_CHECKPOINT: &str =
    "log_truncated_without_checkpoint";
/// Unresolved parked operations keep the device out of `upToDate`; the reason
/// names the parked rows when they do not all share one durable reason code.
pub const BLOCKED_REASON_BLOCKED_OPERATIONS: &str = "blocked_operations";

/// Durable per-operation blocked reason recorded in storage when an
/// operation's declared asset bytes are absent locally at push time. The
/// cycle keeps pushing everything else; the blocked record stays visible
/// through `WorkspaceSyncQueue::blocked_sync_operations`.
pub const BLOCKED_OPERATION_REASON_ASSET_CONTENT_MISSING: &str = "asset_content_missing";
/// Durable per-operation blocked reason for a batch the service rejected as
/// invalid three times in a row with the same answer.
pub const BLOCKED_OPERATION_REASON_CLOUD_REJECTED: &str = "cloud_rejected";

pub const MAX_BLOCKED_DETAIL_CHARS: usize = 1_024;
pub const CONSECUTIVE_REJECTIONS_BEFORE_PARKING: u32 = 3;
pub const PULL_APPLY_SUB_BATCH_OPERATIONS: usize = 32;
pub const FULL_CHANGE_NOTE_THRESHOLD: usize = 256;

/// Narrow status projection consumed by the runtime and UI. The UI may render
/// this and request connect, disconnect, retry, or refresh; retry and cursor
/// logic stay inside the coordinator.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SyncStatus {
    LocalOnly,
    Connecting,
    Rehydrating,
    UpToDate,
    Pending,
    Offline,
    AuthenticationRequired,
    Retrying {
        next_attempt_at: i64,
    },
    Blocked {
        reason: String,
        detail: Option<String>,
    },
}

impl SyncStatus {
    #[must_use]
    pub fn blocked(reason: &str, detail: impl AsRef<str>) -> Self {
        Self::Blocked {
            reason: reason.into(),
            detail: Some(bounded_detail(detail.as_ref())),
        }
    }

    #[must_use]
    pub fn blocked_without_detail(reason: &str) -> Self {
        Self::Blocked {
            reason: reason.into(),
            detail: None,
        }
    }
}

/// What a cycle changed in canonical state, so the renderer can reconcile
/// only the affected notes. Document operations contribute note ids; any
/// other applied operation marks the structure changed; hydration,
/// rehydration, or more than [`FULL_CHANGE_NOTE_THRESHOLD`] notes demand a
/// full snapshot.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChangeSet {
    pub note_ids: Vec<String>,
    pub structure_changed: bool,
    pub full: bool,
}

impl RemoteChangeSet {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        !self.full && !self.structure_changed && self.note_ids.is_empty()
    }

    pub fn mark_full(&mut self) {
        self.full = true;
        self.note_ids.clear();
    }

    pub fn record(&mut self, operation: &WorkspaceOperation) {
        match operation {
            WorkspaceOperation::SaveDocument { note_id, .. } => self.record_note(note_id),
            WorkspaceOperation::CreateNote { id, .. } => {
                self.record_note(id);
                self.structure_changed = true;
            }
            _ => self.structure_changed = true,
        }
    }

    fn record_note(&mut self, note_id: &str) {
        if self.full {
            return;
        }
        if !self.note_ids.iter().any(|known| known == note_id) {
            self.note_ids.push(note_id.to_string());
        }
        if self.note_ids.len() > FULL_CHANGE_NOTE_THRESHOLD {
            self.mark_full();
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncCycleConfig {
    pub worker_id: String,
    pub lease_ms: i64,
    pub push_batch_limit: usize,
    pub pull_batch_limit: usize,
    pub max_push_batches_per_cycle: usize,
    pub max_pull_pages_per_cycle: usize,
    pub blocked_retry_delay_ms: i64,
}

impl Default for SyncCycleConfig {
    fn default() -> Self {
        Self {
            worker_id: "sync-coordinator".into(),
            lease_ms: 30_000,
            push_batch_limit: MAX_SYNC_BATCH_OPERATIONS,
            pull_batch_limit: MAX_SYNC_PULL_OPERATIONS,
            max_push_batches_per_cycle: 16,
            max_pull_pages_per_cycle: 16,
            blocked_retry_delay_ms: 10 * 60 * 1_000,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RejectionTracker {
    operation_ids: Vec<String>,
    detail: String,
    count: u32,
}

/// Per-session memory the cycle carries between runs: the backoff, the pull
/// page size reduced after an oversized response, the run of identical
/// rejections for the claimed batch, and a rehydration the previous cycle
/// requested. Everything durable stays in the queue; this state only shapes
/// the next attempt and is rebuilt from scratch after a restart.
#[derive(Debug, Clone)]
pub struct SyncCycleState {
    pub backoff: SyncBackoff,
    reduced_pull_batch_limit: Option<usize>,
    rejection: Option<RejectionTracker>,
    acknowledgement_rejections: u32,
    rehydration_requested: bool,
}

impl SyncCycleState {
    #[must_use]
    pub fn new(backoff: SyncBackoffConfig) -> Self {
        Self::with_backoff(SyncBackoff::new(backoff))
    }

    #[must_use]
    pub fn with_backoff(backoff: SyncBackoff) -> Self {
        Self {
            backoff,
            reduced_pull_batch_limit: None,
            rejection: None,
            acknowledgement_rejections: 0,
            rehydration_requested: false,
        }
    }

    #[must_use]
    pub fn rehydration_requested(&self) -> bool {
        self.rehydration_requested
    }

    #[must_use]
    pub fn pull_batch_limit(&self, config: &SyncCycleConfig) -> usize {
        self.reduced_pull_batch_limit
            .unwrap_or(config.pull_batch_limit)
            .clamp(1, config.pull_batch_limit)
    }

    fn shrink_pull_batch_limit(&mut self, config: &SyncCycleConfig) {
        let current = self.pull_batch_limit(config);
        self.reduced_pull_batch_limit = Some((current / 2).max(1));
    }

    fn restore_pull_batch_limit(&mut self) {
        self.reduced_pull_batch_limit = None;
    }

    fn record_rejection(&mut self, operation_ids: &[String], detail: &str) -> u32 {
        let count = match &self.rejection {
            Some(previous)
                if previous.operation_ids == operation_ids && previous.detail == detail =>
            {
                previous.count + 1
            }
            _ => 1,
        };
        self.rejection = Some(RejectionTracker {
            operation_ids: operation_ids.to_vec(),
            detail: detail.to_string(),
            count,
        });
        count
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncCycleOutcome {
    pub status: SyncStatus,
    pub retry_at_ms: Option<i64>,
    /// What this cycle changed in canonical state. Local echoes and
    /// duplicates contribute nothing.
    pub changes: RemoteChangeSet,
}

impl SyncCycleOutcome {
    pub(crate) fn settled(status: SyncStatus) -> Self {
        Self {
            status,
            retry_at_ms: None,
            changes: RemoteChangeSet::default(),
        }
    }

    pub(crate) fn retry(status: SyncStatus, retry_at_ms: i64) -> Self {
        Self {
            status,
            retry_at_ms: Some(retry_at_ms),
            changes: RemoteChangeSet::default(),
        }
    }

    #[must_use]
    pub fn workspace_changed(&self) -> bool {
        !self.changes.is_empty()
    }
}

/// One deterministic push-then-pull pass over the durable queue. Every
/// SQLite transaction is committed before a network call starts and every
/// network result is written back through the `WorkspaceSyncQueue` port, so
/// interrupting the process at any point leaves resumable durable state.
pub fn run_sync_cycle(
    queue: &dyn WorkspaceSyncQueue,
    transport: &dyn SyncTransport,
    assets: &dyn SyncAssetStore,
    clock: &dyn SyncClock,
    cancellation: &SyncCancellation,
    state: &mut SyncCycleState,
    config: &SyncCycleConfig,
) -> SyncCycleOutcome {
    let mut cycle = Cycle {
        queue,
        transport,
        assets,
        clock,
        cancellation,
        state,
        config,
        changes: RemoteChangeSet::default(),
    };
    let mut outcome = cycle.run();
    outcome.changes = cycle.changes;
    outcome
}

struct Cycle<'a> {
    queue: &'a dyn WorkspaceSyncQueue,
    transport: &'a dyn SyncTransport,
    assets: &'a dyn SyncAssetStore,
    clock: &'a dyn SyncClock,
    cancellation: &'a SyncCancellation,
    state: &'a mut SyncCycleState,
    config: &'a SyncCycleConfig,
    changes: RemoteChangeSet,
}

enum PushFailure {
    Return(SyncCycleOutcome),
    Continue,
    Defer(SyncCycleOutcome),
}

enum PullPage {
    Applied,
    Drained,
}

impl Cycle<'_> {
    fn run(&mut self) -> SyncCycleOutcome {
        let connection = match self.queue.sync_connection() {
            Ok(Some(connection)) => connection,
            Ok(None) => return SyncCycleOutcome::settled(SyncStatus::LocalOnly),
            Err(error) => return self.storage_failure(&error),
        };
        if self.state.rehydration_requested {
            self.state.rehydration_requested = false;
            if let Err(outcome) = rehydrate_from_latest_checkpoint(
                self.queue,
                self.transport,
                self.clock,
                self.cancellation,
                &mut self.state.backoff,
                self.config,
                &connection,
            ) {
                return outcome;
            }
            self.changes.mark_full();
        } else if is_hydration_candidate(&connection) {
            match self.queue.has_pending_sync_operations() {
                Ok(true) => {}
                Ok(false) => match hydrate_from_latest_checkpoint(
                    self.queue,
                    self.transport,
                    self.clock,
                    self.cancellation,
                    &mut self.state.backoff,
                    self.config,
                    &connection,
                ) {
                    Ok(true) => self.changes.mark_full(),
                    Ok(false) => {}
                    Err(outcome) => return outcome,
                },
                Err(error) => return self.storage_failure(&error),
            }
        }

        let (deferred, more_push_pending) = match self.push_phase() {
            Ok(result) => result,
            Err(outcome) => return outcome,
        };
        let more_pull_pending = match self.pull_phase() {
            Ok(more) => more,
            Err(outcome) => return outcome,
        };
        if more_push_pending || more_pull_pending {
            return SyncCycleOutcome::retry(SyncStatus::Pending, self.clock.now_ms());
        }

        let connection = match self.queue.sync_connection() {
            Ok(Some(connection)) => connection,
            Ok(None) => return SyncCycleOutcome::settled(SyncStatus::LocalOnly),
            Err(error) => return self.storage_failure(&error),
        };
        if connection.observed_server_sequence > 0
            && let Err(error) = self.transport.acknowledge(
                &connection.workspace_id,
                &connection.device_id,
                connection.observed_server_sequence,
                self.cancellation,
            )
        {
            return self.acknowledge_failure(&error);
        }
        if let Some(deferred) = deferred {
            return deferred;
        }
        self.settle()
    }

    fn push_phase(&mut self) -> Result<(Option<SyncCycleOutcome>, bool), SyncCycleOutcome> {
        let asset_available = |content_hash: &str, mime_type: &str| {
            self.assets
                .read_asset(content_hash, mime_type)
                .is_ok_and(|bytes| bytes.is_some())
        };
        if let Err(error) = self
            .queue
            .requeue_blocked_sync_operations_with_assets(self.clock.now_ms(), &asset_available)
        {
            return Err(self.storage_failure(&error));
        }

        let mut pushed_batches = 0;
        while pushed_batches < self.config.max_push_batches_per_cycle {
            if self.cancellation.is_cancelled() {
                return Err(SyncCycleOutcome::retry(
                    SyncStatus::Pending,
                    self.clock.now_ms(),
                ));
            }
            let claim = self.queue.claim_sync_operations(
                &self.config.worker_id,
                self.clock.now_ms(),
                self.config.lease_ms,
                self.config.push_batch_limit,
            );
            let batch = match claim {
                Ok(Some(batch)) => batch,
                Ok(None) => break,
                Err(error) => return Err(self.storage_failure(&error)),
            };
            let operation_ids = batch
                .request
                .operations
                .iter()
                .map(|operation| operation.operation_id.clone())
                .collect::<Vec<_>>();
            let mut request = batch.request.clone();
            let prepared = if self.cancellation.is_cancelled() {
                Err(TransportError::Cancelled)
            } else {
                externalize_oversized_operations(
                    self.transport,
                    &batch.workspace_id,
                    &mut request,
                    self.cancellation,
                )
                .and_then(|_| {
                    externalize_asset_content(
                        self.transport,
                        self.assets,
                        &batch.workspace_id,
                        &mut request,
                        self.cancellation,
                    )
                })
            };
            let result = match prepared {
                Ok(preparation) if !preparation.missing.is_empty() => {
                    match self.park_claimed(
                        &preparation.missing,
                        BLOCKED_OPERATION_REASON_ASSET_CONTENT_MISSING,
                    ) {
                        Ok(()) => {
                            pushed_batches += 1;
                            continue;
                        }
                        Err(StorageError::ReleaseRequired(reason)) => {
                            let outcome = self.release_blocked(
                                &operation_ids,
                                BLOCKED_REASON_REJECTED_BATCH,
                                &format!("asset content is missing locally; {reason}"),
                            );
                            return Ok((Some(outcome), false));
                        }
                        Err(error) => return Err(self.storage_failure(&error)),
                    }
                }
                Ok(_) => self
                    .transport
                    .push(&batch.workspace_id, &request, self.cancellation),
                Err(error) => Err(error),
            };
            match result {
                Ok(response)
                    if response.sync_protocol_version != WORKSPACE_SYNC_PROTOCOL_VERSION =>
                {
                    let error = TransportError::UnsupportedProtocol(response.sync_protocol_version);
                    return match self.push_failure(&operation_ids, &error) {
                        PushFailure::Return(outcome) => Err(outcome),
                        PushFailure::Continue => Ok((None, false)),
                        PushFailure::Defer(outcome) => Ok((Some(outcome), false)),
                    };
                }
                Ok(response) => {
                    match self
                        .queue
                        .acknowledge_sync_operations(&self.config.worker_id, &response.accepted)
                    {
                        Ok(()) => {
                            self.state.backoff.reset();
                            self.state.acknowledgement_rejections = 0;
                            self.state.rejection = None;
                            pushed_batches += 1;
                            if pushed_batches == self.config.max_push_batches_per_cycle {
                                return Ok((None, true));
                            }
                        }
                        Err(error) => {
                            let outcome = self.acknowledgement_rejected(&operation_ids, &error);
                            return Ok((Some(outcome), false));
                        }
                    }
                }
                Err(error) => match self.push_failure(&operation_ids, &error) {
                    PushFailure::Return(outcome) => return Err(outcome),
                    PushFailure::Continue => {
                        pushed_batches += 1;
                    }
                    PushFailure::Defer(outcome) => return Ok((Some(outcome), false)),
                },
            }
        }
        Ok((None, false))
    }

    fn park_claimed(&self, operation_ids: &[String], reason: &str) -> Result<(), StorageError> {
        self.queue
            .block_claimed_sync_operations(&self.config.worker_id, operation_ids, reason)
    }

    fn acknowledgement_rejected(
        &mut self,
        operation_ids: &[String],
        error: &StorageError,
    ) -> SyncCycleOutcome {
        self.state.acknowledgement_rejections =
            self.state.acknowledgement_rejections.saturating_add(1);
        let detail = format!("sync acknowledgement rejected: {error}");
        if self.state.acknowledgement_rejections < CONSECUTIVE_REJECTIONS_BEFORE_PARKING {
            let retry_at = self
                .clock
                .now_ms()
                .saturating_add(self.state.backoff.next_delay_ms(None));
            self.release_claim(
                operation_ids,
                retry_at,
                DiagnosticCategory::InvalidInput,
                &detail,
            );
            return SyncCycleOutcome::retry(
                SyncStatus::Retrying {
                    next_attempt_at: retry_at,
                },
                retry_at,
            );
        }
        self.release_blocked(
            operation_ids,
            BLOCKED_REASON_REJECTED_ACKNOWLEDGEMENT,
            &detail,
        )
    }

    fn push_failure(&mut self, operation_ids: &[String], error: &TransportError) -> PushFailure {
        let now = self.clock.now_ms();
        match error {
            TransportError::Cancelled => {
                self.release_claim(
                    operation_ids,
                    now,
                    DiagnosticCategory::Unavailable,
                    "sync push was cancelled",
                );
                PushFailure::Return(SyncCycleOutcome::retry(SyncStatus::Pending, now))
            }
            TransportError::AuthenticationRequired => {
                self.release_claim(
                    operation_ids,
                    now,
                    DiagnosticCategory::Unavailable,
                    "sync session expired during push",
                );
                PushFailure::Return(SyncCycleOutcome::settled(
                    SyncStatus::AuthenticationRequired,
                ))
            }
            TransportError::Validation(detail) => {
                let detail = detail.clone();
                let rejections = self.state.record_rejection(operation_ids, &detail);
                if rejections >= CONSECUTIVE_REJECTIONS_BEFORE_PARKING {
                    match self.park_claimed(operation_ids, BLOCKED_OPERATION_REASON_CLOUD_REJECTED)
                    {
                        Ok(()) => {
                            self.state.rejection = None;
                            return PushFailure::Continue;
                        }
                        Err(StorageError::ReleaseRequired(reason)) => {
                            return PushFailure::Defer(self.release_blocked(
                                operation_ids,
                                BLOCKED_REASON_REJECTED_BATCH,
                                &format!("{detail}; {reason}"),
                            ));
                        }
                        Err(error) => return PushFailure::Return(self.storage_failure(&error)),
                    }
                }
                PushFailure::Defer(self.release_blocked(
                    operation_ids,
                    BLOCKED_REASON_REJECTED_BATCH,
                    &error.to_string(),
                ))
            }
            TransportError::AuthorizationDenied
            | TransportError::Conflict(_)
            | TransportError::UnsupportedProtocol(_)
            | TransportError::LogTruncated => {
                let reason = match error {
                    TransportError::AuthorizationDenied => BLOCKED_REASON_AUTHORIZATION_DENIED,
                    TransportError::Conflict(_) => BLOCKED_REASON_PUSH_CONFLICT,
                    TransportError::UnsupportedProtocol(_) => BLOCKED_REASON_PROTOCOL_MISMATCH,
                    _ => BLOCKED_REASON_LOG_TRUNCATED,
                };
                PushFailure::Defer(self.release_blocked(operation_ids, reason, &error.to_string()))
            }
            TransportError::RateLimited { .. }
            | TransportError::Transient(_)
            | TransportError::Server { .. }
            | TransportError::ResponseTooLarge => {
                let retry_at =
                    now.saturating_add(self.state.backoff.next_delay_ms(error.retry_hint_ms()));
                self.release_claim(
                    operation_ids,
                    retry_at,
                    DiagnosticCategory::Unavailable,
                    &error.to_string(),
                );
                PushFailure::Defer(SyncCycleOutcome::retry(
                    SyncStatus::Retrying {
                        next_attempt_at: retry_at,
                    },
                    retry_at,
                ))
            }
        }
    }

    fn release_blocked(
        &self,
        operation_ids: &[String],
        reason: &str,
        detail: &str,
    ) -> SyncCycleOutcome {
        let retry_at = self
            .clock
            .now_ms()
            .saturating_add(self.config.blocked_retry_delay_ms);
        self.release_claim(
            operation_ids,
            retry_at,
            DiagnosticCategory::InvalidInput,
            detail,
        );
        SyncCycleOutcome::retry(SyncStatus::blocked(reason, detail), retry_at)
    }

    fn release_claim(
        &self,
        operation_ids: &[String],
        retry_at_ms: i64,
        category: DiagnosticCategory,
        message: &str,
    ) {
        if operation_ids.is_empty() {
            return;
        }
        let diagnostic = Diagnostic::new(DiagnosticContext::Sync, category, message);
        let _ = self.queue.release_sync_operations(
            &self.config.worker_id,
            operation_ids,
            retry_at_ms.max(0),
            &diagnostic,
        );
    }

    fn pull_phase(&mut self) -> Result<bool, SyncCycleOutcome> {
        let mut pages = 0;
        loop {
            if self.cancellation.is_cancelled() {
                return Err(SyncCycleOutcome::retry(
                    SyncStatus::Pending,
                    self.clock.now_ms(),
                ));
            }
            let connection = match self.queue.sync_connection() {
                Ok(Some(connection)) => connection,
                Ok(None) => return Err(SyncCycleOutcome::settled(SyncStatus::LocalOnly)),
                Err(error) => return Err(self.storage_failure(&error)),
            };
            match self.pull_page(&connection)? {
                PullPage::Drained => return Ok(false),
                PullPage::Applied => {}
            }
            pages += 1;
            if pages >= self.config.max_pull_pages_per_cycle {
                return Ok(true);
            }
        }
    }

    fn pull_page(&mut self, connection: &SyncConnection) -> Result<PullPage, SyncCycleOutcome> {
        let cursor = connection.observed_server_sequence;
        let limit = self.state.pull_batch_limit(self.config);
        let response =
            self.transport
                .pull(&connection.workspace_id, cursor, limit, self.cancellation);
        let mut response = match response {
            Ok(response) => response,
            Err(TransportError::LogTruncated) => return Err(self.log_truncated()),
            Err(error) => return Err(self.pull_failure(&error)),
        };
        if let Err(error) = resolve_chunked_operations(
            self.transport,
            &connection.workspace_id,
            &mut response,
            self.cancellation,
        )
        .and_then(|_| {
            resolve_asset_content(
                self.transport,
                self.assets,
                &connection.workspace_id,
                &response,
                self.cancellation,
            )
        }) {
            return Err(self.pull_failure(&error));
        }
        if let Some(detail) = malformed_page(&response, cursor, limit) {
            return Err(self.rejected_pull(&detail));
        }
        if response.operations.is_empty() {
            return Ok(PullPage::Drained);
        }
        for operations in response.operations.chunks(PULL_APPLY_SUB_BATCH_OPERATIONS) {
            self.apply_sub_batch(operations)?;
        }
        self.state.restore_pull_batch_limit();
        let advanced = match self.queue.sync_connection() {
            Ok(Some(connection)) => connection.observed_server_sequence,
            Ok(None) => return Err(SyncCycleOutcome::settled(SyncStatus::LocalOnly)),
            Err(error) => return Err(self.storage_failure(&error)),
        };
        if advanced <= cursor {
            return Err(self.rejected_pull(&format!(
                "pull page after sequence {cursor} did not advance the cursor"
            )));
        }
        if advanced >= response.latest_server_sequence {
            return Ok(PullPage::Drained);
        }
        Ok(PullPage::Applied)
    }

    fn apply_sub_batch(
        &mut self,
        operations: &[ReplicatedWorkspaceOperation],
    ) -> Result<(), SyncCycleOutcome> {
        match self
            .queue
            .apply_remote_operations(operations, self.clock.now_ms())
        {
            Ok(outcomes) => {
                for (operation, outcome) in operations.iter().zip(outcomes.iter()) {
                    if matches!(
                        outcome,
                        RemoteSyncApplyOutcome::Applied(_)
                            | RemoteSyncApplyOutcome::Superseded { .. }
                    ) && let Some(envelope) = operation.payload.inline_operation()
                    {
                        self.changes.record(&envelope.operation);
                    }
                }
                self.state.backoff.reset();
                Ok(())
            }
            Err(StorageError::Busy(_)) => Err(self.busy_retry()),
            Err(error @ StorageError::Backend(_)) => Err(self.storage_failure(&error)),
            Err(error) => Err(self.rejected_pull(&error.to_string())),
        }
    }

    fn log_truncated(&mut self) -> SyncCycleOutcome {
        let now = self.clock.now_ms();
        match self.queue.next_sync_attempt_at() {
            Ok(None) => {
                self.state.rehydration_requested = true;
                SyncCycleOutcome::retry(SyncStatus::Rehydrating, now)
            }
            Ok(Some(_)) => {
                let retry_at = now.saturating_add(self.config.blocked_retry_delay_ms);
                SyncCycleOutcome::retry(
                    SyncStatus::blocked(
                        BLOCKED_REASON_LOG_TRUNCATED,
                        "the cloud compacted operations this device has not received while local changes are still waiting to upload",
                    ),
                    retry_at,
                )
            }
            Err(error) => self.storage_failure(&error),
        }
    }

    fn pull_failure(&mut self, error: &TransportError) -> SyncCycleOutcome {
        let now = self.clock.now_ms();
        match error {
            TransportError::Cancelled => SyncCycleOutcome::retry(SyncStatus::Pending, now),
            TransportError::AuthenticationRequired => {
                SyncCycleOutcome::settled(SyncStatus::AuthenticationRequired)
            }
            TransportError::LogTruncated => self.log_truncated(),
            TransportError::AuthorizationDenied
            | TransportError::Validation(_)
            | TransportError::Conflict(_)
            | TransportError::UnsupportedProtocol(_) => {
                let retry_at = now.saturating_add(self.config.blocked_retry_delay_ms);
                let reason = match error {
                    TransportError::AuthorizationDenied => BLOCKED_REASON_AUTHORIZATION_DENIED,
                    TransportError::UnsupportedProtocol(_) => BLOCKED_REASON_PROTOCOL_MISMATCH,
                    _ => BLOCKED_REASON_REJECTED_BATCH,
                };
                SyncCycleOutcome::retry(SyncStatus::blocked(reason, error.to_string()), retry_at)
            }
            TransportError::ResponseTooLarge => {
                self.state.shrink_pull_batch_limit(self.config);
                self.transient_retry(error)
            }
            TransportError::RateLimited { .. }
            | TransportError::Transient(_)
            | TransportError::Server { .. } => self.transient_retry(error),
        }
    }

    fn transient_retry(&mut self, error: &TransportError) -> SyncCycleOutcome {
        let retry_at = self
            .clock
            .now_ms()
            .saturating_add(self.state.backoff.next_delay_ms(error.retry_hint_ms()));
        SyncCycleOutcome::retry(
            SyncStatus::Retrying {
                next_attempt_at: retry_at,
            },
            retry_at,
        )
    }

    fn busy_retry(&mut self) -> SyncCycleOutcome {
        let retry_at = self
            .clock
            .now_ms()
            .saturating_add(self.state.backoff.next_delay_ms(None));
        SyncCycleOutcome::retry(
            SyncStatus::Retrying {
                next_attempt_at: retry_at,
            },
            retry_at,
        )
    }

    fn rejected_pull(&self, detail: &str) -> SyncCycleOutcome {
        let retry_at = self
            .clock
            .now_ms()
            .saturating_add(self.config.blocked_retry_delay_ms);
        SyncCycleOutcome::retry(
            SyncStatus::blocked(BLOCKED_REASON_REJECTED_PULL, detail),
            retry_at,
        )
    }

    fn acknowledge_failure(&mut self, error: &TransportError) -> SyncCycleOutcome {
        let now = self.clock.now_ms();
        match error {
            TransportError::Cancelled => SyncCycleOutcome::retry(SyncStatus::Pending, now),
            TransportError::AuthenticationRequired => {
                SyncCycleOutcome::settled(SyncStatus::AuthenticationRequired)
            }
            TransportError::AuthorizationDenied
            | TransportError::Validation(_)
            | TransportError::Conflict(_)
            | TransportError::UnsupportedProtocol(_)
            | TransportError::LogTruncated => {
                let retry_at = now.saturating_add(self.config.blocked_retry_delay_ms);
                SyncCycleOutcome::retry(
                    SyncStatus::blocked(BLOCKED_REASON_REJECTED_ACKNOWLEDGEMENT, error.to_string()),
                    retry_at,
                )
            }
            TransportError::RateLimited { .. }
            | TransportError::Transient(_)
            | TransportError::Server { .. }
            | TransportError::ResponseTooLarge => self.transient_retry(error),
        }
    }

    fn settle(&mut self) -> SyncCycleOutcome {
        match self.queue.has_pending_sync_operations() {
            Ok(false) => {
                self.state.backoff.reset();
                SyncCycleOutcome::settled(SyncStatus::UpToDate)
            }
            Ok(true) => match self.queue.next_sync_attempt_at() {
                Ok(Some(next_attempt_at)) => {
                    let next_attempt_at = next_attempt_at.max(self.clock.now_ms());
                    SyncCycleOutcome::retry(
                        SyncStatus::Retrying { next_attempt_at },
                        next_attempt_at,
                    )
                }
                Ok(None) => self.parked_status(),
                Err(error) => self.storage_failure(&error),
            },
            Err(error) => self.storage_failure(&error),
        }
    }

    fn parked_status(&mut self) -> SyncCycleOutcome {
        match self.queue.blocked_sync_operations() {
            Ok(blocked) if blocked.is_empty() => {
                SyncCycleOutcome::retry(SyncStatus::Pending, self.clock.now_ms())
            }
            Ok(blocked) => {
                let shared_reason = blocked
                    .iter()
                    .all(|row| row.reason_code == blocked[0].reason_code)
                    .then(|| blocked[0].reason_code.clone());
                let reason =
                    shared_reason.unwrap_or_else(|| BLOCKED_REASON_BLOCKED_OPERATIONS.to_string());
                let detail = format!(
                    "{} local change(s) could not be uploaded and wait in the sync recovery list",
                    blocked.len()
                );
                SyncCycleOutcome::settled(SyncStatus::blocked(&reason, detail))
            }
            Err(error) => self.storage_failure(&error),
        }
    }

    fn storage_failure(&mut self, error: &StorageError) -> SyncCycleOutcome {
        storage_failure(self.clock, &mut self.state.backoff, self.config, error)
    }
}

fn is_hydration_candidate(connection: &SyncConnection) -> bool {
    connection.observed_server_sequence == 0 && connection.next_client_sequence == 1
}

fn malformed_page(response: &SyncPullResponse, cursor: u64, limit: usize) -> Option<String> {
    if let Err(error) = response.validate() {
        return Some(format!("pull response failed validation: {error}"));
    }
    if response.operations.len() > limit {
        return Some(format!(
            "pull response carried {} operations for a page limit of {limit}",
            response.operations.len()
        ));
    }
    if response.operations.is_empty() && response.latest_server_sequence > cursor {
        return Some(format!(
            "pull response was empty although the log extends to {} past cursor {cursor}",
            response.latest_server_sequence
        ));
    }
    None
}

/// A failing local database is never a reason to lose or retry work
/// blindly: a busy or locked database is retried shortly; anything else is
/// surfaced as a visible block with the bounded backend message.
pub fn storage_failure(
    clock: &dyn SyncClock,
    backoff: &mut SyncBackoff,
    config: &SyncCycleConfig,
    error: &StorageError,
) -> SyncCycleOutcome {
    if matches!(error, StorageError::Busy(_)) {
        let retry_at = clock.now_ms().saturating_add(backoff.next_delay_ms(None));
        return SyncCycleOutcome::retry(
            SyncStatus::Retrying {
                next_attempt_at: retry_at,
            },
            retry_at,
        );
    }
    let retry_at = clock.now_ms().saturating_add(config.blocked_retry_delay_ms);
    SyncCycleOutcome::retry(
        SyncStatus::blocked(BLOCKED_REASON_STORAGE_FAILURE, error.to_string()),
        retry_at,
    )
}

pub(crate) fn bounded_detail(detail: &str) -> String {
    if detail.chars().count() <= MAX_BLOCKED_DETAIL_CHARS {
        return detail.to_string();
    }
    detail.chars().take(MAX_BLOCKED_DETAIL_CHARS).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn change_set_separates_documents_from_structure_and_saturates() {
        let mut changes = RemoteChangeSet::default();
        assert!(changes.is_empty());
        changes.record(&WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: serde_json::json!({"type": "doc", "content": []}),
            markdown: "body".into(),
            word_count: 1,
            expected_revision: 1,
            at: 1,
        });
        assert_eq!(changes.note_ids, ["note-1"]);
        assert!(!changes.structure_changed);
        changes.record(&WorkspaceOperation::RenameNode {
            id: "note-1".into(),
            title: "Renamed".into(),
            at: 2,
        });
        assert!(changes.structure_changed);
        assert!(!changes.full);
        for index in 0..=FULL_CHANGE_NOTE_THRESHOLD {
            changes.record_note(&format!("note-{index}"));
        }
        assert!(changes.full);
        assert!(changes.note_ids.is_empty());
    }

    #[test]
    fn blocked_detail_is_bounded() {
        let long = "x".repeat(MAX_BLOCKED_DETAIL_CHARS + 50);
        let SyncStatus::Blocked { detail, .. } = SyncStatus::blocked("reason", &long) else {
            panic!("expected a blocked status");
        };
        assert_eq!(
            detail.map(|detail| detail.len()),
            Some(MAX_BLOCKED_DETAIL_CHARS)
        );
    }

    #[test]
    fn status_serializes_with_camel_case_tags() {
        let json = serde_json::to_value(SyncStatus::blocked("rejected_pull", "gap")).unwrap();
        assert_eq!(json["state"], "blocked");
        assert_eq!(json["reason"], "rejected_pull");
        assert_eq!(json["detail"], "gap");
        let json = serde_json::to_value(SyncStatus::Rehydrating).unwrap();
        assert_eq!(json["state"], "rehydrating");
        let json = serde_json::to_value(SyncStatus::Retrying { next_attempt_at: 5 }).unwrap();
        assert_eq!(json["nextAttemptAt"], 5);
    }

    #[test]
    fn identical_rejections_count_and_different_ones_restart() {
        let mut state = SyncCycleState::new(SyncBackoffConfig::default());
        let ids = vec!["op-1".to_string()];
        assert_eq!(state.record_rejection(&ids, "bad"), 1);
        assert_eq!(state.record_rejection(&ids, "bad"), 2);
        assert_eq!(state.record_rejection(&ids, "worse"), 1);
        assert_eq!(state.record_rejection(&ids, "worse"), 2);
        assert_eq!(state.record_rejection(&ids, "worse"), 3);
    }

    #[test]
    fn pull_limit_halves_to_one_and_restores() {
        let config = SyncCycleConfig {
            pull_batch_limit: 5,
            ..SyncCycleConfig::default()
        };
        let mut state = SyncCycleState::new(SyncBackoffConfig::default());
        assert_eq!(state.pull_batch_limit(&config), 5);
        state.shrink_pull_batch_limit(&config);
        assert_eq!(state.pull_batch_limit(&config), 2);
        state.shrink_pull_batch_limit(&config);
        assert_eq!(state.pull_batch_limit(&config), 1);
        state.shrink_pull_batch_limit(&config);
        assert_eq!(state.pull_batch_limit(&config), 1);
        state.restore_pull_batch_limit();
        assert_eq!(state.pull_batch_limit(&config), 5);
    }
}
