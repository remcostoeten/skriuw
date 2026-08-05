use rusqlite::{OptionalExtension, Transaction, TransactionBehavior, params};
use skriuw_domain::{
    ClientSyncOperation, DocumentConflictResolutionChoice, NodeKind, NodePlacement, NodePosition,
    OperationAck, RemoteOperationDecision, RemoteTargetState, ReplicatedWorkspaceOperation,
    ResolveDocumentConflict, SyncConflictReason, SyncOperationPayload, SyncReplicationClass,
    SyncValidationError, WORKSPACE_SYNC_PROTOCOL_VERSION, WorkspaceArchive, WorkspaceOperation,
    WorkspaceOperationEnvelope, classify_apply_failure, reconcile_remote_operation,
    validate_sync_identifier, validate_sync_sequence,
};
use skriuw_storage::{
    BlockedSyncOperation, Diagnostic, DiagnosticContext, DocumentConflictSummary,
    DocumentConflictVersion, DocumentConflictVersions, ImportSummary, NewSyncConnection,
    PendingSyncBatch, RemoteSyncApplyOutcome, StorageError, SyncConflict, SyncConnection,
    SyncTombstone, WorkspaceSyncQueue,
};
use uuid::Uuid;

use crate::SqliteWorkspace;
use crate::error::{backend, json_backend};
use crate::operations::{
    apply_operations_in_transaction, count_words, node_is_available, require_worker,
    validate_operations,
};
use crate::queries::read_snapshot;

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
                        "local_echo",
                        None,
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

    fn has_pending_sync_operations(&self) -> Result<bool, StorageError> {
        let connection = self.lock()?;
        connection
            .query_row("SELECT EXISTS(SELECT 1 FROM sync_outbox)", [], |row| {
                row.get::<_, bool>(0)
            })
            .map_err(backend)
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
                    "local_echo",
                    None,
                    received_at,
                )?;
                transaction
                    .execute(
                        "DELETE FROM sync_outbox WHERE operation_id = ?1",
                        [&operation.operation_id],
                    )
                    .map_err(backend)?;
                cursor = operation.server_sequence;
                outcomes.push(RemoteSyncApplyOutcome::LocalEcho);
                continue;
            }

            if operation.device_id == active.device_id {
                return Err(StorageError::InvalidOperation(format!(
                    "local echo {} has no matching outbound operation",
                    operation.operation_id
                )));
            }

            let reconcile_state = remote_target_state(&transaction, &envelope.operation)?;
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
                        "no_op",
                        None,
                        received_at,
                    )?;
                    cursor = operation.server_sequence;
                    outcomes.push(RemoteSyncApplyOutcome::NoOp);
                }
                RemoteOperationDecision::Conflict { reason } => {
                    let conflict = record_semantic_conflict(
                        &transaction,
                        operation,
                        &operation_json,
                        reason,
                        None,
                        received_at,
                    )?;
                    insert_received_operation(
                        &transaction,
                        operation,
                        &operation_json,
                        "conflict",
                        Some(&conflict.id),
                        received_at,
                    )?;
                    cursor = operation.server_sequence;
                    outcomes.push(RemoteSyncApplyOutcome::Conflict(conflict));
                }
                RemoteOperationDecision::Apply => {
                    transaction
                        .execute_batch("SAVEPOINT remote_operation")
                        .map_err(backend)?;
                    match apply_operations_in_transaction(
                        &transaction,
                        std::slice::from_ref(envelope),
                    ) {
                        Ok(acknowledgement) => {
                            transaction
                                .execute_batch("RELEASE remote_operation")
                                .map_err(backend)?;
                            backfill_tombstone_provenance(&transaction, operation)?;
                            insert_received_operation(
                                &transaction,
                                operation,
                                &operation_json,
                                "applied",
                                None,
                                received_at,
                            )?;
                            cursor = operation.server_sequence;
                            outcomes.push(RemoteSyncApplyOutcome::Applied(acknowledgement));
                        }
                        Err(StorageError::Backend(message)) => {
                            transaction
                                .execute_batch(
                                    "ROLLBACK TO remote_operation; RELEASE remote_operation",
                                )
                                .map_err(backend)?;
                            return Err(StorageError::Backend(message));
                        }
                        Err(error) => {
                            transaction
                                .execute_batch(
                                    "ROLLBACK TO remote_operation; RELEASE remote_operation",
                                )
                                .map_err(backend)?;
                            let reason = refine_apply_error(&envelope.operation, &error);
                            let conflict = record_semantic_conflict(
                                &transaction,
                                operation,
                                &operation_json,
                                reason,
                                Some(&error),
                                received_at,
                            )?;
                            insert_received_operation(
                                &transaction,
                                operation,
                                &operation_json,
                                "conflict",
                                Some(&conflict.id),
                                received_at,
                            )?;
                            cursor = operation.server_sequence;
                            outcomes.push(RemoteSyncApplyOutcome::Conflict(conflict));
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

    fn sync_conflicts(&self) -> Result<Vec<SyncConflict>, StorageError> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT id, operation_id, operation_type, server_sequence, reason_code, \
                 subreason, message, created_at FROM sync_conflicts WHERE resolved_at IS NULL \
                 ORDER BY server_sequence",
            )
            .map_err(backend)?;
        statement
            .query_map([], read_conflict)
            .map_err(backend)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(backend)
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

    fn document_conflicts(&self) -> Result<Vec<DocumentConflictSummary>, StorageError> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT d.conflict_id, d.note_id, d.remote_title, d.local_title, \
                 c.reason_code, c.subreason, c.server_sequence, c.created_at, \
                 d.local_document_json IS NOT NULL, d.resolved_choice, d.resolved_at \
                 FROM sync_document_conflicts d \
                 JOIN sync_conflicts c ON c.id = d.conflict_id \
                 ORDER BY c.server_sequence",
            )
            .map_err(backend)?;
        statement
            .query_map([], |row| {
                Ok(DocumentConflictSummary {
                    conflict_id: row.get(0)?,
                    note_id: row.get(1)?,
                    remote_title: row.get(2)?,
                    local_title: row.get(3)?,
                    reason_code: row.get(4)?,
                    subreason: row.get(5)?,
                    server_sequence: row_sequence(row, 6)?,
                    created_at: row.get(7)?,
                    local_version_available: row.get(8)?,
                    resolved_choice: row.get(9)?,
                    resolved_at: row.get(10)?,
                })
            })
            .map_err(backend)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(backend)
    }

    fn document_conflict_versions(
        &self,
        conflict_id: &str,
    ) -> Result<DocumentConflictVersions, StorageError> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT note_id, remote_title, remote_document_json, remote_markdown, \
                 local_title, local_document_json, local_markdown, local_revision \
                 FROM sync_document_conflicts WHERE conflict_id = ?1",
                [conflict_id],
                |row| {
                    let local = match (
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                    ) {
                        (Some(document_json), Some(markdown)) => Some(DocumentConflictVersion {
                            title: row.get(4)?,
                            document_json,
                            markdown,
                            revision: row.get(7)?,
                        }),
                        _ => None,
                    };
                    Ok(DocumentConflictVersions {
                        conflict_id: conflict_id.into(),
                        note_id: row.get(0)?,
                        remote: DocumentConflictVersion {
                            title: row.get(1)?,
                            document_json: row.get(2)?,
                            markdown: row.get(3)?,
                            revision: None,
                        },
                        local,
                    })
                },
            )
            .optional()
            .map_err(backend)?
            .ok_or_else(|| StorageError::NotFound(conflict_id.into()))
    }

    fn resolve_document_conflict(
        &self,
        request: &ResolveDocumentConflict,
    ) -> Result<Option<OperationAck>, StorageError> {
        validate_sync_identifier("conflict id", &request.conflict_id).map_err(sync_validation)?;
        if request.at < 0 {
            return Err(StorageError::InvalidOperation(
                "conflict resolution time must be non-negative".into(),
            ));
        }
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(backend)?;
        let row = transaction
            .query_row(
                "SELECT d.note_id, d.remote_document_json, d.remote_markdown, \
                 d.resolved_choice, c.created_at \
                 FROM sync_document_conflicts d \
                 JOIN sync_conflicts c ON c.id = d.conflict_id \
                 WHERE d.conflict_id = ?1",
                [&request.conflict_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, i64>(4)?,
                    ))
                },
            )
            .optional()
            .map_err(backend)?;
        let Some((note_id, remote_json, remote_markdown, resolved_choice, created_at)) = row else {
            return Err(StorageError::NotFound(request.conflict_id.clone()));
        };
        if let Some(previous) = resolved_choice {
            if previous == request.choice.code() {
                return Ok(None);
            }
            return Err(StorageError::InvalidOperation(format!(
                "conflict {} was already resolved as {previous}",
                request.conflict_id
            )));
        }

        let chosen = match &request.choice {
            DocumentConflictResolutionChoice::KeepLocal => None,
            DocumentConflictResolutionChoice::KeepRemote => {
                let document_json = serde_json::from_str(&remote_json).map_err(json_backend)?;
                Some((document_json, remote_markdown.clone()))
            }
            DocumentConflictResolutionChoice::Merged {
                document_json,
                markdown,
            } => Some((document_json.clone(), markdown.clone())),
        };

        let mut acknowledgement = None;
        let resolved_revision = match chosen {
            None => transaction
                .query_row(
                    "SELECT revision FROM documents WHERE note_id = ?1",
                    [&note_id],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(backend)?,
            Some((document_json, markdown)) => {
                let current_revision = transaction
                    .query_row(
                        "SELECT revision FROM documents WHERE note_id = ?1",
                        [&note_id],
                        |row| row.get::<_, i64>(0),
                    )
                    .optional()
                    .map_err(backend)?
                    .ok_or_else(|| {
                        StorageError::InvalidOperation(format!(
                            "note {note_id} no longer exists; export the preserved version instead"
                        ))
                    })?;
                let word_count = count_words(&markdown);
                let envelope = WorkspaceOperationEnvelope::v1(WorkspaceOperation::SaveDocument {
                    note_id: note_id.clone(),
                    document_json,
                    markdown,
                    word_count,
                    expected_revision: current_revision,
                    at: request.at,
                });
                let operations = [envelope];
                validate_operations(&operations)?;
                acknowledgement = Some(apply_operations_in_transaction(&transaction, &operations)?);
                enqueue_sync_operations(&transaction, &operations)?;
                Some(current_revision + 1)
            }
        };

        let resolved_at = request.at.max(created_at);
        let (resolved_json, resolved_markdown) = match &request.choice {
            DocumentConflictResolutionChoice::KeepLocal => transaction
                .query_row(
                    "SELECT local_document_json, local_markdown \
                     FROM sync_document_conflicts WHERE conflict_id = ?1",
                    [&request.conflict_id],
                    |row| {
                        Ok((
                            row.get::<_, Option<String>>(0)?,
                            row.get::<_, Option<String>>(1)?,
                        ))
                    },
                )
                .map_err(backend)?,
            DocumentConflictResolutionChoice::KeepRemote => {
                (Some(remote_json), Some(remote_markdown))
            }
            DocumentConflictResolutionChoice::Merged {
                document_json,
                markdown,
            } => (Some(document_json.to_string()), Some(markdown.clone())),
        };
        transaction
            .execute(
                "UPDATE sync_document_conflicts SET resolved_choice = ?2, \
                 resolved_document_json = ?3, resolved_markdown = ?4, \
                 resolved_revision = ?5, resolved_at = ?6 WHERE conflict_id = ?1",
                params![
                    request.conflict_id,
                    request.choice.code(),
                    resolved_json,
                    resolved_markdown,
                    resolved_revision,
                    resolved_at
                ],
            )
            .map_err(backend)?;
        transaction
            .execute(
                "UPDATE sync_conflicts SET resolved_at = ?2 WHERE id = ?1",
                params![request.conflict_id, resolved_at],
            )
            .map_err(backend)?;
        transaction.commit().map_err(backend)?;
        Ok(acknowledgement)
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

        let connection = self.lock()?;
        let active = read_active_connection(&connection)?.ok_or_else(|| {
            StorageError::InvalidOperation(
                "checkpoint hydration requires an active sync connection".into(),
            )
        })?;
        if active.observed_server_sequence != 0 {
            return Err(StorageError::InvalidOperation(
                "checkpoint hydration is only allowed before the first pull".into(),
            ));
        }
        let pending = connection
            .query_row("SELECT EXISTS(SELECT 1 FROM sync_outbox)", [], |row| {
                row.get::<_, bool>(0)
            })
            .map_err(backend)?;
        if pending {
            return Err(StorageError::InvalidOperation(
                "checkpoint hydration cannot discard pending local operations".into(),
            ));
        }
        drop(connection);

        let summary = self.replace_workspace_from_archive(archive, true)?;
        let connection = self.lock()?;
        connection
            .execute(
                "UPDATE sync_connection SET observed_server_sequence = ?1 WHERE singleton = 1",
                params![sql_sequence(checkpoint_server_sequence)?],
            )
            .map_err(backend)?;
        Ok(summary)
    }
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
             next_client_sequence FROM sync_connection \
             WHERE singleton = 1 AND disconnected_at IS NULL",
            [],
            |row| {
                Ok(SyncConnection {
                    workspace_id: row.get(0)?,
                    device_id: row.get(1)?,
                    connected_at: row.get(2)?,
                    observed_server_sequence: row_sequence(row, 3)?,
                    next_client_sequence: row_sequence(row, 4)?,
                })
            },
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
             next_client_sequence FROM sync_connection WHERE singleton = 1",
            [],
            |row| {
                Ok(SyncConnection {
                    workspace_id: row.get(0)?,
                    device_id: row.get(1)?,
                    connected_at: row.get(2)?,
                    observed_server_sequence: row_sequence(row, 3)?,
                    next_client_sequence: row_sequence(row, 4)?,
                })
            },
        )
        .optional()
        .map_err(backend)
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
            "applied" | "local_echo" | "conflict" | "no_op"
        )
    {
        return Err(StorageError::InvalidOperation(format!(
            "received operation {} was reused with conflicting content",
            operation.operation_id
        )));
    }
    Ok(())
}

