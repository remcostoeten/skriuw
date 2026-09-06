use std::collections::BTreeMap;

use rusqlite::{OptionalExtension, Transaction, TransactionBehavior, params};
use skriuw_domain::{
    AnnotationStatus, BlockedSyncOperationView, ClientSyncOperation, DiscardedSyncOperationView,
    NodeKind, NodePlacement, NodePosition, OperationAck, RemoteOperationDecision,
    RemoteTargetState, ReplicatedWorkspaceOperation, SYNC_RECOVERY_VIEW_VERSION,
    SyncConflictReason, SyncOperationPayload, SyncRecoveryView, SyncReplicationClass,
    SyncValidationError, WORKSPACE_SYNC_PROTOCOL_VERSION, WorkspaceAnnotation, WorkspaceArchive,
    WorkspaceOperation, WorkspaceOperationEnvelope, classify_apply_failure,
    reconcile_remote_operation, validate_sync_identifier, validate_sync_sequence,
};
use skriuw_storage::{
    BlockedSyncOperation, Diagnostic, DiagnosticContext, HistoryProvenance, ImportSummary,
    NewSyncConnection, PendingSyncBatch, RemoteSyncApplyOutcome, StorageError, SyncConnection,
    SyncRecovery, SyncTombstone, WorkspaceSyncQueue,
};
use uuid::Uuid;

use crate::error::{backend, json_backend};
use crate::operations::{
    apply_operations_in_transaction, count_words, node_is_available, preserve_document_version,
    require_worker,
};
use crate::queries::read_snapshot;
use crate::{SqliteWorkspace, replace_workspace_in_transaction};

struct OutboxRow {
    operation_id: String,
    client_sequence: u64,
    base_server_sequence: u64,
    operation: WorkspaceOperationEnvelope,
    claimed_at: Option<i64>,
    next_attempt_at: i64,
}

struct ReceivedOperationRow {
    device_id: String,
    client_sequence: u64,
    base_server_sequence: u64,
    server_sequence: u64,
    operation_json: String,
    outcome: String,
}

pub(crate) fn enqueue_sync_operations(
    transaction: &Transaction<'_>,
    operations: &[WorkspaceOperationEnvelope],
) -> Result<(), StorageError> {
    let Some((mut next_client_sequence, base_server_sequence)) = transaction
        .query_row(
            "SELECT next_client_sequence, observed_server_sequence FROM sync_connection \
             WHERE singleton = 1 AND disconnected_at IS NULL",
            [],
            |row| Ok((row_sequence(row, 0)?, row_sequence(row, 1)?)),
        )
        .optional()
        .map_err(backend)?
    else {
        return Ok(());
    };
    let created_at = transaction
        .query_row(
            "SELECT CAST(unixepoch('subsec') * 1000 AS INTEGER)",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(backend)?;

    for envelope in operations {
        let policy = envelope.operation.sync_policy();
        match policy.replication_class {
            SyncReplicationClass::DeviceLocal => continue,
            SyncReplicationClass::UnsupportedSyncProtocolV1 => {
                insert_blocked_operation(
                    transaction,
                    envelope,
                    policy.operation_type,
                    "unsupported_operation",
                    created_at,
                )?;
            }
            SyncReplicationClass::ReplicatedWorkspaceContent => {
                let operation = ClientSyncOperation {
                    operation_id: Uuid::new_v4().to_string(),
                    client_sequence: next_client_sequence,
                    base_server_sequence,
                    payload: SyncOperationPayload::inline(envelope.clone()),
                };
                match operation.validate_queued(WORKSPACE_SYNC_PROTOCOL_VERSION) {
                    Ok(()) => {
                        let client_sequence = sql_sequence(operation.client_sequence)?;
                        let base_server_sequence = sql_sequence(operation.base_server_sequence)?;
                        transaction
                            .execute(
                                "INSERT INTO sync_outbox(\
                                    operation_id, client_sequence, base_server_sequence, \
                                    operation_json, created_at\
                                 ) VALUES (?1, ?2, ?3, ?4, ?5)",
                                params![
                                    operation.operation_id,
                                    client_sequence,
                                    base_server_sequence,
                                    serde_json::to_string(&envelope).map_err(json_backend)?,
                                    created_at
                                ],
                            )
                            .map_err(backend)?;
                        next_client_sequence =
                            next_client_sequence.checked_add(1).ok_or_else(|| {
                                StorageError::InvalidOperation(
                                    "sync client sequence exhausted".into(),
                                )
                            })?;
                        validate_sync_sequence("next client sequence", next_client_sequence, false)
                            .map_err(sync_validation)?;
                    }
                    Err(SyncValidationError::OperationTooLarge { .. }) => {
                        insert_blocked_operation(
                            transaction,
                            envelope,
                            policy.operation_type,
                            "operation_too_large",
                            created_at,
                        )?;
                    }
                    Err(error) => return Err(sync_validation(error)),
                }
            }
        }
    }

    let next_client_sequence = sql_sequence(next_client_sequence)?;
    transaction
        .execute(
            "UPDATE sync_connection SET next_client_sequence = ?1 WHERE singleton = 1",
            [next_client_sequence],
        )
        .map_err(backend)?;
    Ok(())
}

fn insert_blocked_operation(
    transaction: &Transaction<'_>,
    envelope: &WorkspaceOperationEnvelope,
    operation_type: &str,
    reason_code: &str,
    created_at: i64,
) -> Result<(), StorageError> {
    transaction
        .execute(
            "INSERT INTO sync_blocked_operations(\
                id, operation_type, operation_json, reason_code, created_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                Uuid::new_v4().to_string(),
                operation_type,
                serde_json::to_string(envelope).map_err(json_backend)?,
                reason_code,
                created_at
            ],
        )
        .map_err(backend)?;
    Ok(())
}

struct BlockedRow {
    id: String,
    operation_type: String,
    reason_code: String,
    envelope: WorkspaceOperationEnvelope,
    created_at: i64,
}

fn read_blocked_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BlockedRow> {
    let operation_json = row.get::<_, String>(3)?;
    let envelope = serde_json::from_str(&operation_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            operation_json.len(),
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })?;
    Ok(BlockedRow {
        id: row.get(0)?,
        operation_type: row.get(1)?,
        reason_code: row.get(2)?,
        envelope,
        created_at: row.get(4)?,
    })
}

fn unresolved_blocked_rows(
    connection: &rusqlite::Connection,
    reason_code: Option<&str>,
) -> Result<Vec<BlockedRow>, StorageError> {
    let mut statement = connection
        .prepare(
            "SELECT id, operation_type, reason_code, operation_json, created_at \
             FROM sync_blocked_operations \
             WHERE resolved_at IS NULL AND (?1 IS NULL OR reason_code = ?1) \
             ORDER BY created_at, id",
        )
        .map_err(backend)?;
    statement
        .query_map([reason_code], read_blocked_row)
        .map_err(backend)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(backend)
}

fn unresolved_blocked_row(
    connection: &rusqlite::Connection,
    blocked_id: &str,
) -> Result<Option<BlockedRow>, StorageError> {
    connection
        .query_row(
            "SELECT id, operation_type, reason_code, operation_json, created_at \
             FROM sync_blocked_operations WHERE id = ?1 AND resolved_at IS NULL",
            [blocked_id],
            read_blocked_row,
        )
        .optional()
        .map_err(backend)
}

fn resolve_blocked_row(
    transaction: &Transaction<'_>,
    blocked_id: &str,
    resolution: &str,
    at: i64,
) -> Result<(), StorageError> {
    let changed = transaction
        .execute(
            "UPDATE sync_blocked_operations \
             SET resolved_at = MAX(?2, created_at), resolution = ?3 \
             WHERE id = ?1 AND resolved_at IS NULL",
            params![blocked_id, at, resolution],
        )
        .map_err(backend)?;
    if changed != 1 {
        return Err(StorageError::NotFound(blocked_id.to_owned()));
    }
    Ok(())
}

/// Moves one blocked operation back into the pending outbox at the tail of
/// the queue and resolves its blocked record as retried, in the caller's
/// transaction, so a crash can never lose or duplicate the operation. A parked
/// document write whose body no longer matches the canonical document is
/// requeued as a write of the canonical body, so the stale parked version can
/// never overtake later local edits on other devices.
fn requeue_blocked_row(
    transaction: &Transaction<'_>,
    row: &BlockedRow,
    now_ms: i64,
) -> Result<(), StorageError> {
    let active = read_active_connection(transaction)?.ok_or_else(|| {
        StorageError::InvalidOperation(
            "retrying a blocked change requires an active sync connection".into(),
        )
    })?;
    let envelope = canonical_document_write(transaction, &row.envelope, now_ms)?;
    let operation = ClientSyncOperation {
        operation_id: Uuid::new_v4().to_string(),
        client_sequence: active.next_client_sequence,
        base_server_sequence: active.observed_server_sequence,
        payload: SyncOperationPayload::inline(envelope.clone()),
    };
    operation
        .validate_queued(WORKSPACE_SYNC_PROTOCOL_VERSION)
        .map_err(sync_validation)?;
    transaction
        .execute(
            "INSERT INTO sync_outbox(\
                operation_id, client_sequence, base_server_sequence, operation_json, created_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                operation.operation_id,
                sql_sequence(operation.client_sequence)?,
                sql_sequence(operation.base_server_sequence)?,
                serde_json::to_string(&envelope).map_err(json_backend)?,
                now_ms.max(0)
            ],
        )
        .map_err(backend)?;
    let next_client_sequence = active
        .next_client_sequence
        .checked_add(1)
        .ok_or_else(|| StorageError::InvalidOperation("sync client sequence exhausted".into()))?;
    validate_sync_sequence("next client sequence", next_client_sequence, false)
        .map_err(sync_validation)?;
    transaction
        .execute(
            "UPDATE sync_connection SET next_client_sequence = ?1 WHERE singleton = 1",
            [sql_sequence(next_client_sequence)?],
        )
        .map_err(backend)?;
    resolve_blocked_row(transaction, &row.id, "retried", now_ms)
}

