use skriuw_domain::{MAX_SYNC_BATCH_OPERATIONS, WorkspaceCheckpoint};
use skriuw_storage::{StorageError, SyncConnection, WorkspaceMaintenance, WorkspaceSyncQueue};

use crate::{
    backoff::SyncBackoff,
    content::{download_content, upload_missing_chunks},
    cycle::{
        BLOCKED_REASON_AUTHORIZATION_DENIED, BLOCKED_REASON_LOG_TRUNCATED,
        BLOCKED_REASON_LOG_TRUNCATED_WITHOUT_CHECKPOINT, BLOCKED_REASON_REJECTED_CHECKPOINT,
        SyncCycleConfig, SyncCycleOutcome, SyncStatus, storage_failure,
    },
    transport::{SyncCancellation, SyncClock, SyncTransport, TransportError},
};

/// Deterministic checkpoint publication policy: publish once the ordered log
/// has advanced at least `publish_interval_operations` past the latest known
/// checkpoint, or immediately when the workspace has no checkpoint at all.
/// Both inputs are durable server sequences, so the decision is reproducible
/// under the fake clock and independent of wall time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckpointPublicationConfig {
    pub publish_interval_operations: u64,
}

impl Default for CheckpointPublicationConfig {
    fn default() -> Self {
        Self {
            publish_interval_operations: MAX_SYNC_BATCH_OPERATIONS as u64,
        }
    }
}

/// Per-process memory of the latest checkpoint sequence the server is known
/// to hold. `None` means it has not been fetched yet; `Some(0)` means the
/// server reported no checkpoint. The server record stays the single durable
/// source of truth and is re-fetched after every restart.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CheckpointPublicationState {
    latest_known_sequence: Option<u64>,
}

impl CheckpointPublicationState {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
}

/// Hydrate a freshly connected device from the latest published checkpoint so
/// it replays only the ordered tail. Callers gate this on a zero cursor and an
/// empty outbox; the durable `hydrate_from_checkpoint` port re-checks both, so
/// a race with a local commit skips hydration instead of discarding work.
pub(crate) fn hydrate_from_latest_checkpoint(
    queue: &dyn WorkspaceSyncQueue,
    transport: &dyn SyncTransport,
    clock: &dyn SyncClock,
    cancellation: &SyncCancellation,
    backoff: &mut SyncBackoff,
    config: &SyncCycleConfig,
    connection: &SyncConnection,
) -> Result<bool, SyncCycleOutcome> {
    if cancellation.is_cancelled() {
        return Err(SyncCycleOutcome::retry(SyncStatus::Pending, clock.now_ms()));
    }
    let checkpoint = transport
        .latest_checkpoint(&connection.workspace_id, cancellation)
        .map_err(|error| checkpoint_failure(clock, backoff, config, &error))?;
    let Some(checkpoint) = checkpoint else {
        return Ok(false);
    };
    let archive = fetch_verified_archive(
        transport,
        clock,
        cancellation,
        backoff,
        config,
        connection,
        &checkpoint,
    )?;
    match queue.hydrate_from_checkpoint(&archive, checkpoint.server_sequence) {
        Ok(_) => {
            backoff.reset();
            Ok(true)
        }
        Err(StorageError::InvalidOperation(_)) => Ok(false),
        Err(error) => Err(storage_failure(clock, backoff, config, &error)),
    }
}