fn insert_received_operation(
    transaction: &Transaction<'_>,
    operation: &ReplicatedWorkspaceOperation,
    operation_json: &str,
    outcome: &str,
    conflict_id: Option<&str>,
    received_at: i64,
) -> Result<(), StorageError> {
    transaction
        .execute(
            "INSERT INTO sync_received_operations(\
                operation_id, device_id, client_sequence, base_server_sequence, \
                server_sequence, operation_json, outcome, conflict_id, received_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                operation.operation_id,
                operation.device_id,
                sql_sequence(operation.client_sequence)?,
                sql_sequence(operation.base_server_sequence)?,
                sql_sequence(operation.server_sequence)?,
                operation_json,
                outcome,
                conflict_id,
                received_at
            ],
        )
        .map_err(backend)?;
    Ok(())
}

/// Classify a domain/storage failure raised while applying a
/// reconciliation-approved remote operation. Backend failures never reach
/// this mapping.
fn refine_apply_error(operation: &WorkspaceOperation, error: &StorageError) -> SyncConflictReason {
    match error {
        StorageError::RevisionConflict { .. } => SyncConflictReason::ConcurrentDocumentVersion,
        StorageError::NotFound(_) => SyncConflictReason::MissingDependency,
        StorageError::AlreadyExists(_) => SyncConflictReason::IdentityConflict,
        StorageError::InvalidOperation(_)
        | StorageError::UnsupportedProtocol(_)
        | StorageError::Backend(_) => classify_apply_failure(operation),
    }
}