fn canonical_document_write(
    transaction: &Transaction<'_>,
    envelope: &WorkspaceOperationEnvelope,
    at: i64,
) -> Result<WorkspaceOperationEnvelope, StorageError> {
    let Some(note_id) = document_write_target(&envelope.operation) else {
        return Ok(envelope.clone());
    };
    let canonical = transaction
        .query_row(
            "SELECT document_json, markdown, revision, word_count FROM documents \
             WHERE note_id = ?1",
            [note_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()
        .map_err(backend)?;
    let Some((stored_json, stored_markdown, revision, word_count)) = canonical else {
        return Ok(envelope.clone());
    };
    let (parked_json, parked_markdown) = match &envelope.operation {
        WorkspaceOperation::SaveDocument {
            document_json,
            markdown,
            ..
        }
        | WorkspaceOperation::CreateNote {
            document_json,
            markdown,
            ..
        } => (document_json, markdown),
        _ => return Ok(envelope.clone()),
    };
    if documents_equivalent(&stored_json, &stored_markdown, parked_json, parked_markdown) {
        return Ok(envelope.clone());
    }
    let document_json = serde_json::from_str(&stored_json).map_err(json_backend)?;
    let mut fresh = envelope.clone();
    fresh.operation = match &envelope.operation {
        WorkspaceOperation::CreateNote {
            id,
            title,
            placement,
            at,
            ..
        } => WorkspaceOperation::CreateNote {
            id: id.clone(),
            title: title.clone(),
            placement: placement.clone(),
            document_json,
            markdown: stored_markdown,
            at: *at,
        },
        _ => WorkspaceOperation::SaveDocument {
            note_id: note_id.to_owned(),
            document_json,
            markdown: stored_markdown,
            word_count,
            expected_revision: revision,
            at: at.max(0),
        },
    };
    Ok(fresh)
}

fn blocked_target(
    connection: &rusqlite::Connection,
    envelope: &WorkspaceOperationEnvelope,
) -> Result<(Option<String>, Option<String>), StorageError> {
    let target_id = envelope.operation.target_entity_id().map(str::to_owned);
    let target_title = match target_id.as_deref() {
        Some(id) => connection
            .query_row(
                "SELECT title FROM workspace_nodes WHERE id = ?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(backend)?,
        None => None,
    };
    Ok((target_id, target_title))
}

impl SyncRecovery for SqliteWorkspace {
    fn sync_recovery_view(&self) -> Result<SyncRecoveryView, StorageError> {
        let connection = self.lock()?;
        let mut blocked = Vec::new();
        for row in unresolved_blocked_rows(&connection, None)? {
            let (target_id, target_title) = blocked_target(&connection, &row.envelope)?;
            let (asset_content_hash, asset_mime_type) = row
                .envelope
                .operation
                .required_asset_content()
                .map(|required| {
                    (
                        required.content_hash.to_owned(),
                        required.mime_type.to_owned(),
                    )
                })
                .unzip();
            blocked.push(BlockedSyncOperationView {
                blocked_id: row.id,
                operation_type: row.operation_type,
                reason_code: row.reason_code,
                target_id,
                target_title,
                asset_content_hash,
                asset_mime_type,
                first_blocked_at: row.created_at,
            });
        }

        let mut statement = connection
            .prepare(
                "SELECT id, operation_type, reason_code, operation_json, created_at, resolved_at \
                 FROM sync_blocked_operations WHERE resolution = 'discarded' \
                 ORDER BY resolved_at DESC, created_at DESC, id LIMIT 20",
            )
            .map_err(backend)?;
        let discarded_rows = statement
            .query_map([], |row| {
                let blocked = read_blocked_row(row)?;
                Ok((blocked, row.get::<_, i64>(5)?))
            })
            .map_err(backend)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(backend)?;
        let mut discarded = Vec::new();
        for (row, discarded_at) in discarded_rows {
            let (target_id, target_title) = blocked_target(&connection, &row.envelope)?;
            discarded.push(DiscardedSyncOperationView {
                blocked_id: row.id,
                operation_type: row.operation_type,
                reason_code: row.reason_code,
                target_id,
                target_title,
                first_blocked_at: row.created_at,
                discarded_at,
            });
        }

        Ok(SyncRecoveryView {
            view_version: SYNC_RECOVERY_VIEW_VERSION,
            blocked,
            discarded,
        })
    }

    fn retry_blocked_sync_operation(
        &self,
        blocked_id: &str,
        now_ms: i64,
    ) -> Result<(), StorageError> {
        validate_sync_identifier("blocked operation id", blocked_id).map_err(sync_validation)?;
        if now_ms < 0 {
            return Err(StorageError::InvalidOperation(
                "sync retry requires a non-negative time".into(),
            ));
        }
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(backend)?;
        let row = unresolved_blocked_row(&transaction, blocked_id)?
            .ok_or_else(|| StorageError::NotFound(blocked_id.to_owned()))?;
        if matches!(
            row.reason_code.as_str(),
            "operation_too_large" | "unsupported_operation"
        ) {
            return Err(StorageError::InvalidOperation(
                "this change can never upload under the current sync protocol; \
                 discard it to clear the record"
                    .into(),
            ));
        }
        requeue_blocked_row(&transaction, &row, now_ms)?;
        transaction.commit().map_err(backend)
    }

    fn discard_blocked_sync_operation(
        &self,
        blocked_id: &str,
        now_ms: i64,
    ) -> Result<(), StorageError> {
        validate_sync_identifier("blocked operation id", blocked_id).map_err(sync_validation)?;
        if now_ms < 0 {
            return Err(StorageError::InvalidOperation(
                "sync discard requires a non-negative time".into(),
            ));
        }
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(backend)?;
        resolve_blocked_row(&transaction, blocked_id, "discarded", now_ms)?;
        transaction.commit().map_err(backend)
    }
}

impl WorkspaceSyncQueue for SqliteWorkspace {
    fn sync_connection(&self) -> Result<Option<SyncConnection>, StorageError> {
        let connection = self.lock()?;
        read_active_connection(&connection)
    }

    fn connect_sync(&self, requested: &NewSyncConnection) -> Result<SyncConnection, StorageError> {
        validate_connection(requested)?;
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(backend)?;
        let existing = transaction
            .query_row(
                "SELECT workspace_id, device_id FROM sync_connection WHERE singleton = 1",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(backend)?;
        if let Some((workspace_id, device_id)) = existing {
            if workspace_id != requested.workspace_id || device_id != requested.device_id {
                return Err(StorageError::InvalidOperation(
                    "workspace is already associated with a different sync identity".into(),
                ));
            }
            transaction
                .execute(
                    "UPDATE sync_connection SET connected_at = ?1, disconnected_at = NULL, \
                     observed_server_sequence = MAX(observed_server_sequence, ?2) \
                     WHERE singleton = 1",
                    params![
                        requested.connected_at,
                        sql_sequence(requested.observed_server_sequence)?
                    ],
                )
                .map_err(backend)?;
        } else {
            // A missing connection row alongside surviving sync state means a
            // previous epoch was torn down incompletely. Its client and server
            // sequences belong to a dead stream and would collide with the
            // fresh one, so the leftovers must go before the counters restart.
            // Tombstones stay: they record entity-level deletions that remain
            // true across epochs and carry no stream-unique constraints.
            transaction
                .execute_batch(
                    "DELETE FROM sync_outbox;\
                     DELETE FROM sync_blocked_operations;\
                     DELETE FROM sync_received_operations;\
                     DELETE FROM sync_document_heads;\
                     DELETE FROM sync_dangling_references;",
                )
                .map_err(backend)?;
            transaction
                .execute(
                    "INSERT INTO sync_connection(\
                        singleton, workspace_id, device_id, connected_at, \
                        observed_server_sequence, next_client_sequence\
                     ) VALUES (1, ?1, ?2, ?3, ?4, 1)",
                    params![
                        requested.workspace_id,
                        requested.device_id,
                        requested.connected_at,
                        sql_sequence(requested.observed_server_sequence)?
                    ],
                )
                .map_err(backend)?;
            let initial_operations = initial_sync_operations(&transaction)?;
            enqueue_sync_operations(&transaction, &initial_operations)?;
        }
        let connected = read_active_connection(&transaction)?
            .ok_or_else(|| StorageError::Backend("sync connection was not persisted".into()))?;
        transaction.commit().map_err(backend)?;
        Ok(connected)
    }

    fn disconnect_sync(&self, disconnected_at: i64) -> Result<(), StorageError> {
        if disconnected_at < 0 {
            return Err(StorageError::InvalidOperation(
                "sync disconnect time must be non-negative".into(),
            ));
        }
        let connection = self.lock()?;
        let changed = connection
            .execute(
                "UPDATE sync_connection SET disconnected_at = ?1 \
                 WHERE singleton = 1 AND disconnected_at IS NULL AND connected_at <= ?1",
                [disconnected_at],
            )
            .map_err(backend)?;
        if changed != 1 {
            return Err(StorageError::NotFound("active sync connection".into()));
        }
        Ok(())
    }

    fn claim_sync_operations(
        &self,
        worker_id: &str,
        now_ms: i64,
        lease_ms: i64,
        limit: usize,
    ) -> Result<Option<PendingSyncBatch>, StorageError> {
        require_worker(worker_id)?;
        if now_ms < 0
            || lease_ms <= 0
            || !(1..=skriuw_domain::MAX_SYNC_BATCH_OPERATIONS).contains(&limit)
        {
            return Err(StorageError::InvalidOperation(
                "sync claim requires valid time, lease, and batch limit".into(),
            ));
        }
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(backend)?;
        let Some(active) = read_active_connection(&transaction)? else {
            transaction.commit().map_err(backend)?;
            return Ok(None);
        };
        let lease_expired_before = now_ms.saturating_sub(lease_ms);
        let rows = read_outbox_rows(&transaction, limit)?;
        let mut selected = Vec::new();
        let mut previous_sequence = None;
        for row in rows {
            let available = row.next_attempt_at <= now_ms
                && row
                    .claimed_at
                    .is_none_or(|claimed_at| claimed_at <= lease_expired_before);
            if !available
                || previous_sequence.is_some_and(|previous| row.client_sequence != previous + 1)
            {
                break;
            }
            let candidate = ClientSyncOperation {
                operation_id: row.operation_id.clone(),
                client_sequence: row.client_sequence,
                base_server_sequence: row.base_server_sequence,
                payload: SyncOperationPayload::inline(row.operation.clone()),
            };
            // An operation above the inline ceiling becomes a small manifest
            // once the transport externalizes it, so it travels alone rather
            // than being measured against the inline batch bounds.
            if candidate.exceeds_inline_ceiling() {
                candidate
                    .validate_queued(WORKSPACE_SYNC_PROTOCOL_VERSION)
                    .map_err(sync_validation)?;
                if selected.is_empty() {
                    selected.push(candidate);
                }
                break;
            }
            let mut prospective = selected.clone();
            prospective.push(candidate.clone());
            let prospective =
                skriuw_domain::SyncPushRequest::v1(active.device_id.clone(), prospective);
            prospective.validate_queued().map_err(sync_validation)?;
            if prospective.exceeds_batch_ceiling() {
                if !selected.is_empty() {
                    break;
                }
                return Err(sync_validation(SyncValidationError::BatchTooLarge {
                    maximum: skriuw_domain::MAX_SYNC_BATCH_BYTES,
                }));
            }
            previous_sequence = Some(row.client_sequence);
            selected.push(candidate);
        }
        if selected.is_empty() {
            transaction.commit().map_err(backend)?;
            return Ok(None);
        }
        for operation in &selected {
            transaction
                .execute(
                    "UPDATE sync_outbox SET claimed_by = ?2, claimed_at = ?3, \
                     attempts = attempts + 1, last_error = NULL WHERE operation_id = ?1",
                    params![operation.operation_id, worker_id, now_ms],
                )
                .map_err(backend)?;
        }
        let request = skriuw_domain::SyncPushRequest::v1(active.device_id, selected);
        request.validate_queued().map_err(sync_validation)?;
        transaction.commit().map_err(backend)?;
        Ok(Some(PendingSyncBatch {
            workspace_id: active.workspace_id,
            request,
        }))
    }

    fn acknowledge_sync_operations(
        &self,
        worker_id: &str,
        accepted: &[skriuw_domain::SyncAcceptedOperation],
    ) -> Result<(), StorageError> {
        require_worker(worker_id)?;
        if accepted.is_empty() {
            return Err(StorageError::InvalidOperation(
                "sync acknowledgement cannot be empty".into(),
            ));
        }
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(backend)?;
        let connection_identity = read_connection(&transaction)?.ok_or_else(|| {
            StorageError::InvalidOperation("sync acknowledgement requires a connection".into())
        })?;
        let claimed = claimed_operation_keys(&transaction, worker_id)?;
        if claimed.iter().any(|(operation_id, client_sequence)| {
            !accepted.iter().any(|item| {
                &item.operation_id == operation_id && &item.client_sequence == client_sequence
            })
        }) {
            return Err(StorageError::InvalidOperation(
                "sync acknowledgement must match the complete claimed batch".into(),
            ));
        }
        let mut previous_server_sequence = None;
        let mut operation_ids = std::collections::BTreeSet::new();
        let acknowledged_at = transaction
            .query_row(
                "SELECT CAST(unixepoch('subsec') * 1000 AS INTEGER)",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(backend)?;
        for item in accepted {
            validate_sync_identifier("sync operation id", &item.operation_id)
                .map_err(sync_validation)?;
            validate_sync_sequence("client sequence", item.client_sequence, false)
                .map_err(sync_validation)?;
            validate_sync_sequence("server sequence", item.server_sequence, false)
                .map_err(sync_validation)?;
            if previous_server_sequence.is_some_and(|previous| item.server_sequence <= previous) {
                return Err(StorageError::InvalidOperation(
                    "sync acknowledgement server sequences must be ordered".into(),
                ));
            }
            previous_server_sequence = Some(item.server_sequence);
            if !operation_ids.insert(item.operation_id.as_str()) {
                return Err(StorageError::InvalidOperation(
                    "sync acknowledgement contains a duplicate operation id".into(),
                ));
            }

            if claimed.iter().any(|(operation_id, client_sequence)| {
                operation_id == &item.operation_id && client_sequence == &item.client_sequence
            }) {
                let outbox = outbox_operation(&transaction, &item.operation_id)?
                    .ok_or_else(|| StorageError::NotFound(item.operation_id.clone()))?;
                // The log now carries this write, so it becomes part of this
                // device's incorporated history without waiting for the echo
                // to arrive back through a pull.
                let head_target =
                    document_write_target(&outbox.operation.operation).map(str::to_owned);
                let replicated = ReplicatedWorkspaceOperation {
                    operation_id: item.operation_id.clone(),
                    device_id: connection_identity.device_id.clone(),
                    client_sequence: item.client_sequence,
                    base_server_sequence: outbox.base_server_sequence,
                    server_sequence: item.server_sequence,
                    payload: SyncOperationPayload::inline(outbox.operation),
                };
                let operation_json = serde_json::to_string(replicated_envelope(&replicated)?)
                    .map_err(json_backend)?;
                if let Some(existing) = received_operation(&transaction, &item.operation_id)? {
                    require_matching_received(&replicated, &operation_json, &existing)?;
                    if existing.outcome != "local_echo" {
                        return Err(StorageError::InvalidOperation(
                            "acknowledged local operation has a non-echo outcome".into(),
                        ));
                    }
                } else {
                    insert_received_operation(
                        &transaction,
                        &replicated,
                        &operation_json,
                        ReceivedOutcome::LocalEcho,
                        acknowledged_at,
                    )?;
                }
                let changed = transaction
                    .execute(
                        "DELETE FROM sync_outbox WHERE operation_id = ?1 AND client_sequence = ?2 \
                         AND claimed_by = ?3",
                        params![
                            item.operation_id,
                            sql_sequence(item.client_sequence)?,
                            worker_id
                        ],
                    )
                    .map_err(backend)?;
                if changed != 1 {
                    return Err(StorageError::NotFound(item.operation_id.clone()));
                }
                if let Some(note_id) = head_target {
                    advance_document_head_for_note(&transaction, &note_id, item.server_sequence)?;
                }
            } else {
                let existing = received_operation(&transaction, &item.operation_id)?
                    .ok_or_else(|| StorageError::NotFound(item.operation_id.clone()))?;
                if existing.device_id != connection_identity.device_id
                    || existing.client_sequence != item.client_sequence
                    || existing.server_sequence != item.server_sequence
                    || existing.outcome != "local_echo"
                {
                    return Err(StorageError::InvalidOperation(
                        "sync acknowledgement does not match a local echo".into(),
                    ));
                }
            }
        }
        let mut acknowledged_cursor = connection_identity.observed_server_sequence;
        for item in accepted {
            if item.server_sequence == acknowledged_cursor.saturating_add(1) {
                acknowledged_cursor = item.server_sequence;
            } else {
                break;
            }
        }
        transaction
            .execute(
                "UPDATE sync_connection SET observed_server_sequence = ?1 WHERE singleton = 1",
                [sql_sequence(acknowledged_cursor)?],
            )
            .map_err(backend)?;
        transaction.commit().map_err(backend)
    }

    fn release_sync_operations(
        &self,
        worker_id: &str,
        operation_ids: &[String],
        retry_at_ms: i64,
        diagnostic: &Diagnostic,
    ) -> Result<(), StorageError> {
        require_worker(worker_id)?;
        if operation_ids.is_empty() || retry_at_ms < 0 {
            return Err(StorageError::InvalidOperation(
                "sync retry requires operations and a non-negative retry time".into(),
            ));
        }
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(backend)?;
        let claimed = claimed_operation_keys(&transaction, worker_id)?;
        if claimed.len() != operation_ids.len()
            || claimed
                .iter()
                .zip(operation_ids)
                .any(|((claimed_id, _), operation_id)| claimed_id != operation_id)
        {
            return Err(StorageError::InvalidOperation(
                "sync retry must match the complete claimed batch".into(),
            ));
        }
        let diagnostic = diagnostic.to_string();
        for operation_id in operation_ids {
            validate_sync_identifier("sync operation id", operation_id).map_err(sync_validation)?;
            let changed = transaction
                .execute(
                    "UPDATE sync_outbox SET claimed_by = NULL, claimed_at = NULL, \
                     next_attempt_at = ?3, last_error = ?4 \
                     WHERE operation_id = ?1 AND claimed_by = ?2",
                    params![operation_id, worker_id, retry_at_ms, diagnostic],
                )
                .map_err(backend)?;
            if changed != 1 {
                return Err(StorageError::NotFound(operation_id.clone()));
            }
        }
        transaction.commit().map_err(backend)
    }

    fn blocked_sync_operations(&self) -> Result<Vec<BlockedSyncOperation>, StorageError> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT id, operation_type, reason_code, created_at \
                 FROM sync_blocked_operations WHERE resolved_at IS NULL \
                 ORDER BY created_at, id",
            )
            .map_err(backend)?;
        statement
            .query_map([], |row| {
                Ok(BlockedSyncOperation {
                    id: row.get(0)?,
                    operation_type: row.get(1)?,
                    reason_code: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(backend)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(backend)
    }

    fn block_claimed_sync_operations(
        &self,
        worker_id: &str,
        operation_ids: &[String],
        reason_code: &str,
    ) -> Result<(), StorageError> {
        require_worker(worker_id)?;
        if operation_ids.is_empty() {
            return Err(StorageError::InvalidOperation(
                "sync block requires at least one operation".into(),
            ));
        }
        if !matches!(
            reason_code,
            "operation_too_large"
                | "unsupported_operation"
                | "asset_content_missing"
                | "cloud_rejected"
        ) {
            return Err(StorageError::InvalidOperation(format!(
                "unknown sync block reason {reason_code}"
            )));
        }
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(backend)?;
        let claimed = claimed_operation_keys(&transaction, worker_id)?;
        let most_attempts = transaction
            .query_row(
                "SELECT COALESCE(MAX(attempts), 0) FROM sync_outbox WHERE claimed_by = ?1",
                [worker_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(backend)?;
        if most_attempts > 1 && reason_code != "cloud_rejected" {
            return Err(StorageError::ReleaseRequired(
                "a row in the claimed batch was pushed before and may be server-visible; \
                 renumbering it could collide with an accepted client sequence"
                    .into(),
            ));
        }
        let mut blocked_ids = std::collections::BTreeSet::new();
        for operation_id in operation_ids {
            validate_sync_identifier("sync operation id", operation_id).map_err(sync_validation)?;
            if !claimed.iter().any(|(id, _)| id == operation_id) {
                return Err(StorageError::InvalidOperation(format!(
                    "operation {operation_id} is not part of the claimed batch"
                )));
            }
            if !blocked_ids.insert(operation_id.as_str()) {
                return Err(StorageError::InvalidOperation(format!(
                    "operation {operation_id} is listed twice"
                )));
            }
        }
        let created_at = transaction
            .query_row(
                "SELECT CAST(unixepoch('subsec') * 1000 AS INTEGER)",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(backend)?;
        let resequence_start = transaction
            .query_row("SELECT MIN(client_sequence) FROM sync_outbox", [], |row| {
                row.get::<_, Option<i64>>(0)
            })
            .map_err(backend)?
            .ok_or_else(|| StorageError::Backend("claimed batch has no pending rows".into()))?;
        for operation_id in operation_ids {
            let outbox = outbox_operation(&transaction, operation_id)?
                .ok_or_else(|| StorageError::NotFound(operation_id.clone()))?;
            let operation_type = outbox.operation.operation.sync_policy().operation_type;
            insert_blocked_operation(
                &transaction,
                &outbox.operation,
                operation_type,
                reason_code,
                created_at,
            )?;
            transaction
                .execute(
                    "DELETE FROM sync_outbox WHERE operation_id = ?1",
                    [operation_id],
                )
                .map_err(backend)?;
        }
        transaction
            .execute(
                "UPDATE sync_outbox SET claimed_by = NULL, claimed_at = NULL \
                 WHERE claimed_by = ?1",
                [worker_id],
            )
            .map_err(backend)?;
        resequence_outbox(&transaction, resequence_start)?;
        transaction.commit().map_err(backend)
    }

    fn has_pending_sync_operations(&self) -> Result<bool, StorageError> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sync_outbox) \
                 OR EXISTS(SELECT 1 FROM sync_blocked_operations WHERE resolved_at IS NULL)",
                [],
                |row| row.get::<_, bool>(0),
            )
            .map_err(backend)
    }

    fn next_sync_attempt_at(&self) -> Result<Option<i64>, StorageError> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT MIN(next_attempt_at) FROM sync_outbox WHERE claimed_by IS NULL",
                [],
                |row| row.get::<_, Option<i64>>(0),
            )
            .map_err(backend)
    }

    fn reset_sync_retry_times(&self, now_ms: i64) -> Result<usize, StorageError> {
        if now_ms < 0 {
            return Err(StorageError::InvalidOperation(
                "sync retry reset requires a non-negative time".into(),
            ));
        }
        let connection = self.lock()?;
        connection
            .execute(
                "UPDATE sync_outbox SET next_attempt_at = 0 \
                 WHERE claimed_by IS NULL AND next_attempt_at > ?1",
                [now_ms],
            )
            .map_err(backend)
    }

    fn requeue_blocked_sync_operations_with_assets(
        &self,
        now_ms: i64,
        asset_available: &dyn Fn(&str, &str) -> bool,
    ) -> Result<usize, StorageError> {
        if now_ms < 0 {
            return Err(StorageError::InvalidOperation(
                "sync requeue requires a non-negative time".into(),
            ));
        }
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(backend)?;
        if read_active_connection(&transaction)?.is_none() {
            return Ok(0);
        }
        let rows = unresolved_blocked_rows(&transaction, Some("asset_content_missing"))?;
        let mut requeued = 0;
        for row in rows {
            let available = row
                .envelope
                .operation
                .required_asset_content()
                .is_some_and(|required| asset_available(required.content_hash, required.mime_type));
            if !available {
                continue;
            }
            requeue_blocked_row(&transaction, &row, now_ms)?;
            requeued += 1;
        }
        if requeued > 0 {
            transaction.commit().map_err(backend)?;
        }
        Ok(requeued)
    }

    fn apply_remote_operations(
        &self,
        operations: &[ReplicatedWorkspaceOperation],
        received_at: i64,
    ) -> Result<Vec<RemoteSyncApplyOutcome>, StorageError> {
        if operations.is_empty() || received_at < 0 {
            return Err(StorageError::InvalidOperation(
                "remote sync apply requires operations and a non-negative receive time".into(),
            ));
        }
        for operation in operations {
            operation
                .validate(WORKSPACE_SYNC_PROTOCOL_VERSION)
                .map_err(sync_validation)?;
            replicated_envelope(operation)?;
        }

        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(backend)?;
        let active = read_active_connection(&transaction)?.ok_or_else(|| {
            StorageError::InvalidOperation(
                "remote operations require an active sync connection".into(),
            )
        })?;
        let mut cursor = active.observed_server_sequence;
        let mut outcomes = Vec::with_capacity(operations.len());

        for operation in operations {
            let envelope = replicated_envelope(operation)?;
            let operation_json = serde_json::to_string(envelope).map_err(json_backend)?;
            let expected_sequence = cursor.checked_add(1).ok_or_else(|| {
                StorageError::InvalidOperation("sync server sequence exhausted".into())
            })?;
            if operation.server_sequence > expected_sequence {
                return Err(StorageError::InvalidOperation(format!(
                    "expected server sequence {expected_sequence}, received {}",
                    operation.server_sequence
                )));
            }

            if let Some(existing) = received_operation(&transaction, &operation.operation_id)? {
                require_matching_received(operation, &operation_json, &existing)?;
                if operation.server_sequence == expected_sequence {
                    cursor = operation.server_sequence;
                } else if operation.server_sequence > cursor {
                    return Err(StorageError::InvalidOperation(
                        "received operation is ahead of the pull cursor".into(),
                    ));
                }
                outcomes.push(RemoteSyncApplyOutcome::Duplicate);
                continue;
            }

            if operation.server_sequence <= cursor {
                return Err(StorageError::InvalidOperation(format!(
                    "server sequence {} has no matching received operation",
                    operation.server_sequence
                )));
            }
            if operation_id_at_server_sequence(&transaction, operation.server_sequence)?.is_some() {
                return Err(StorageError::InvalidOperation(format!(
                    "server sequence {} is already assigned",
                    operation.server_sequence
                )));
            }

            if let Some(outbox) = outbox_operation(&transaction, &operation.operation_id)? {
                if operation.device_id != active.device_id
                    || operation.client_sequence != outbox.client_sequence
                    || operation.base_server_sequence != outbox.base_server_sequence
                    || operation_json
                        != serde_json::to_string(&outbox.operation).map_err(json_backend)?
                {
                    return Err(StorageError::InvalidOperation(format!(
                        "local operation {} returned with conflicting content",
                        operation.operation_id
                    )));
                }
                insert_received_operation(
                    &transaction,
                    operation,
                    &operation_json,
                    ReceivedOutcome::LocalEcho,
                    received_at,
                )?;
                transaction
                    .execute(
                        "DELETE FROM sync_outbox WHERE operation_id = ?1",
                        [&operation.operation_id],
                    )
                    .map_err(backend)?;
                advance_document_head(
                    &transaction,
                    &envelope.operation,
                    operation.server_sequence,
                )?;
                cursor = operation.server_sequence;
                outcomes.push(RemoteSyncApplyOutcome::LocalEcho);
                continue;
            }

            if operation.device_id == active.device_id
                && operation.server_sequence <= active.rehydrated_through
            {
                return Err(StorageError::InvalidOperation(format!(
                    "local echo {} has no matching outbound operation",
                    operation.operation_id
                )));
            }

            let reconcile_state =
                remote_target_state(&transaction, &envelope.operation, operation.server_sequence)?;
            match reconcile_remote_operation(&envelope.operation, &reconcile_state) {
                RemoteOperationDecision::ProtocolInvalid { operation_type } => {
                    return Err(StorageError::InvalidOperation(format!(
                        "operation {operation_type} cannot appear in the replicated sync log"
                    )));
                }
                RemoteOperationDecision::AlreadyApplied => {
                    insert_received_operation(
                        &transaction,
                        operation,
                        &operation_json,
                        ReceivedOutcome::NoOp,
                        received_at,
                    )?;
                    advance_document_head(
                        &transaction,
                        &envelope.operation,
                        operation.server_sequence,
                    )?;
                    cursor = operation.server_sequence;
                    outcomes.push(RemoteSyncApplyOutcome::NoOp);
                }
                RemoteOperationDecision::Superseded { reason } => {
                    record_superseded(
                        &transaction,
                        operation,
                        &operation_json,
                        reason,
                        None,
                        received_at,
                    )?;
                    cursor = operation.server_sequence;
                    outcomes.push(RemoteSyncApplyOutcome::Superseded { reason });
                }
                RemoteOperationDecision::Apply => {
                    match apply_remote_envelope(&transaction, envelope) {
                        Ok(acknowledgement) => {
                            backfill_tombstone_provenance(&transaction, operation)?;
                            insert_received_operation(
                                &transaction,
                                operation,
                                &operation_json,
                                ReceivedOutcome::Applied,
                                received_at,
                            )?;
                            advance_document_head(
                                &transaction,
                                &envelope.operation,
                                operation.server_sequence,
                            )?;
                            cursor = operation.server_sequence;
                            outcomes.push(RemoteSyncApplyOutcome::Applied(acknowledgement));
                        }
                        Err(error @ (StorageError::Backend(_) | StorageError::Busy(_))) => {
                            return Err(error);
                        }
                        Err(error) => {
                            let reason = refine_apply_error(&envelope.operation, &error);
                            record_superseded(
                                &transaction,
                                operation,
                                &operation_json,
                                reason,
                                Some(&error),
                                received_at,
                            )?;
                            cursor = operation.server_sequence;
                            outcomes.push(RemoteSyncApplyOutcome::Superseded { reason });
                        }
                    }
                }
            }
        }

        transaction
            .execute(
                "UPDATE sync_connection SET observed_server_sequence = ?1 \
                 WHERE singleton = 1 AND disconnected_at IS NULL",
                [sql_sequence(cursor)?],
            )
            .map_err(backend)?;
        transaction.commit().map_err(backend)?;
        Ok(outcomes)
    }

    fn sync_tombstones(&self) -> Result<Vec<SyncTombstone>, StorageError> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT entity_kind, entity_id, scope_id, root_id, operation_id, \
                 server_sequence, created_at FROM sync_tombstones \
                 ORDER BY entity_kind, entity_id, scope_id",
            )
            .map_err(backend)?;
        statement
            .query_map([], |row| {
                let server_sequence = row
                    .get::<_, Option<i64>>(5)?
                    .map(|value| {
                        u64::try_from(value).map_err(|error| {
                            rusqlite::Error::FromSqlConversionFailure(
                                5,
                                rusqlite::types::Type::Integer,
                                Box::new(error),
                            )
                        })
                    })
                    .transpose()?;
                Ok(SyncTombstone {
                    entity_kind: row.get(0)?,
                    entity_id: row.get(1)?,
                    scope_id: row.get(2)?,
                    root_id: row.get(3)?,
                    operation_id: row.get(4)?,
                    server_sequence,
                    created_at: row.get(6)?,
                })
            })
            .map_err(backend)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(backend)
    }

    fn hydrate_from_checkpoint(
        &self,
        archive: &WorkspaceArchive,
        checkpoint_server_sequence: u64,
    ) -> Result<ImportSummary, StorageError> {
        archive
            .validate()
            .map_err(|error| StorageError::InvalidOperation(error.to_string()))?;
        validate_sync_sequence(
            "checkpoint server sequence",
            checkpoint_server_sequence,
            true,
        )
        .map_err(sync_validation)?;

        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(backend)?;
        let active = read_active_connection(&transaction)?.ok_or_else(|| {
            StorageError::InvalidOperation(
                "checkpoint hydration requires an active sync connection".into(),
            )
        })?;
        require_hydration_precondition(&transaction, &active)?;
        let summary = replace_workspace_in_transaction(&transaction, archive, true)?;
        transaction
            .execute(
                "UPDATE sync_connection SET observed_server_sequence = ?1 WHERE singleton = 1",
                params![sql_sequence(checkpoint_server_sequence)?],
            )
            .map_err(backend)?;
        transaction.commit().map_err(backend)?;
        Ok(summary)
    }

    fn rehydrate_from_checkpoint(
        &self,
        archive: &WorkspaceArchive,
        checkpoint_server_sequence: u64,
    ) -> Result<ImportSummary, StorageError> {
        archive
            .validate()
            .map_err(|error| StorageError::InvalidOperation(error.to_string()))?;
        validate_sync_sequence(
            "checkpoint server sequence",
            checkpoint_server_sequence,
            false,
        )
        .map_err(sync_validation)?;

        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(backend)?;
        read_active_connection(&transaction)?.ok_or_else(|| {
            StorageError::InvalidOperation(
                "checkpoint rehydration requires an active sync connection".into(),
            )
        })?;
        if outbox_row_count(&transaction)? > 0 {
            return Err(StorageError::InvalidOperation(
                "checkpoint rehydration cannot discard pending local operations".into(),
            ));
        }
        let carried_history = read_history_rows(&transaction)?;
        let carried_cache = read_history_cache_rows(&transaction)?;
        let mut summary = replace_workspace_in_transaction(&transaction, archive, true)?;
        let archive_revisions = archive
            .documents
            .iter()
            .map(|document| (document.note_id.as_str(), document.revision))
            .collect::<BTreeMap<_, _>>();
        summary.history_items +=
            carry_history_rows(&transaction, &carried_history, &archive_revisions)?;
        for row in carried_cache
            .iter()
            .filter(|row| archive_revisions.contains_key(row.note_id.as_str()))
        {
            transaction
                .execute(
                    "INSERT INTO history_cache(\
                         note_id, version_id, created_at, summary, additions, deletions, word_count\
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        row.note_id,
                        row.version_id,
                        row.created_at,
                        row.summary,
                        row.additions,
                        row.deletions,
                        row.word_count
                    ],
                )
                .map_err(backend)?;
        }
        transaction
            .execute(
                "UPDATE sync_connection SET observed_server_sequence = ?1, \
                 rehydrated_through = ?1 WHERE singleton = 1",
                params![sql_sequence(checkpoint_server_sequence)?],
            )
            .map_err(backend)?;
        transaction.commit().map_err(backend)?;
        Ok(summary)
    }
}

/// Hydration replaces canonical state wholesale, so it is only legal while
/// this device has contributed nothing the server or the log could know about.
fn require_hydration_precondition(
    transaction: &Transaction<'_>,
    active: &SyncConnection,
) -> Result<(), StorageError> {
    if active.observed_server_sequence != 0 {
        return Err(StorageError::InvalidOperation(
            "checkpoint hydration is only allowed before the first pull".into(),
        ));
    }
    if active.next_client_sequence != 1 {
        return Err(StorageError::InvalidOperation(
            "checkpoint hydration is only allowed before the first push".into(),
        ));
    }
    let received = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sync_received_operations)",
            [],
            |row| row.get::<_, bool>(0),
        )
        .map_err(backend)?;
    if received {
        return Err(StorageError::InvalidOperation(
            "checkpoint hydration is only allowed before any operation was received".into(),
        ));
    }
    if outbox_row_count(transaction)? > 0 || unresolved_blocked_count(transaction)? > 0 {
        return Err(StorageError::InvalidOperation(
            "checkpoint hydration cannot discard pending local operations".into(),
        ));
    }
    Ok(())
}