/// Rebuild an already-connected device whose cursor fell below the server's
/// compaction floor. The push phase has already drained the outbox, so the
/// durable port only has to refuse the race with a local commit; a workspace
/// without any checkpoint cannot recover and stays visibly blocked.
pub(crate) fn rehydrate_from_latest_checkpoint(
    queue: &dyn WorkspaceSyncQueue,
    transport: &dyn SyncTransport,
    clock: &dyn SyncClock,
    cancellation: &SyncCancellation,
    backoff: &mut SyncBackoff,
    config: &SyncCycleConfig,
    connection: &SyncConnection,
) -> Result<(), SyncCycleOutcome> {
    if cancellation.is_cancelled() {
        return Err(SyncCycleOutcome::retry(SyncStatus::Pending, clock.now_ms()));
    }
    let checkpoint = transport
        .latest_checkpoint(&connection.workspace_id, cancellation)
        .map_err(|error| checkpoint_failure(clock, backoff, config, &error))?;
    let Some(checkpoint) = checkpoint else {
        return Err(blocked(
            clock,
            config,
            BLOCKED_REASON_LOG_TRUNCATED_WITHOUT_CHECKPOINT,
            "the cloud compacted operations this device has not received and holds no checkpoint to rebuild from",
        ));
    };
    let archive = fetch_verified_archive(
        transport,
        clock,
        cancellation,
        backoff,
        config,
        connection,
        &checkpoint,
    )?;
    match queue.rehydrate_from_checkpoint(&archive, checkpoint.server_sequence) {
        Ok(_) => {
            backoff.reset();
            Ok(())
        }
        Err(StorageError::InvalidOperation(detail)) => Err(blocked(
            clock,
            config,
            BLOCKED_REASON_LOG_TRUNCATED,
            &detail,
        )),
        Err(error) => Err(storage_failure(clock, backoff, config, &error)),
    }
}

fn fetch_verified_archive(
    transport: &dyn SyncTransport,
    clock: &dyn SyncClock,
    cancellation: &SyncCancellation,
    backoff: &mut SyncBackoff,
    config: &SyncCycleConfig,
    connection: &SyncConnection,
    checkpoint: &WorkspaceCheckpoint,
) -> Result<skriuw_domain::WorkspaceArchive, SyncCycleOutcome> {
    if checkpoint.workspace_id != connection.workspace_id {
        return Err(rejected(
            clock,
            config,
            "the latest checkpoint names another workspace",
        ));
    }
    if checkpoint.server_sequence == 0 {
        return Err(rejected(
            clock,
            config,
            "the latest checkpoint has no server sequence",
        ));
    }
    let bytes = download_content(
        transport,
        &connection.workspace_id,
        &checkpoint.content,
        cancellation,
    )
    .map_err(|error| checkpoint_failure(clock, backoff, config, &error))?;
    checkpoint
        .verify_content(&bytes)
        .map_err(|error| rejected(clock, config, &error.to_string()))
}

/// Borrowed capabilities and configuration for one publication attempt; the
/// mutable backoff and policy state stay separate so the coordinator owns
/// them across cycles.
pub struct CheckpointPublication<'a> {
    pub queue: &'a dyn WorkspaceSyncQueue,
    pub workspace: &'a dyn WorkspaceMaintenance,
    pub transport: &'a dyn SyncTransport,
    pub clock: &'a dyn SyncClock,
    pub cancellation: &'a SyncCancellation,
    pub cycle_config: &'a SyncCycleConfig,
    pub config: &'a CheckpointPublicationConfig,
}

