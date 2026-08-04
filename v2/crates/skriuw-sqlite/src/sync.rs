use rusqlite::{OptionalExtension, Transaction, TransactionBehavior, params};
use skriuw_domain::{
    ClientSyncOperation, ReplicatedWorkspaceOperation, SyncReplicationClass, SyncValidationError,
    WorkspaceOperationEnvelope, validate_sync_identifier, validate_sync_sequence,
};
use skriuw_storage::{
    BlockedSyncOperation, Diagnostic, NewSyncConnection, PendingSyncBatch, RemoteSyncApplyOutcome,
    StorageError, SyncConflict, SyncConnection, WorkspaceSyncQueue,
};
use uuid::Uuid;

use crate::SqliteWorkspace;
use crate::error::{backend, json_backend};
use crate::operations::{apply_operations_in_transaction, require_worker};

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
                    operation: envelope.clone(),
                };
                match operation.validate() {
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
                                    serde_json::to_string(&operation.operation)
                                        .map_err(json_backend)?,
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
                operation: row.operation.clone(),
            };
            let mut prospective = selected.clone();
            prospective.push(candidate.clone());
            if let Err(error) =
                skriuw_domain::SyncPushRequest::v1(active.device_id.clone(), prospective).validate()
            {
                if matches!(error, SyncValidationError::BatchTooLarge { .. })
                    && !selected.is_empty()
                {
                    break;
                }
                return Err(sync_validation(error));
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
        request.validate().map_err(sync_validation)?;
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
                    operation: outbox.operation,
                };
                let operation_json =
                    serde_json::to_string(&replicated.operation).map_err(json_backend)?;
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
            operation.validate().map_err(sync_validation)?;
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
            let operation_json =
                serde_json::to_string(&operation.operation).map_err(json_backend)?;
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

            transaction
                .execute_batch("SAVEPOINT remote_operation")
                .map_err(backend)?;
            match apply_operations_in_transaction(
                &transaction,
                std::slice::from_ref(&operation.operation),
            ) {
                Ok(acknowledgement) => {
                    transaction
                        .execute_batch("RELEASE remote_operation")
                        .map_err(backend)?;
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
                        .execute_batch("ROLLBACK TO remote_operation; RELEASE remote_operation")
                        .map_err(backend)?;
                    return Err(StorageError::Backend(message));
                }
                Err(error) => {
                    transaction
                        .execute_batch("ROLLBACK TO remote_operation; RELEASE remote_operation")
                        .map_err(backend)?;
                    let conflict = insert_sync_conflict(
                        &transaction,
                        operation,
                        &operation_json,
                        &error,
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
                 message, created_at FROM sync_conflicts WHERE resolved_at IS NULL \
                 ORDER BY server_sequence",
            )
            .map_err(backend)?;
        statement
            .query_map([], read_conflict)
            .map_err(backend)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(backend)
    }
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
            "applied" | "local_echo" | "conflict"
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

fn insert_sync_conflict(
    transaction: &Transaction<'_>,
    operation: &ReplicatedWorkspaceOperation,
    operation_json: &str,
    error: &StorageError,
    created_at: i64,
) -> Result<SyncConflict, StorageError> {
    let reason_code = match error {
        StorageError::RevisionConflict { .. } => "revision_conflict",
        StorageError::NotFound(_) => "missing_dependency",
        StorageError::AlreadyExists(_) => "identity_conflict",
        StorageError::InvalidOperation(_) | StorageError::UnsupportedProtocol(_) => {
            "domain_conflict"
        }
        StorageError::Backend(_) => {
            return Err(StorageError::Backend(
                "backend failures cannot become sync conflicts".into(),
            ));
        }
    };
    let conflict = SyncConflict {
        id: Uuid::new_v4().to_string(),
        operation_id: operation.operation_id.clone(),
        operation_type: operation
            .operation
            .operation
            .sync_policy()
            .operation_type
            .into(),
        server_sequence: operation.server_sequence,
        reason_code: reason_code.into(),
        message: error
            .diagnostic(skriuw_storage::DiagnosticContext::Sync)
            .to_string(),
        created_at,
    };
    transaction
        .execute(
            "INSERT INTO sync_conflicts(\
                id, operation_id, operation_type, server_sequence, reason_code, operation_json, \
                message, created_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                conflict.id,
                conflict.operation_id,
                conflict.operation_type,
                sql_sequence(conflict.server_sequence)?,
                conflict.reason_code,
                operation_json,
                conflict.message,
                conflict.created_at
            ],
        )
        .map_err(backend)?;
    Ok(conflict)
}

fn read_conflict(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncConflict> {
    Ok(SyncConflict {
        id: row.get(0)?,
        operation_id: row.get(1)?,
        operation_type: row.get(2)?,
        server_sequence: row_sequence(row, 3)?,
        reason_code: row.get(4)?,
        message: row.get(5)?,
        created_at: row.get(6)?,
    })
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