fn outbox_row_count(transaction: &Transaction<'_>) -> Result<i64, StorageError> {
    transaction
        .query_row("SELECT COUNT(*) FROM sync_outbox", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(backend)
}

fn unresolved_blocked_count(transaction: &Transaction<'_>) -> Result<i64, StorageError> {
    transaction
        .query_row(
            "SELECT COUNT(*) FROM sync_blocked_operations WHERE resolved_at IS NULL",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(backend)
}

struct HistoryRow {
    id: String,
    note_id: String,
    revision: i64,
    markdown: String,
    created_at: i64,
    claimed_by: Option<String>,
    claimed_at: Option<i64>,
    attempts: i64,
    last_error: Option<String>,
    next_attempt_at: i64,
    provenance: String,
}

fn read_history_rows(transaction: &Transaction<'_>) -> Result<Vec<HistoryRow>, StorageError> {
    let mut statement = transaction
        .prepare(
            "SELECT id, note_id, revision, markdown, created_at, claimed_by, claimed_at, \
             attempts, last_error, next_attempt_at, provenance FROM history_outbox \
             ORDER BY note_id, revision, provenance",
        )
        .map_err(backend)?;
    statement
        .query_map([], |row| {
            Ok(HistoryRow {
                id: row.get(0)?,
                note_id: row.get(1)?,
                revision: row.get(2)?,
                markdown: row.get(3)?,
                created_at: row.get(4)?,
                claimed_by: row.get(5)?,
                claimed_at: row.get(6)?,
                attempts: row.get(7)?,
                last_error: row.get(8)?,
                next_attempt_at: row.get(9)?,
                provenance: row.get(10)?,
            })
        })
        .map_err(backend)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(backend)
}

/// Pending history for notes the checkpoint still contains survives a
/// rebuild. Rows at or below the archive's revision are lifted above it, and
/// the canonical revision is raised past the highest carried row so later
/// local saves never reuse a carried revision number.
fn carry_history_rows(
    transaction: &Transaction<'_>,
    rows: &[HistoryRow],
    archive_revisions: &BTreeMap<&str, i64>,
) -> Result<usize, StorageError> {
    let mut by_note = BTreeMap::<&str, Vec<&HistoryRow>>::new();
    for row in rows {
        if archive_revisions.contains_key(row.note_id.as_str()) {
            by_note.entry(row.note_id.as_str()).or_default().push(row);
        }
    }
    let mut carried = 0;
    for (note_id, rows) in by_note {
        let archive_revision = archive_revisions[note_id];
        let lowest = rows.iter().map(|row| row.revision).min().unwrap_or(1);
        let highest = rows.iter().map(|row| row.revision).max().unwrap_or(1);
        let shift = if lowest <= archive_revision {
            archive_revision.saturating_sub(lowest).saturating_add(1)
        } else {
            0
        };
        for row in rows {
            transaction
                .execute(
                    "INSERT INTO history_outbox(\
                         id, note_id, revision, markdown, created_at, claimed_by, claimed_at, \
                         attempts, last_error, next_attempt_at, provenance\
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        row.id,
                        row.note_id,
                        row.revision.saturating_add(shift),
                        row.markdown,
                        row.created_at,
                        row.claimed_by,
                        row.claimed_at,
                        row.attempts,
                        row.last_error,
                        row.next_attempt_at,
                        row.provenance
                    ],
                )
                .map_err(backend)?;
            carried += 1;
        }
        transaction
            .execute(
                "UPDATE documents SET revision = MAX(revision, ?2) WHERE note_id = ?1",
                params![note_id, highest.saturating_add(shift)],
            )
            .map_err(backend)?;
    }
    Ok(carried)
}

struct HistoryCacheRow {
    note_id: String,
    version_id: String,
    created_at: i64,
    summary: String,
    additions: Option<i64>,
    deletions: Option<i64>,
    word_count: Option<i64>,
}

fn read_history_cache_rows(
    transaction: &Transaction<'_>,
) -> Result<Vec<HistoryCacheRow>, StorageError> {
    let mut statement = transaction
        .prepare(
            "SELECT note_id, version_id, created_at, summary, additions, deletions, word_count \
             FROM history_cache ORDER BY note_id, created_at, version_id",
        )
        .map_err(backend)?;
    statement
        .query_map([], |row| {
            Ok(HistoryCacheRow {
                note_id: row.get(0)?,
                version_id: row.get(1)?,
                created_at: row.get(2)?,
                summary: row.get(3)?,
                additions: row.get(4)?,
                deletions: row.get(5)?,
                word_count: row.get(6)?,
            })
        })
        .map_err(backend)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(backend)
}

fn initial_sync_operations(
    transaction: &Transaction<'_>,
) -> Result<Vec<WorkspaceOperationEnvelope>, StorageError> {
    let snapshot = read_snapshot(transaction)?;
    let mut operations = Vec::new();

    operations.extend(
        snapshot
            .tags
            .into_iter()
            .map(|tag| WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateTag { tag })),
    );
    operations.extend(
        snapshot.people.into_iter().map(|person| {
            WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreatePerson { person })
        }),
    );

    let documents = snapshot
        .documents
        .into_iter()
        .map(|document| (document.note_id.clone(), document))
        .collect::<std::collections::BTreeMap<_, _>>();
    let deleted_ids = snapshot
        .nodes
        .iter()
        .filter(|node| node.deleted_at.is_some())
        .map(|node| node.id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let mut pending = snapshot.nodes.iter().collect::<Vec<_>>();
    let mut emitted = std::collections::BTreeSet::new();
    while !pending.is_empty() {
        let before = pending.len();
        let mut next = Vec::new();
        for node in pending {
            if node
                .parent_id
                .as_ref()
                .is_some_and(|parent_id| !emitted.contains(parent_id))
            {
                next.push(node);
                continue;
            }
            let placement = NodePlacement::last(node.parent_id.clone());
            let operation = match node.kind {
                NodeKind::Folder => WorkspaceOperation::CreateFolder {
                    id: node.id.clone(),
                    title: node.title.clone(),
                    placement,
                    at: node.created_at,
                },
                NodeKind::Note => {
                    let document = documents.get(&node.id).ok_or_else(|| {
                        StorageError::Backend(format!(
                            "note {} has no document for initial sync",
                            node.id
                        ))
                    })?;
                    WorkspaceOperation::CreateNote {
                        id: node.id.clone(),
                        title: node.title.clone(),
                        placement,
                        document_json: document.document_json.clone(),
                        markdown: document.markdown.clone(),
                        at: node.created_at,
                    }
                }
            };
            operations.push(WorkspaceOperationEnvelope::v1(operation));
            if let Some(pinned_at) = node.pinned_at {
                operations.push(WorkspaceOperationEnvelope::v1(
                    WorkspaceOperation::SetNodePinned {
                        id: node.id.clone(),
                        pinned: true,
                        at: pinned_at,
                    },
                ));
            }
            emitted.insert(node.id.clone());
        }
        if next.len() == before {
            return Err(StorageError::Backend(
                "workspace hierarchy could not be ordered for initial sync".into(),
            ));
        }
        pending = next;
    }

    operations.extend(
        snapshot
            .images
            .into_iter()
            .map(|image| WorkspaceOperationEnvelope::v1(WorkspaceOperation::AttachImage { image })),
    );
    operations.extend(snapshot.nodes.iter().flat_map(|node| {
        let cover = node
            .cover_image_id
            .clone()
            .map(|image_id| {
                [
                    WorkspaceOperation::SetNoteCover {
                        note_id: node.id.clone(),
                        image_id: Some(image_id),
                        at: node.updated_at,
                    },
                    WorkspaceOperation::SetNoteCoverFullWidth {
                        note_id: node.id.clone(),
                        full_width: node.cover_full_width,
                        at: node.updated_at,
                    },
                    WorkspaceOperation::SetNoteCoverTransform {
                        note_id: node.id.clone(),
                        position_x: node.cover_position_x,
                        position_y: node.cover_position_y,
                        zoom: node.cover_zoom,
                        at: node.updated_at,
                    },
                ]
            })
            .into_iter()
            .flatten();
        cover.map(WorkspaceOperationEnvelope::v1)
    }));

    operations.extend(snapshot.properties.into_iter().map(|property| {
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::SetNoteProperty {
            at: snapshot
                .nodes
                .iter()
                .find(|node| node.id == property.note_id)
                .map_or(0, |node| node.updated_at),
            property,
        })
    }));
    operations.extend(snapshot.property_templates.into_iter().map(|template| {
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::SetNotePropertyTemplate { template })
    }));
    operations.extend(snapshot.tasks.into_iter().map(|task| {
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateTask {
            task: Box::new(task),
        })
    }));
    operations.extend(snapshot.prompts.into_iter().map(|prompt| {
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::SetPrompt {
            prompt: Box::new(prompt),
        })
    }));
    /* A thread is always created open, so an already-resolved one replays as
    a create followed by the resolve that produced its current state. */
    operations.extend(snapshot.annotations.into_iter().flat_map(|annotation| {
        let resolved = annotation
            .resolved_at
            .map(|at| (annotation.id.clone(), at))
            .filter(|_| annotation.status == AnnotationStatus::Resolved);
        let created = WorkspaceAnnotation {
            status: AnnotationStatus::Open,
            resolved_at: None,
            ..annotation
        };
        std::iter::once(WorkspaceOperationEnvelope::v1(
            WorkspaceOperation::CreateAnnotation {
                annotation: Box::new(created),
            },
        ))
        .chain(resolved.map(|(id, at)| {
            WorkspaceOperationEnvelope::v1(WorkspaceOperation::ResolveAnnotation { id, at })
        }))
    }));
    operations.extend(snapshot.nodes.iter().filter_map(|node| {
        let deleted_at = node.deleted_at?;
        if node
            .parent_id
            .as_deref()
            .is_some_and(|parent_id| deleted_ids.contains(parent_id))
        {
            return None;
        }
        Some(WorkspaceOperationEnvelope::v1(
            WorkspaceOperation::TrashSubtree {
                root_id: node.id.clone(),
                at: deleted_at,
            },
        ))
    }));
    Ok(operations)
}

