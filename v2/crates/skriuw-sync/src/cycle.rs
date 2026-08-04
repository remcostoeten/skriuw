use serde::Serialize;
use skriuw_domain::{
    MAX_SYNC_BATCH_OPERATIONS, MAX_SYNC_PULL_OPERATIONS, WORKSPACE_SYNC_PROTOCOL_VERSION,
};
use skriuw_storage::{
    Diagnostic, DiagnosticCategory, DiagnosticContext, StorageError, WorkspaceSyncQueue,
};

use crate::{
    backoff::SyncBackoff,
    transport::{SyncCancellation, SyncClock, SyncTransport, TransportError},
};

pub const BLOCKED_REASON_AUTHORIZATION_DENIED: &str = "authorization_denied";
pub const BLOCKED_REASON_REJECTED_BATCH: &str = "rejected_batch";
pub const BLOCKED_REASON_PUSH_CONFLICT: &str = "push_conflict";
pub const BLOCKED_REASON_PROTOCOL_MISMATCH: &str = "protocol_mismatch";
pub const BLOCKED_REASON_REJECTED_ACKNOWLEDGEMENT: &str = "rejected_acknowledgement";
pub const BLOCKED_REASON_STORAGE_FAILURE: &str = "storage_failure";

/// Narrow status projection consumed by the runtime and UI. The UI may render
/// this and request connect, disconnect, retry, or refresh; retry and cursor
/// logic stay inside the coordinator.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SyncStatus {
    LocalOnly,
    Connecting,
    UpToDate,
    Pending,
    Offline,
    AuthenticationRequired,
    Conflict { open_conflicts: usize },
    Retrying { next_attempt_at: i64 },
    Blocked { reason: String },
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
pub struct SyncCycleOutcome {
    pub status: SyncStatus,
    pub retry_at_ms: Option<i64>,
}

impl SyncCycleOutcome {
    fn settled(status: SyncStatus) -> Self {
        Self {
            status,
            retry_at_ms: None,
        }
    }

    fn retry(status: SyncStatus, retry_at_ms: i64) -> Self {
        Self {
            status,
            retry_at_ms: Some(retry_at_ms),
        }
    }
}