/// Durably preserve a semantic conflict before the cursor advances. For
/// divergent document operations the complete remote version and the current
/// local version are stored beside the bounded diagnostic.
fn record_semantic_conflict(
    transaction: &Transaction<'_>,
    operation: &ReplicatedWorkspaceOperation,
    operation_json: &str,
    reason: SyncConflictReason,
    source_error: Option<&StorageError>,
    created_at: i64,
) -> Result<SyncConflict, StorageError> {
    if let Some(StorageError::Backend(_)) = source_error {
        return Err(StorageError::Backend(
            "backend failures cannot become sync conflicts".into(),
        ));
    }
    let message = match source_error {
        Some(error) => error.diagnostic(DiagnosticContext::Sync).to_string(),
        None => Diagnostic::new(
            DiagnosticContext::Sync,
            skriuw_storage::DiagnosticCategory::Conflict,
            reason.code(),
        )
        .to_string(),
    };
    let conflict = SyncConflict {
        id: Uuid::new_v4().to_string(),
        operation_id: operation.operation_id.clone(),
        operation_type: replicated_envelope(operation)?
            .operation
            .sync_policy()
            .operation_type
            .into(),
        server_sequence: operation.server_sequence,
        reason_code: reason.broad_code().into(),
        subreason: reason.subreason_code().map(str::to_owned),
        message,
        created_at,
    };
    transaction
        .execute(
            "INSERT INTO sync_conflicts(\
                id, operation_id, operation_type, server_sequence, reason_code, subreason, \
                operation_json, message, created_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                conflict.id,
                conflict.operation_id,
                conflict.operation_type,
                sql_sequence(conflict.server_sequence)?,
                conflict.reason_code,
                conflict.subreason,
                operation_json,
                conflict.message,
                conflict.created_at
            ],
        )
        .map_err(backend)?;
    preserve_document_versions(
        transaction,
        &conflict.id,
        &replicated_envelope(operation)?.operation,
    )?;
    Ok(conflict)
}