fn validate_connection(connection: &NewSyncConnection) -> Result<(), StorageError> {
    validate_sync_identifier("sync workspace id", &connection.workspace_id)
        .map_err(sync_validation)?;
    validate_sync_identifier("sync device id", &connection.device_id).map_err(sync_validation)?;
    validate_sync_sequence(
        "observed server sequence",
        connection.observed_server_sequence,
        true,
    )
    .map_err(sync_validation)?;
    if connection.connected_at < 0 {
        return Err(StorageError::InvalidOperation(
            "sync connection time must be non-negative".into(),
        ));
    }
    Ok(())
}

fn read_active_connection(
    connection: &rusqlite::Connection,
) -> Result<Option<SyncConnection>, StorageError> {
    connection
        .query_row(
            "SELECT workspace_id, device_id, connected_at, observed_server_sequence, \
             next_client_sequence, rehydrated_through FROM sync_connection \
             WHERE singleton = 1 AND disconnected_at IS NULL",
            [],
            read_connection_row,
        )
        .optional()
        .map_err(backend)
}

fn read_connection(
    connection: &rusqlite::Connection,
) -> Result<Option<SyncConnection>, StorageError> {
    connection
        .query_row(
            "SELECT workspace_id, device_id, connected_at, observed_server_sequence, \
             next_client_sequence, rehydrated_through FROM sync_connection WHERE singleton = 1",
            [],
            read_connection_row,
        )
        .optional()
        .map_err(backend)
}