/// One deterministic push-then-pull pass over the durable queue. Every
/// SQLite transaction is committed before a network call starts and every
/// network result is written back through the `WorkspaceSyncQueue` port, so
/// interrupting the process at any point leaves resumable durable state.
pub fn run_sync_cycle(
    queue: &dyn WorkspaceSyncQueue,
    transport: &dyn SyncTransport,
    clock: &dyn SyncClock,
    cancellation: &SyncCancellation,
    backoff: &mut SyncBackoff,
    config: &SyncCycleConfig,
) -> SyncCycleOutcome {
    match queue.sync_connection() {
        Ok(Some(_)) => {}
        Ok(None) => return SyncCycleOutcome::settled(SyncStatus::LocalOnly),
        Err(error) => return storage_failure(clock, config, &error),
    }

    let mut pushed_batches = 0;
    let mut more_pending = false;
    while pushed_batches < config.max_push_batches_per_cycle {
        if cancellation.is_cancelled() {
            return SyncCycleOutcome::retry(SyncStatus::Pending, clock.now_ms());
        }
        let claim = queue.claim_sync_operations(
            &config.worker_id,
            clock.now_ms(),
            config.lease_ms,
            config.push_batch_limit,
        );
        let batch = match claim {
            Ok(Some(batch)) => batch,
            Ok(None) => break,
            Err(error) => return storage_failure(clock, config, &error),
        };
        let operation_ids = batch
            .request
            .operations
            .iter()
            .map(|operation| operation.operation_id.clone())
            .collect::<Vec<_>>();
        let result = if cancellation.is_cancelled() {
            Err(TransportError::Cancelled)
        } else {
            transport.push(&batch.workspace_id, &batch.request, cancellation)
        };
        match result {
            Ok(response) if response.sync_protocol_version != WORKSPACE_SYNC_PROTOCOL_VERSION => {
                return push_failure(
                    queue,
                    clock,
                    backoff,
                    config,
                    &operation_ids,
                    &TransportError::UnsupportedProtocol(response.sync_protocol_version),
                );
            }
            Ok(response) => {
                match queue.acknowledge_sync_operations(&config.worker_id, &response.accepted) {
                    Ok(()) => {
                        backoff.reset();
                        pushed_batches += 1;
                        if pushed_batches == config.max_push_batches_per_cycle {
                            more_pending = true;
                        }
                    }
                    Err(error) => {
                        let retry_at = clock.now_ms().saturating_add(config.blocked_retry_delay_ms);
                        release_claim(
                            queue,
                            config,
                            &operation_ids,
                            retry_at,
                            DiagnosticCategory::InvalidInput,
                            &format!("sync acknowledgement rejected: {error}"),
                        );
                        return SyncCycleOutcome::retry(
                            SyncStatus::Blocked {
                                reason: BLOCKED_REASON_REJECTED_ACKNOWLEDGEMENT.into(),
                            },
                            retry_at,
                        );
                    }
                }
            }
            Err(error) => {
                return push_failure(queue, clock, backoff, config, &operation_ids, &error);
            }
        }
    }

    let mut pages = 0;
    loop {
        if cancellation.is_cancelled() {
            return SyncCycleOutcome::retry(SyncStatus::Pending, clock.now_ms());
        }
        let connection = match queue.sync_connection() {
            Ok(Some(connection)) => connection,
            Ok(None) => return SyncCycleOutcome::settled(SyncStatus::LocalOnly),
            Err(error) => return storage_failure(clock, config, &error),
        };
        let cursor = connection.observed_server_sequence;
        let response = transport.pull(
            &connection.workspace_id,
            cursor,
            config.pull_batch_limit,
            cancellation,
        );
        let response = match response {
            Ok(response) => response,
            Err(error) => return pull_failure(clock, backoff, config, &error),
        };
        let malformed = response.validate().is_err()
            || response.operations.len() > config.pull_batch_limit
            || (response.operations.is_empty() && response.latest_server_sequence > cursor);
        if malformed {
            let retry_at = clock.now_ms().saturating_add(backoff.next_delay_ms(None));
            return SyncCycleOutcome::retry(
                SyncStatus::Retrying {
                    next_attempt_at: retry_at,
                },
                retry_at,
            );
        }
        if response.operations.is_empty() {
            break;
        }
        match queue.apply_remote_operations(&response.operations, clock.now_ms()) {
            Ok(_) => backoff.reset(),
            Err(StorageError::Backend(message)) => {
                return storage_failure(clock, config, &StorageError::Backend(message));
            }
            Err(_) => {
                let retry_at = clock.now_ms().saturating_add(backoff.next_delay_ms(None));
                return SyncCycleOutcome::retry(
                    SyncStatus::Retrying {
                        next_attempt_at: retry_at,
                    },
                    retry_at,
                );
            }
        }
        let advanced = match queue.sync_connection() {
            Ok(Some(connection)) => connection.observed_server_sequence,
            Ok(None) => return SyncCycleOutcome::settled(SyncStatus::LocalOnly),
            Err(error) => return storage_failure(clock, config, &error),
        };
        if advanced <= cursor {
            let retry_at = clock.now_ms().saturating_add(backoff.next_delay_ms(None));
            return SyncCycleOutcome::retry(
                SyncStatus::Retrying {
                    next_attempt_at: retry_at,
                },
                retry_at,
            );
        }
        if advanced >= response.latest_server_sequence {
            break;
        }
        pages += 1;
        if pages >= config.max_pull_pages_per_cycle {
            more_pending = true;
            break;
        }
    }

    if more_pending {
        return SyncCycleOutcome::retry(SyncStatus::Pending, clock.now_ms());
    }
    match queue.sync_conflicts() {
        Ok(conflicts) if conflicts.is_empty() => SyncCycleOutcome::settled(SyncStatus::UpToDate),
        Ok(conflicts) => SyncCycleOutcome::settled(SyncStatus::Conflict {
            open_conflicts: conflicts.len(),
        }),
        Err(error) => storage_failure(clock, config, &error),
    }
}