/// Store both complete document versions for a conflicting `SaveDocument` or
/// `CreateNote` so no user content is lost when the cursor advances.
fn preserve_document_versions(
    transaction: &Transaction<'_>,
    conflict_id: &str,
    operation: &WorkspaceOperation,
) -> Result<(), StorageError> {
    let (note_id, remote_title, remote_json, remote_markdown, remote_word_count, expected, at) =
        match operation {
            WorkspaceOperation::SaveDocument {
                note_id,
                document_json,
                markdown,
                word_count,
                expected_revision,
                at,
            } => (
                note_id,
                None,
                document_json,
                markdown,
                *word_count,
                Some(*expected_revision),
                *at,
            ),
            WorkspaceOperation::CreateNote {
                id,
                title,
                document_json,
                markdown,
                at,
                ..
            } => (
                id,
                Some(title.clone()),
                document_json,
                markdown,
                count_words(markdown),
                None,
                *at,
            ),
            _ => return Ok(()),
        };
    let local = transaction
        .query_row(
            "SELECT nodes.title, documents.document_json, documents.markdown, \
             documents.revision \
             FROM documents JOIN workspace_nodes nodes ON nodes.id = documents.note_id \
             WHERE documents.note_id = ?1",
            [note_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()
        .map_err(backend)?;
    let (local_title, local_json, local_markdown, local_revision) = match local {
        Some((title, json, markdown, revision)) => {
            (Some(title), Some(json), Some(markdown), Some(revision))
        }
        None => (None, None, None, None),
    };
    transaction
        .execute(
            "INSERT INTO sync_document_conflicts(\
                conflict_id, note_id, remote_title, remote_document_json, remote_markdown, \
                remote_word_count, remote_expected_revision, remote_at, local_title, \
                local_document_json, local_markdown, local_revision\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                conflict_id,
                note_id,
                remote_title,
                remote_json.to_string(),
                remote_markdown,
                remote_word_count,
                expected,
                at,
                local_title,
                local_json,
                local_markdown,
                local_revision
            ],
        )
        .map_err(backend)?;
    Ok(())
}

/// Chunked payloads carry their envelope in content storage; the local apply
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

fn read_conflict(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncConflict> {
    Ok(SyncConflict {
        id: row.get(0)?,
        operation_id: row.get(1)?,
        operation_type: row.get(2)?,
        server_sequence: row_sequence(row, 3)?,
        reason_code: row.get(4)?,
        subreason: row.get(5)?,
        message: row.get(6)?,
        created_at: row.get(7)?,
    })
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

/// Gather the facts the domain reconciliation rules need for one validated
/// replicated operation. Facts only; every policy decision stays in
/// `skriuw_domain::reconcile_remote_operation`.
fn remote_target_state(
    transaction: &Transaction<'_>,
    operation: &WorkspaceOperation,
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
            title,
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
                let document = transaction
                    .query_row(
                        "SELECT document_json, markdown FROM documents WHERE note_id = ?1",
                        [id],
                        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                    )
                    .optional()
                    .map_err(backend)?;
                state.state_equivalent = node.kind == "note"
                    && node.title == *title
                    && node.parent_id == placement.parent_id
                    && document.is_some_and(|(stored_json, stored_markdown)| {
                        documents_equivalent(
                            &stored_json,
                            &stored_markdown,
                            document_json,
                            markdown,
                        )
                    });
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
            expected_revision,
            ..
        } => {
            fill_node_target(transaction, &mut state, note_id)?;
            state.dependency_tombstoned =
                document_references_tombstoned(transaction, document_json)?;
            let document = transaction
                .query_row(
                    "SELECT document_json, markdown, revision FROM documents WHERE note_id = ?1",
                    [note_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, i64>(2)?,
                        ))
                    },
                )
                .optional()
                .map_err(backend)?;
            if let Some((stored_json, stored_markdown, revision)) = document {
                state.state_equivalent =
                    documents_equivalent(&stored_json, &stored_markdown, document_json, markdown);
                state.document_revision_matches = revision == *expected_revision;
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
        WorkspaceOperation::SetActiveNote { .. }
        | WorkspaceOperation::UpdateSettings { .. }
        | WorkspaceOperation::RecordProviderImport { .. } => {}
    }
    Ok(state)
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