fn read_connection_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncConnection> {
    Ok(SyncConnection {
        workspace_id: row.get(0)?,
        device_id: row.get(1)?,
        connected_at: row.get(2)?,
        observed_server_sequence: row_sequence(row, 3)?,
        next_client_sequence: row_sequence(row, 4)?,
        rehydrated_through: row_sequence(row, 5)?,
    })
}

fn read_outbox_rows(
    transaction: &Transaction<'_>,
    limit: usize,
) -> Result<Vec<OutboxRow>, StorageError> {
    let mut statement = transaction
        .prepare(
            "SELECT operation_id, client_sequence, base_server_sequence, operation_json, \
             claimed_at, next_attempt_at FROM sync_outbox \
             ORDER BY client_sequence LIMIT ?1",
        )
        .map_err(backend)?;
    statement
        .query_map([limit as i64], |row| {
            let operation_json = row.get::<_, String>(3)?;
            let operation = serde_json::from_str(&operation_json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    operation_json.len(),
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(OutboxRow {
                operation_id: row.get(0)?,
                client_sequence: row_sequence(row, 1)?,
                base_server_sequence: row_sequence(row, 2)?,
                operation,
                claimed_at: row.get(4)?,
                next_attempt_at: row.get(5)?,
            })
        })
        .map_err(backend)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(backend)
}

/// Renumber the pending queue to be contiguous from `start` after rows were
/// blocked out of it. Blocked rows were never accepted by the server, and
/// `start` is the pre-removal queue head, so the head still matches the
/// server's next expected client sequence. Ascending updates only ever move a
/// sequence down, which keeps the unique constraint satisfied mid-statement.
fn resequence_outbox(transaction: &Transaction<'_>, start: i64) -> Result<(), StorageError> {
    let mut statement = transaction
        .prepare("SELECT operation_id, client_sequence FROM sync_outbox ORDER BY client_sequence")
        .map_err(backend)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(backend)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(backend)?;
    drop(statement);
    let mut next = start;
    for (operation_id, client_sequence) in rows {
        if client_sequence < next {
            return Err(StorageError::Backend(
                "sync outbox sequences are below the queue head".into(),
            ));
        }
        if client_sequence != next {
            transaction
                .execute(
                    "UPDATE sync_outbox SET client_sequence = ?2 WHERE operation_id = ?1",
                    params![operation_id, next],
                )
                .map_err(backend)?;
        }
        next = next.checked_add(1).ok_or_else(|| {
            StorageError::InvalidOperation("sync client sequence exhausted".into())
        })?;
    }
    transaction
        .execute(
            "UPDATE sync_connection SET next_client_sequence = ?1 WHERE singleton = 1",
            [next],
        )
        .map_err(backend)?;
    Ok(())
}

fn claimed_operation_keys(
    transaction: &Transaction<'_>,
    worker_id: &str,
) -> Result<Vec<(String, u64)>, StorageError> {
    let mut statement = transaction
        .prepare(
            "SELECT operation_id, client_sequence FROM sync_outbox \
             WHERE claimed_by = ?1 ORDER BY client_sequence",
        )
        .map_err(backend)?;
    statement
        .query_map([worker_id], |row| {
            Ok((row.get::<_, String>(0)?, row_sequence(row, 1)?))
        })
        .map_err(backend)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(backend)
}

fn outbox_operation(
    transaction: &Transaction<'_>,
    operation_id: &str,
) -> Result<Option<OutboxRow>, StorageError> {
    transaction
        .query_row(
            "SELECT operation_id, client_sequence, base_server_sequence, operation_json, \
             claimed_at, next_attempt_at FROM sync_outbox WHERE operation_id = ?1",
            [operation_id],
            |row| {
                let operation_json = row.get::<_, String>(3)?;
                let operation = serde_json::from_str(&operation_json).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        operation_json.len(),
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
                Ok(OutboxRow {
                    operation_id: row.get(0)?,
                    client_sequence: row_sequence(row, 1)?,
                    base_server_sequence: row_sequence(row, 2)?,
                    operation,
                    claimed_at: row.get(4)?,
                    next_attempt_at: row.get(5)?,
                })
            },
        )
        .optional()
        .map_err(backend)
}

fn received_operation(
    transaction: &Transaction<'_>,
    operation_id: &str,
) -> Result<Option<ReceivedOperationRow>, StorageError> {
    transaction
        .query_row(
            "SELECT device_id, client_sequence, base_server_sequence, server_sequence, \
             operation_json, outcome FROM sync_received_operations WHERE operation_id = ?1",
            [operation_id],
            |row| {
                Ok(ReceivedOperationRow {
                    device_id: row.get(0)?,
                    client_sequence: row_sequence(row, 1)?,
                    base_server_sequence: row_sequence(row, 2)?,
                    server_sequence: row_sequence(row, 3)?,
                    operation_json: row.get(4)?,
                    outcome: row.get(5)?,
                })
            },
        )
        .optional()
        .map_err(backend)
}

fn operation_id_at_server_sequence(
    transaction: &Transaction<'_>,
    server_sequence: u64,
) -> Result<Option<String>, StorageError> {
    transaction
        .query_row(
            "SELECT operation_id FROM sync_received_operations WHERE server_sequence = ?1",
            [sql_sequence(server_sequence)?],
            |row| row.get(0),
        )
        .optional()
        .map_err(backend)
}

fn require_matching_received(
    operation: &ReplicatedWorkspaceOperation,
    operation_json: &str,
    existing: &ReceivedOperationRow,
) -> Result<(), StorageError> {
    if existing.device_id != operation.device_id
        || existing.client_sequence != operation.client_sequence
        || existing.base_server_sequence != operation.base_server_sequence
        || existing.server_sequence != operation.server_sequence
        || existing.operation_json != operation_json
        || !matches!(
            existing.outcome.as_str(),
            "applied" | "local_echo" | "superseded" | "no_op"
        )
    {
        return Err(StorageError::InvalidOperation(format!(
            "received operation {} was reused with conflicting content",
            operation.operation_id
        )));
    }
    Ok(())
}

#[derive(Clone, Copy)]
enum ReceivedOutcome<'a> {
    Applied,
    LocalEcho,
    NoOp,
    Superseded {
        reason: SyncConflictReason,
        detail: Option<&'a str>,
    },
}