fn push_failure(
    queue: &dyn WorkspaceSyncQueue,
    clock: &dyn SyncClock,
    backoff: &mut SyncBackoff,
    config: &SyncCycleConfig,
    operation_ids: &[String],
    error: &TransportError,
) -> SyncCycleOutcome {
    let now = clock.now_ms();
    match error {
        TransportError::Cancelled => {
            release_claim(
                queue,
                config,
                operation_ids,
                now,
                DiagnosticCategory::Unavailable,
                "sync push was cancelled",
            );
            SyncCycleOutcome::retry(SyncStatus::Pending, now)
        }
        TransportError::AuthenticationRequired => {
            release_claim(
                queue,
                config,
                operation_ids,
                now,
                DiagnosticCategory::Unavailable,
                "sync session expired during push",
            );
            SyncCycleOutcome::settled(SyncStatus::AuthenticationRequired)
        }
        TransportError::AuthorizationDenied
        | TransportError::Validation(_)
        | TransportError::Conflict(_)
        | TransportError::UnsupportedProtocol(_) => {
            let retry_at = now.saturating_add(config.blocked_retry_delay_ms);
            release_claim(
                queue,
                config,
                operation_ids,
                retry_at,
                DiagnosticCategory::InvalidInput,
                &error.to_string(),
            );
            let reason = match error {
                TransportError::AuthorizationDenied => BLOCKED_REASON_AUTHORIZATION_DENIED,
                TransportError::Conflict(_) => BLOCKED_REASON_PUSH_CONFLICT,
                TransportError::UnsupportedProtocol(_) => BLOCKED_REASON_PROTOCOL_MISMATCH,
                _ => BLOCKED_REASON_REJECTED_BATCH,
            };
            SyncCycleOutcome::retry(
                SyncStatus::Blocked {
                    reason: reason.into(),
                },
                retry_at,
            )
        }
        TransportError::RateLimited { .. }
        | TransportError::Transient(_)
        | TransportError::Server { .. } => {
            let retry_at = now.saturating_add(backoff.next_delay_ms(error.retry_hint_ms()));
            release_claim(
                queue,
                config,
                operation_ids,
                retry_at,
                DiagnosticCategory::Unavailable,
                &error.to_string(),
            );
            SyncCycleOutcome::retry(
                SyncStatus::Retrying {
                    next_attempt_at: retry_at,
                },
                retry_at,
            )
        }
    }
}

fn pull_failure(
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
        TransportError::AuthorizationDenied
        | TransportError::Validation(_)
        | TransportError::Conflict(_)
        | TransportError::UnsupportedProtocol(_) => {
            let retry_at = now.saturating_add(config.blocked_retry_delay_ms);
            let reason = match error {
                TransportError::AuthorizationDenied => BLOCKED_REASON_AUTHORIZATION_DENIED,
                TransportError::UnsupportedProtocol(_) => BLOCKED_REASON_PROTOCOL_MISMATCH,
                _ => BLOCKED_REASON_REJECTED_BATCH,
            };
            SyncCycleOutcome::retry(
                SyncStatus::Blocked {
                    reason: reason.into(),
                },
                retry_at,
            )
        }
        TransportError::RateLimited { .. }
        | TransportError::Transient(_)
        | TransportError::Server { .. } => {
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

fn release_claim(
    queue: &dyn WorkspaceSyncQueue,
    config: &SyncCycleConfig,
    operation_ids: &[String],
    retry_at_ms: i64,
    category: DiagnosticCategory,
    message: &str,
) {
    if operation_ids.is_empty() {
        return;
    }
    let diagnostic = Diagnostic::new(DiagnosticContext::Sync, category, message);
    let _ = queue.release_sync_operations(
        &config.worker_id,
        operation_ids,
        retry_at_ms.max(0),
        &diagnostic,
    );
}

fn storage_failure(
    clock: &dyn SyncClock,
    config: &SyncCycleConfig,
    _error: &StorageError,
) -> SyncCycleOutcome {
    let retry_at = clock.now_ms().saturating_add(config.blocked_retry_delay_ms);
    SyncCycleOutcome::retry(
        SyncStatus::Blocked {
            reason: BLOCKED_REASON_STORAGE_FAILURE.into(),
        },
        retry_at,
    )
}