/// Publish a checkpoint of the converged local workspace when the publication
/// policy says one is due. Returns `None` when the workspace is up to date
/// with the policy (nothing was due, a local commit raced the export, or a
/// checkpoint was published); returns a failure outcome so publication
/// problems surface through the normal status projection without disturbing
/// later push/pull cycles.
pub fn run_checkpoint_publication(
    publication: &CheckpointPublication<'_>,
    backoff: &mut SyncBackoff,
    state: &mut CheckpointPublicationState,
) -> Option<SyncCycleOutcome> {
    let CheckpointPublication {
        queue,
        workspace,
        transport,
        clock,
        cancellation,
        cycle_config,
        config,
    } = *publication;
    if cancellation.is_cancelled() {
        return None;
    }
    let connection = match queue.sync_connection() {
        Ok(Some(connection)) => connection,
        Ok(None) => return None,
        Err(error) => return Some(storage_failure(clock, backoff, cycle_config, &error)),
    };
    let cursor = connection.observed_server_sequence;
    if cursor == 0 {
        return None;
    }

    if state.latest_known_sequence.is_none() {
        match transport.latest_checkpoint(&connection.workspace_id, cancellation) {
            Ok(checkpoint) => {
                state.latest_known_sequence =
                    Some(checkpoint.map_or(0, |checkpoint| checkpoint.server_sequence));
            }
            Err(error) => {
                return Some(checkpoint_failure(clock, backoff, cycle_config, &error));
            }
        }
    }
    let known = state
        .latest_known_sequence
        .expect("checkpoint sequence was just fetched");
    let due = known == 0 || cursor >= known.saturating_add(config.publish_interval_operations);
    if !due {
        return None;
    }

    let archive = match workspace.export_archive(clock.now_ms().max(1)) {
        Ok(archive) => archive,
        Err(error) => return Some(storage_failure(clock, backoff, cycle_config, &error)),
    };
    match queue.has_pending_sync_operations() {
        Ok(false) => {}
        Ok(true) => return None,
        Err(error) => return Some(storage_failure(clock, backoff, cycle_config, &error)),
    }

    let (checkpoint, bytes) = match WorkspaceCheckpoint::build(
        connection.workspace_id.clone(),
        cursor,
        clock.now_ms().max(0),
        &archive,
    ) {
        Ok(built) => built,
        Err(error) => return Some(rejected(clock, cycle_config, &error.to_string())),
    };
    if let Err(error) = upload_missing_chunks(
        transport,
        &connection.workspace_id,
        &checkpoint.content,
        &bytes,
        cancellation,
    ) {
        return Some(checkpoint_failure(clock, backoff, cycle_config, &error));
    }
    if let Err(error) =
        transport.publish_checkpoint(&connection.workspace_id, &checkpoint, cancellation)
    {
        return Some(checkpoint_failure(clock, backoff, cycle_config, &error));
    }
    state.latest_known_sequence = Some(cursor);
    backoff.reset();
    None
}

fn rejected(clock: &dyn SyncClock, config: &SyncCycleConfig, detail: &str) -> SyncCycleOutcome {
    blocked(clock, config, BLOCKED_REASON_REJECTED_CHECKPOINT, detail)
}

fn blocked(
    clock: &dyn SyncClock,
    config: &SyncCycleConfig,
    reason: &str,
    detail: &str,
) -> SyncCycleOutcome {
    let retry_at = clock.now_ms().saturating_add(config.blocked_retry_delay_ms);
    SyncCycleOutcome::retry(SyncStatus::blocked(reason, detail), retry_at)
}

fn checkpoint_failure(
    clock: &dyn SyncClock,
    backoff: &mut SyncBackoff,
    config: &SyncCycleConfig,
    error: &TransportError,
) -> SyncCycleOutcome {
    let now = clock.now_ms();
    match error {
        TransportError::Cancelled => SyncCycleOutcome::retry(SyncStatus::Pending, now),
        TransportError::AuthenticationRequired => {
            SyncCycleOutcome::settled(SyncStatus::AuthenticationRequired)
        }
        TransportError::AuthorizationDenied => blocked(
            clock,
            config,
            BLOCKED_REASON_AUTHORIZATION_DENIED,
            &error.to_string(),
        ),
        TransportError::Validation(_)
        | TransportError::Conflict(_)
        | TransportError::UnsupportedProtocol(_)
        | TransportError::LogTruncated => rejected(clock, config, &error.to_string()),
        TransportError::RateLimited { .. }
        | TransportError::Transient(_)
        | TransportError::Server { .. }
        | TransportError::ResponseTooLarge => {
            let retry_at = now.saturating_add(backoff.next_delay_ms(error.retry_hint_ms()));
            SyncCycleOutcome::retry(
                SyncStatus::Retrying {
                    next_attempt_at: retry_at,
                },
                retry_at,
            )
        }
    }
}