fn insert_received_operation(
    transaction: &Transaction<'_>,
    operation: &ReplicatedWorkspaceOperation,
    operation_json: &str,
    outcome: ReceivedOutcome<'_>,
    received_at: i64,
) -> Result<(), StorageError> {
    let (outcome, reason, detail) = match outcome {
        ReceivedOutcome::Applied => ("applied", None, None),
        ReceivedOutcome::LocalEcho => ("local_echo", None, None),
        ReceivedOutcome::NoOp => ("no_op", None, None),
        ReceivedOutcome::Superseded { reason, detail } => {
            ("superseded", Some(reason.code()), detail)
        }
    };
    transaction
        .execute(
            "INSERT INTO sync_received_operations(\
                operation_id, device_id, client_sequence, base_server_sequence, \
                server_sequence, operation_json, outcome, reason, detail, received_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                operation.operation_id,
                operation.device_id,
                sql_sequence(operation.client_sequence)?,
                sql_sequence(operation.base_server_sequence)?,
                sql_sequence(operation.server_sequence)?,
                operation_json,
                outcome,
                reason,
                detail,
                received_at
            ],
        )
        .map_err(backend)?;
    Ok(())
}

/// Classify a domain/storage failure raised while applying a
/// reconciliation-approved remote operation. Backend and busy failures never
/// reach this mapping.
fn refine_apply_error(operation: &WorkspaceOperation, error: &StorageError) -> SyncConflictReason {
    match error {
        StorageError::RevisionConflict { .. } => SyncConflictReason::ConcurrentDocumentVersion,
        StorageError::NotFound(_) => SyncConflictReason::MissingDependency,
        StorageError::AlreadyExists(_) => SyncConflictReason::IdentityConflict,
        StorageError::InvalidOperation(_)
        | StorageError::UnsupportedProtocol(_)
        | StorageError::Backend(_)
        | StorageError::Busy(_)
        | StorageError::ReleaseRequired(_) => classify_apply_failure(operation),
    }
}

/// Record an operation this device did not take. A losing document body is
/// preserved as a history revision when the note still exists, and a body
/// that lost purely on ordering moves the document head so the note's
/// incorporated sequence stays the greatest one seen.
fn record_superseded(
    transaction: &Transaction<'_>,
    operation: &ReplicatedWorkspaceOperation,
    operation_json: &str,
    reason: SyncConflictReason,
    source_error: Option<&StorageError>,
    received_at: i64,
) -> Result<(), StorageError> {
    let detail = source_error.map(|error| error.diagnostic(DiagnosticContext::Sync).to_string());
    insert_received_operation(
        transaction,
        operation,
        operation_json,
        ReceivedOutcome::Superseded {
            reason,
            detail: detail.as_deref(),
        },
        received_at,
    )?;
    let envelope = replicated_envelope(operation)?;
    let (note_id, markdown) = match &envelope.operation {
        WorkspaceOperation::SaveDocument {
            note_id, markdown, ..
        } => (note_id, markdown),
        WorkspaceOperation::CreateNote { id, markdown, .. } => (id, markdown),
        _ => return Ok(()),
    };
    if current_document_revision(transaction, note_id)?.is_some() {
        preserve_document_version(transaction, note_id, markdown, received_at)?;
    }
    if reason == SyncConflictReason::ConcurrentDocumentVersion {
        advance_document_head_for_note(transaction, note_id, operation.server_sequence)?;
    }
    Ok(())
}

/// Chunked payloads carry their envelope in content storage; the local apply/// Chunked payloads carry their envelope in content storage; the local apply
/// path only accepts operations whose content has already been resolved.
fn replicated_envelope(
    operation: &ReplicatedWorkspaceOperation,
) -> Result<&WorkspaceOperationEnvelope, StorageError> {
    operation.payload.inline_operation().ok_or_else(|| {
        StorageError::InvalidOperation(format!(
            "operation {} references chunked content that must be resolved before it is applied",
            operation.operation_id
        ))
    })
}

/// Attach remote provenance to the tombstones a just-applied delete-family
/// operation created inside this transaction.
fn backfill_tombstone_provenance(
    transaction: &Transaction<'_>,
    operation: &ReplicatedWorkspaceOperation,
) -> Result<(), StorageError> {
    let (kind, id, scope) = match &replicated_envelope(operation)?.operation {
        WorkspaceOperation::DeleteTag { id } => ("tag", id.as_str(), ""),
        WorkspaceOperation::DeletePerson { id } => ("person", id.as_str(), ""),
        WorkspaceOperation::PurgeSubtree { root_id, .. } => ("node", root_id.as_str(), ""),
        WorkspaceOperation::RemoveNoteProperty {
            note_id,
            property_id,
            ..
        } => ("note_property", property_id.as_str(), note_id.as_str()),
        WorkspaceOperation::DeleteNotePropertyTemplate { template_id } => {
            ("property_template", template_id.as_str(), "")
        }
        WorkspaceOperation::DeleteTask { id, .. } => ("task", id.as_str(), ""),
        WorkspaceOperation::DeletePrompt { id } => ("prompt", id.as_str(), ""),
        WorkspaceOperation::DeleteAnnotation { id } => ("annotation", id.as_str(), ""),
        _ => return Ok(()),
    };
    transaction
        .execute(
            "UPDATE sync_tombstones SET operation_id = ?4, server_sequence = ?5 \
             WHERE entity_kind = ?1 AND (entity_id = ?2 OR root_id = ?2) AND scope_id = ?3 \
             AND operation_id IS NULL",
            params![
                kind,
                id,
                scope,
                operation.operation_id,
                sql_sequence(operation.server_sequence)?
            ],
        )
        .map_err(backend)?;
    Ok(())
}

struct NodeFacts {
    kind: String,
    parent_id: Option<String>,
    title: String,
    directly_trashed: bool,
    available: bool,
}

fn node_facts(transaction: &Transaction<'_>, id: &str) -> Result<Option<NodeFacts>, StorageError> {
    let row = transaction
        .query_row(
            "SELECT kind, parent_id, title, deleted_at IS NOT NULL \
             FROM workspace_nodes WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, bool>(3)?,
                ))
            },
        )
        .optional()
        .map_err(backend)?;
    let Some((kind, parent_id, title, directly_trashed)) = row else {
        return Ok(None);
    };
    let available = node_is_available(transaction, id)?;
    Ok(Some(NodeFacts {
        kind,
        parent_id,
        title,
        directly_trashed,
        available,
    }))
}

fn tombstoned(
    transaction: &Transaction<'_>,
    entity_kind: &str,
    entity_id: &str,
    scope_id: &str,
) -> Result<bool, StorageError> {
    transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sync_tombstones \
             WHERE entity_kind = ?1 AND entity_id = ?2 AND scope_id = ?3)",
            params![entity_kind, entity_id, scope_id],
            |row| row.get(0),
        )
        .map_err(backend)
}

fn placement_tombstoned(
    transaction: &Transaction<'_>,
    placement: &NodePlacement,
) -> Result<bool, StorageError> {
    if let Some(parent_id) = placement.parent_id.as_deref()
        && tombstoned(transaction, "node", parent_id, "")?
    {
        return Ok(true);
    }
    match &placement.position {
        NodePosition::Before { anchor_id } | NodePosition::After { anchor_id } => {
            tombstoned(transaction, "node", anchor_id, "")
        }
        NodePosition::First | NodePosition::Last => Ok(false),
    }
}

fn document_references_tombstoned(
    transaction: &Transaction<'_>,
    document_json: &serde_json::Value,
) -> Result<bool, StorageError> {
    for reference in skriuw_domain::document_references(document_json) {
        let kind = match reference.kind {
            skriuw_domain::ReferenceKind::Tag => "tag",
            skriuw_domain::ReferenceKind::Person => "person",
            skriuw_domain::ReferenceKind::Note => "node",
        };
        if tombstoned(transaction, kind, &reference.target_id, "")? {
            return Ok(true);
        }
    }
    Ok(false)
}

fn person_references_tombstoned(
    transaction: &Transaction<'_>,
    fields: &[&skriuw_domain::NotePropertyField],
) -> Result<bool, StorageError> {
    for field in fields {
        if let skriuw_domain::NotePropertyValue::Person(ids) = &field.value.value {
            for id in ids {
                if tombstoned(transaction, "person", id, "")? {
                    return Ok(true);
                }
            }
        }
    }
    Ok(false)
}

fn documents_equivalent(
    stored_json: &str,
    stored_markdown: &str,
    document_json: &serde_json::Value,
    markdown: &str,
) -> bool {
    stored_markdown == markdown
        && serde_json::from_str::<serde_json::Value>(stored_json)
            .is_ok_and(|stored| &stored == document_json)
}

/// The note whose canonical document an operation writes, or `None` for the
/// operations that leave document bodies alone.
fn document_write_target(operation: &WorkspaceOperation) -> Option<&str> {
    match operation {
        WorkspaceOperation::SaveDocument { note_id, .. } => Some(note_id),
        WorkspaceOperation::CreateNote { id, .. } => Some(id),
        _ => None,
    }
}

/// The server sequence of the newest document write this device has already
/// incorporated for a note. Zero means the note's body has never arrived
/// through the log, so nothing in the replicated history constrains it.
fn document_head(transaction: &Transaction<'_>, note_id: &str) -> Result<u64, StorageError> {
    transaction
        .query_row(
            "SELECT server_sequence FROM sync_document_heads WHERE note_id = ?1",
            [note_id],
            |row| row_sequence(row, 0),
        )
        .optional()
        .map_err(backend)
        .map(|sequence| sequence.unwrap_or(0))
}

/// Records that a document write is now part of this device's history. Called
/// for applied, echoed, and already-satisfied operations; a superseded write
/// moves the head through `record_superseded` only when it lost on ordering.
fn advance_document_head(
    transaction: &Transaction<'_>,
    operation: &WorkspaceOperation,
    server_sequence: u64,
) -> Result<(), StorageError> {
    let Some(note_id) = document_write_target(operation) else {
        return Ok(());
    };
    advance_document_head_for_note(transaction, note_id, server_sequence)
}

fn advance_document_head_for_note(
    transaction: &Transaction<'_>,
    note_id: &str,
    server_sequence: u64,
) -> Result<(), StorageError> {
    transaction
        .execute(
            "INSERT INTO sync_document_heads(note_id, server_sequence) VALUES (?1, ?2) \
             ON CONFLICT(note_id) DO UPDATE SET \
             server_sequence = MAX(server_sequence, excluded.server_sequence)",
            params![note_id, sql_sequence(server_sequence)?],
        )
        .map_err(backend)?;
    Ok(())
}

fn current_document_revision(
    transaction: &Transaction<'_>,
    note_id: &str,
) -> Result<Option<i64>, StorageError> {
    transaction
        .query_row(
            "SELECT revision FROM documents WHERE note_id = ?1",
            [note_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(backend)
}

/// A document write from another device carries the author's own revision
/// counter, which no two devices share. The optimistic guard still runs,
/// anchored to the revision this device holds. A note creation whose identity
/// already exists becomes a write of its body: the node record stays as it is.
fn rebase_remote_document(
    transaction: &Transaction<'_>,
    envelope: &WorkspaceOperationEnvelope,
) -> Result<WorkspaceOperationEnvelope, StorageError> {
    let mut rebased = envelope.clone();
    match &envelope.operation {
        WorkspaceOperation::SaveDocument { note_id, .. } => {
            if let Some(current) = current_document_revision(transaction, note_id)?
                && let WorkspaceOperation::SaveDocument {
                    expected_revision, ..
                } = &mut rebased.operation
            {
                *expected_revision = current;
            }
        }
        WorkspaceOperation::CreateNote {
            id,
            document_json,
            markdown,
            at,
            ..
        } if node_is_present(transaction, id)? => {
            let current = current_document_revision(transaction, id)?.ok_or_else(|| {
                StorageError::AlreadyExists(format!("node {id} exists without a document"))
            })?;
            rebased.operation = WorkspaceOperation::SaveDocument {
                note_id: id.clone(),
                document_json: document_json.clone(),
                markdown: markdown.clone(),
                word_count: count_words(markdown),
                expected_revision: current,
                at: *at,
            };
        }
        _ => {}
    }
    Ok(rebased)
}

fn node_is_present(transaction: &Transaction<'_>, id: &str) -> Result<bool, StorageError> {
    transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM workspace_nodes WHERE id = ?1)",
            [id],
            |row| row.get(0),
        )
        .map_err(backend)
}

/// Apply one reconciliation-approved remote envelope inside its own savepoint
/// so a semantic failure leaves the transaction clean for the next operation.
fn apply_remote_envelope(
    transaction: &Transaction<'_>,
    envelope: &WorkspaceOperationEnvelope,
) -> Result<OperationAck, StorageError> {
    transaction
        .execute_batch("SAVEPOINT remote_operation")
        .map_err(backend)?;
    let result = rebase_remote_document(transaction, envelope).and_then(|applied| {
        apply_operations_in_transaction(
            transaction,
            std::slice::from_ref(&applied),
            HistoryProvenance::Remote,
        )
    });
    match result {
        Ok(acknowledgement) => {
            transaction
                .execute_batch("RELEASE remote_operation")
                .map_err(backend)?;
            Ok(acknowledgement)
        }
        Err(error) => {
            transaction
                .execute_batch("ROLLBACK TO remote_operation; RELEASE remote_operation")
                .map_err(backend)?;
            Err(error)
        }
    }
}

/// Whether this device holds a document write for the note that has not
/// reached the log yet, queued in the outbox or parked as a blocked
/// operation. A remote author cannot have seen it, so a remote write is
/// concurrent with it no matter how recent its causal base is.
fn local_document_write_pending(
    transaction: &Transaction<'_>,
    note_id: &str,
) -> Result<bool, StorageError> {
    transaction
        .query_row(
            "SELECT EXISTS(\
                SELECT 1 FROM sync_outbox WHERE \
                (json_extract(operation_json, '$.operation.type') = 'save_document' \
                 AND json_extract(operation_json, '$.operation.noteId') = ?1) \
                OR (json_extract(operation_json, '$.operation.type') = 'create_note' \
                 AND json_extract(operation_json, '$.operation.id') = ?1)\
             ) OR EXISTS(\
                SELECT 1 FROM sync_blocked_operations WHERE resolved_at IS NULL AND (\
                (json_extract(operation_json, '$.operation.type') = 'save_document' \
                 AND json_extract(operation_json, '$.operation.noteId') = ?1) \
                OR (json_extract(operation_json, '$.operation.type') = 'create_note' \
                 AND json_extract(operation_json, '$.operation.id') = ?1))\
             )",
            [note_id],
            |row| row.get(0),
        )
        .map_err(backend)
}

fn fill_document_ordering(
    transaction: &Transaction<'_>,
    state: &mut RemoteTargetState,
    note_id: &str,
    server_sequence: u64,
) -> Result<(), StorageError> {
    state.local_write_pending = local_document_write_pending(transaction, note_id)?;
    state.incoming_outranks_head = server_sequence > document_head(transaction, note_id)?;
    Ok(())
}

/// Gather the facts the domain reconciliation rules need for one validated
/// replicated operation. Facts only; every policy decision stays in
/// `skriuw_domain::reconcile_remote_operation`.
fn remote_target_state(
    transaction: &Transaction<'_>,
    operation: &WorkspaceOperation,
    server_sequence: u64,
) -> Result<RemoteTargetState, StorageError> {
    let mut state = RemoteTargetState::default();
    match operation {
        WorkspaceOperation::CreateTag { tag } => {
            state.target_tombstoned = tombstoned(transaction, "tag", &tag.id, "")?;
            let existing = transaction
                .query_row(
                    "SELECT name, color FROM workspace_tags WHERE id = ?1",
                    [&tag.id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
                )
                .optional()
                .map_err(backend)?;
            if let Some((name, color)) = existing {
                state.target_exists = true;
                state.state_equivalent = name == tag.name && color == tag.color;
            }
        }
        WorkspaceOperation::RenameTag { id, name } => {
            state.target_tombstoned = tombstoned(transaction, "tag", id, "")?;
            let existing = transaction
                .query_row(
                    "SELECT name FROM workspace_tags WHERE id = ?1",
                    [id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(backend)?;
            if let Some(current) = existing {
                state.target_exists = true;
                state.state_equivalent = current == *name;
            }
        }
        WorkspaceOperation::RecolorTag { id, color } => {
            state.target_tombstoned = tombstoned(transaction, "tag", id, "")?;
            let existing = transaction
                .query_row(
                    "SELECT color FROM workspace_tags WHERE id = ?1",
                    [id],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()
                .map_err(backend)?;
            if let Some(current) = existing {
                state.target_exists = true;
                state.state_equivalent = current == *color;
            }
        }
        WorkspaceOperation::DeleteTag { id } => {
            state.target_tombstoned = tombstoned(transaction, "tag", id, "")?;
            state.target_exists = entity_exists(transaction, "workspace_tags", id)?;
        }
        WorkspaceOperation::CreatePerson { person } => {
            state.target_tombstoned = tombstoned(transaction, "person", &person.id, "")?;
            let existing = transaction
                .query_row(
                    "SELECT name, initials, color, note FROM workspace_people WHERE id = ?1",
                    [&person.id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, Option<String>>(2)?,
                            row.get::<_, Option<String>>(3)?,
                        ))
                    },
                )
                .optional()
                .map_err(backend)?;
            if let Some((name, initials, color, note)) = existing {
                state.target_exists = true;
                state.state_equivalent = name == person.name
                    && initials == person.initials
                    && color == person.color
                    && note == person.note;
            }
        }
        WorkspaceOperation::RenamePerson { id, name } => {
            state.target_tombstoned = tombstoned(transaction, "person", id, "")?;
            let existing = transaction
                .query_row(
                    "SELECT name FROM workspace_people WHERE id = ?1",
                    [id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(backend)?;
            if let Some(current) = existing {
                state.target_exists = true;
                state.state_equivalent = current == *name;
            }
        }
        WorkspaceOperation::RecolorPerson { id, color } => {
            state.target_tombstoned = tombstoned(transaction, "person", id, "")?;
            let existing = transaction
                .query_row(
                    "SELECT color FROM workspace_people WHERE id = ?1",
                    [id],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()
                .map_err(backend)?;
            if let Some(current) = existing {
                state.target_exists = true;
                state.state_equivalent = current == *color;
            }
        }
        WorkspaceOperation::DeletePerson { id } => {
            state.target_tombstoned = tombstoned(transaction, "person", id, "")?;
            state.target_exists = entity_exists(transaction, "workspace_people", id)?;
        }
        WorkspaceOperation::CreateFolder {
            id,
            title,
            placement,
            ..
        } => {
            state.target_tombstoned = tombstoned(transaction, "node", id, "")?;
            state.dependency_tombstoned = placement_tombstoned(transaction, placement)?;
            if let Some(node) = node_facts(transaction, id)? {
                state.target_exists = true;
                state.state_equivalent = node.kind == "folder"
                    && node.title == *title
                    && node.parent_id == placement.parent_id;
            }
        }
        WorkspaceOperation::CreateNote {
            id,
            placement,
            document_json,
            markdown,
            ..
        } => {
            state.target_tombstoned = tombstoned(transaction, "node", id, "")?;
            state.dependency_tombstoned = placement_tombstoned(transaction, placement)?
                || document_references_tombstoned(transaction, document_json)?;
            if let Some(node) = node_facts(transaction, id)? {
                state.target_exists = true;
                state.target_trashed = !node.available;
                let document = transaction
                    .query_row(
                        "SELECT document_json, markdown FROM documents WHERE note_id = ?1",
                        [id],
                        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                    )
                    .optional()
                    .map_err(backend)?;
                state.state_equivalent = node.kind == "note"
                    && document.is_some_and(|(stored_json, stored_markdown)| {
                        documents_equivalent(
                            &stored_json,
                            &stored_markdown,
                            document_json,
                            markdown,
                        )
                    });
                fill_document_ordering(transaction, &mut state, id, server_sequence)?;
            }
        }
        WorkspaceOperation::RenameNode { id, title, .. } => {
            fill_node_target(transaction, &mut state, id)?;
            if let Some(node) = node_facts(transaction, id)? {
                state.state_equivalent = node.title == *title;
            }
        }
        WorkspaceOperation::SetNoteCover { note_id, .. }
        | WorkspaceOperation::SetNoteCoverFullWidth { note_id, .. }
        | WorkspaceOperation::SetNoteCoverTransform { note_id, .. } => {
            fill_node_target(transaction, &mut state, note_id)?;
        }
        WorkspaceOperation::MoveNode { id, placement, .. } => {
            fill_node_target(transaction, &mut state, id)?;
            state.dependency_tombstoned = placement_tombstoned(transaction, placement)?;
        }
        WorkspaceOperation::SetNodePinned { id, .. } => {
            fill_node_target(transaction, &mut state, id)?;
        }
        WorkspaceOperation::SaveDocument {
            note_id,
            document_json,
            markdown,
            ..
        } => {
            fill_node_target(transaction, &mut state, note_id)?;
            state.dependency_tombstoned =
                document_references_tombstoned(transaction, document_json)?;
            let document = transaction
                .query_row(
                    "SELECT document_json, markdown FROM documents WHERE note_id = ?1",
                    [note_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()
                .map_err(backend)?;
            if let Some((stored_json, stored_markdown)) = document {
                state.state_equivalent =
                    documents_equivalent(&stored_json, &stored_markdown, document_json, markdown);
                fill_document_ordering(transaction, &mut state, note_id, server_sequence)?;
            } else {
                state.target_exists = false;
            }
        }
        WorkspaceOperation::TrashSubtree { root_id, .. } => {
            state.target_tombstoned = tombstoned(transaction, "node", root_id, "")?;
            if let Some(node) = node_facts(transaction, root_id)? {
                state.target_exists = true;
                state.state_equivalent = node.directly_trashed;
            }
        }
        WorkspaceOperation::RestoreSubtree {
            root_id, placement, ..
        } => {
            state.target_tombstoned = tombstoned(transaction, "node", root_id, "")?;
            state.dependency_tombstoned = placement_tombstoned(transaction, placement)?;
            state.target_exists = node_facts(transaction, root_id)?.is_some();
        }
        WorkspaceOperation::PurgeSubtree { root_id, .. } => {
            state.target_tombstoned = tombstoned(transaction, "node", root_id, "")?;
            state.target_exists = node_facts(transaction, root_id)?.is_some();
        }
        WorkspaceOperation::SetNoteProperty { property, .. } => {
            fill_node_target(transaction, &mut state, &property.note_id)?;
            state.target_tombstoned = state.target_tombstoned
                || tombstoned(
                    transaction,
                    "note_property",
                    &property.field.id,
                    &property.note_id,
                )?;
            state.dependency_tombstoned =
                person_references_tombstoned(transaction, &[&property.field])?;
        }
        WorkspaceOperation::RemoveNoteProperty {
            note_id,
            property_id,
            ..
        } => {
            state.target_tombstoned =
                tombstoned(transaction, "note_property", property_id, note_id)?;
            state.dependency_tombstoned = tombstoned(transaction, "node", note_id, "")?;
            state.target_exists = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM note_properties \
                     WHERE note_id = ?1 AND id = ?2)",
                    params![note_id, property_id],
                    |row| row.get(0),
                )
                .map_err(backend)?;
        }
        WorkspaceOperation::ReorderNoteProperties {
            note_id,
            ordered_property_ids,
            ..
        } => {
            fill_node_target(transaction, &mut state, note_id)?;
            let mut statement = transaction
                .prepare("SELECT id FROM note_properties WHERE note_id = ?1 ORDER BY position")
                .map_err(backend)?;
            let current = statement
                .query_map([note_id], |row| row.get::<_, String>(0))
                .map_err(backend)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(backend)?;
            state.state_equivalent = current == *ordered_property_ids;
        }
        WorkspaceOperation::SetNotePropertyTemplate { template } => {
            state.target_tombstoned =
                tombstoned(transaction, "property_template", &template.id, "")?;
            state.dependency_tombstoned = person_references_tombstoned(
                transaction,
                &template.properties.iter().collect::<Vec<_>>(),
            )?;
        }
        WorkspaceOperation::DeleteNotePropertyTemplate { template_id } => {
            state.target_tombstoned =
                tombstoned(transaction, "property_template", template_id, "")?;
            state.target_exists =
                entity_exists(transaction, "note_property_templates", template_id)?;
        }
        WorkspaceOperation::ReorderNotePropertyTemplates {
            ordered_template_ids,
        } => {
            let mut statement = transaction
                .prepare("SELECT id FROM note_property_templates ORDER BY position")
                .map_err(backend)?;
            let current = statement
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(backend)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(backend)?;
            state.state_equivalent = current == *ordered_template_ids;
        }
        WorkspaceOperation::AttachImage { image } => {
            state.dependency_tombstoned = tombstoned(transaction, "node", &image.note_id, "")?;
            let existing = transaction
                .query_row(
                    "SELECT note_id, content_hash, mime_type, byte_size, width, height, created_at \
                     FROM note_images WHERE id = ?1",
                    [&image.id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, i64>(3)?,
                            row.get::<_, Option<i64>>(4)?,
                            row.get::<_, Option<i64>>(5)?,
                            row.get::<_, i64>(6)?,
                        ))
                    },
                )
                .optional()
                .map_err(backend)?;
            if let Some((note_id, content_hash, mime_type, byte_size, width, height, created_at)) =
                existing
            {
                state.target_exists = true;
                state.state_equivalent = note_id == image.note_id
                    && content_hash == image.content_hash
                    && mime_type == image.mime_type
                    && byte_size == image.byte_size
                    && width == image.width
                    && height == image.height
                    && created_at == image.created_at;
            }
        }
        WorkspaceOperation::CreateTask { task }
        | WorkspaceOperation::PromoteChecklistTask { task, .. } => {
            state.target_tombstoned = tombstoned(transaction, "task", &task.id, "")?;
            state.dependency_tombstoned = task
                .source
                .as_ref()
                .map(|source| tombstoned(transaction, "node", &source.note_id, ""))
                .transpose()?
                .unwrap_or(false);
            state.target_exists = task_exists(transaction, &task.id)?;
        }
        WorkspaceOperation::UpdateTask { task, .. } => {
            state.target_tombstoned = tombstoned(transaction, "task", &task.id, "")?;
            state.target_exists = task_exists(transaction, &task.id)?;
        }
        WorkspaceOperation::DeleteTask { id, .. } | WorkspaceOperation::DetachTask { id, .. } => {
            state.target_tombstoned = tombstoned(transaction, "task", id, "")?;
            state.target_exists = task_exists(transaction, id)?;
        }
        WorkspaceOperation::CreateAnnotation { annotation } => {
            state.target_tombstoned = tombstoned(transaction, "annotation", &annotation.id, "")?;
            state.dependency_tombstoned = tombstoned(transaction, "node", &annotation.note_id, "")?;
            state.target_exists = annotation_exists(transaction, &annotation.id)?;
        }
        WorkspaceOperation::AddAnnotationComment { annotation_id, .. }
        | WorkspaceOperation::UpdateAnnotationComment { annotation_id, .. }
        | WorkspaceOperation::DeleteAnnotationComment { annotation_id, .. } => {
            state.target_tombstoned = tombstoned(transaction, "annotation", annotation_id, "")?;
            state.target_exists = annotation_exists(transaction, annotation_id)?;
        }
        WorkspaceOperation::ResolveAnnotation { id, .. }
        | WorkspaceOperation::ReopenAnnotation { id }
        | WorkspaceOperation::DeleteAnnotation { id } => {
            state.target_tombstoned = tombstoned(transaction, "annotation", id, "")?;
            state.target_exists = annotation_exists(transaction, id)?;
        }
        WorkspaceOperation::SetPrompt { prompt } => {
            state.target_tombstoned = tombstoned(transaction, "prompt", &prompt.id, "")?;
            state.target_exists = entity_exists(transaction, "workspace_prompts", &prompt.id)?;
        }
        WorkspaceOperation::DeletePrompt { id } => {
            state.target_tombstoned = tombstoned(transaction, "prompt", id, "")?;
            state.target_exists = entity_exists(transaction, "workspace_prompts", id)?;
        }
        WorkspaceOperation::SetActiveNote { .. }
        | WorkspaceOperation::UpdateSettings { .. }
        | WorkspaceOperation::RecordProviderImport { .. } => {}
    }
    Ok(state)
}

fn annotation_exists(transaction: &Transaction<'_>, id: &str) -> Result<bool, StorageError> {
    transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM note_annotations WHERE id = ?1)",
            [id],
            |row| row.get(0),
        )
        .map_err(backend)
}

fn task_exists(transaction: &Transaction<'_>, id: &str) -> Result<bool, StorageError> {
    transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM workspace_tasks WHERE id = ?1)",
            [id],
            |row| row.get(0),
        )
        .map_err(backend)
}

fn fill_node_target(
    transaction: &Transaction<'_>,
    state: &mut RemoteTargetState,
    id: &str,
) -> Result<(), StorageError> {
    state.target_tombstoned = tombstoned(transaction, "node", id, "")?;
    if let Some(node) = node_facts(transaction, id)? {
        state.target_exists = true;
        state.target_trashed = !node.available;
    }
    Ok(())
}

fn entity_exists(
    transaction: &Transaction<'_>,
    table: &str,
    id: &str,
) -> Result<bool, StorageError> {
    let query = match table {
        "workspace_tags" => "SELECT EXISTS(SELECT 1 FROM workspace_tags WHERE id = ?1)",
        "workspace_people" => "SELECT EXISTS(SELECT 1 FROM workspace_people WHERE id = ?1)",
        "note_property_templates" => {
            "SELECT EXISTS(SELECT 1 FROM note_property_templates WHERE id = ?1)"
        }
        "workspace_prompts" => "SELECT EXISTS(SELECT 1 FROM workspace_prompts WHERE id = ?1)",
        _ => return Err(StorageError::Backend("unknown existence table".into())),
    };
    transaction
        .query_row(query, [id], |row| row.get(0))
        .map_err(backend)
}

fn sync_validation(error: SyncValidationError) -> StorageError {
    StorageError::InvalidOperation(error.to_string())
}

fn sql_sequence(sequence: u64) -> Result<i64, StorageError> {
    i64::try_from(sequence)
        .map_err(|_| StorageError::InvalidOperation("sync sequence exceeds SQLite range".into()))
}

fn row_sequence(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<u64> {
    let value = row.get::<_, i64>(index)?;
    u64::try_from(value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            index,
            rusqlite::types::Type::Integer,
            Box::new(error),
        )
    })
}
