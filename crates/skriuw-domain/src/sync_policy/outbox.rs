use super::BlockedSyncReason;
use crate::{
    ClientSyncOperation, SyncOperationPayload, SyncReplicationClass, SyncValidationError,
    WORKSPACE_SYNC_PROTOCOL_VERSION, WorkspaceOperation, WorkspaceOperationEnvelope,
};

/// Where one committed local operation goes in the sync queue.
#[derive(Debug, Clone, PartialEq)]
pub enum OutboxAdmission {
    /// Device-local state that never replicates.
    Skip,
    /// Parked for the recovery surface instead of the outbox.
    Block {
        operation_type: &'static str,
        reason: BlockedSyncReason,
    },
    /// Appended to the outbox as this validated client operation.
    Queue(Box<ClientSyncOperation>),
}

/// Decide whether a committed local operation is skipped, parked, or queued
/// for upload at the given client and base server sequences. An operation
/// that cannot fit any batch is parked as `operation_too_large`; every other
/// validation failure is returned, since it means the queue itself is broken.
pub fn outbox_admission(
    envelope: &WorkspaceOperationEnvelope,
    operation_id: String,
    client_sequence: u64,
    base_server_sequence: u64,
) -> Result<OutboxAdmission, SyncValidationError> {
    let policy = envelope.operation.sync_policy();
    match policy.replication_class {
        SyncReplicationClass::DeviceLocal => Ok(OutboxAdmission::Skip),
        SyncReplicationClass::UnsupportedSyncProtocolV1 => Ok(OutboxAdmission::Block {
            operation_type: policy.operation_type,
            reason: BlockedSyncReason::UnsupportedOperation,
        }),
        SyncReplicationClass::ReplicatedWorkspaceContent => {
            let operation = ClientSyncOperation {
                operation_id,
                client_sequence,
                base_server_sequence,
                payload: SyncOperationPayload::inline(envelope.clone()),
            };
            match operation.validate_queued(WORKSPACE_SYNC_PROTOCOL_VERSION) {
                Ok(()) => Ok(OutboxAdmission::Queue(Box::new(operation))),
                Err(SyncValidationError::OperationTooLarge { .. }) => Ok(OutboxAdmission::Block {
                    operation_type: policy.operation_type,
                    reason: BlockedSyncReason::OperationTooLarge,
                }),
                Err(error) => Err(error),
            }
        }
    }
}

/// The newest outbox row, as far as coalescing needs to know it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OutboxTail<'a> {
    pub operation_type: &'a str,
    pub target_note_id: Option<&'a str>,
    pub claimed: bool,
    pub attempts: i64,
}

/// Whether a plain document save folds into the newest outbox row instead of
/// becoming a row of its own. Only an unclaimed, never-attempted save of the
/// same note qualifies: it has never reached the network, and because it is
/// the tail no later operation can be overtaken by the newer body. The row
/// keeps its identity, sequences, and creation time.
#[must_use]
pub fn coalesces_into_tail(incoming: &WorkspaceOperation, tail: &OutboxTail<'_>) -> bool {
    let WorkspaceOperation::SaveDocument { note_id, .. } = incoming else {
        return false;
    };
    tail.operation_type == incoming.sync_policy().operation_type
        && tail.target_note_id == Some(note_id.as_str())
        && !tail.claimed
        && tail.attempts == 0
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{OutboxAdmission, OutboxTail, coalesces_into_tail, outbox_admission};
    use crate::{
        MAX_SAFE_SYNC_SEQUENCE, SyncValidationError, WorkspaceOperation, WorkspaceOperationEnvelope,
    };

    const OPERATION_ID: &str = "0b5c4f8e-2a55-4f43-9d0c-6f2f9d4d8a11";

    fn save(note_id: &str, markdown: &str) -> WorkspaceOperation {
        WorkspaceOperation::SaveDocument {
            note_id: note_id.into(),
            document_json: json!({ "type": "doc" }),
            markdown: markdown.into(),
            word_count: 1,
            expected_revision: 1,
            at: 1,
        }
    }

    fn admit(operation: WorkspaceOperation) -> Result<OutboxAdmission, SyncValidationError> {
        outbox_admission(
            &WorkspaceOperationEnvelope::v1(operation),
            OPERATION_ID.into(),
            1,
            0,
        )
    }

    fn tail<'a>(operation_type: &'a str, note_id: &'a str) -> OutboxTail<'a> {
        OutboxTail {
            operation_type,
            target_note_id: Some(note_id),
            claimed: false,
            attempts: 0,
        }
    }

    #[test]
    fn device_local_operations_never_reach_the_queue() {
        let admission = admit(WorkspaceOperation::SetActiveNote {
            note_id: Some("note".into()),
        });
        assert_eq!(admission, Ok(OutboxAdmission::Skip));
    }

    #[test]
    fn replicated_operations_queue_with_the_given_sequences() {
        let Ok(OutboxAdmission::Queue(operation)) = admit(save("note", "body")) else {
            panic!("a document save should queue");
        };
        assert_eq!(operation.operation_id, OPERATION_ID);
        assert_eq!(operation.client_sequence, 1);
        assert_eq!(operation.base_server_sequence, 0);
    }

    #[test]
    fn a_broken_queue_sequence_is_an_error() {
        let admission = outbox_admission(
            &WorkspaceOperationEnvelope::v1(save("note", "body")),
            OPERATION_ID.into(),
            MAX_SAFE_SYNC_SEQUENCE + 1,
            0,
        );
        assert!(admission.is_err());
    }

    #[test]
    fn a_save_folds_into_an_untouched_save_of_the_same_note() {
        let incoming = save("note", "newer");
        assert!(coalesces_into_tail(
            &incoming,
            &tail("save_document", "note")
        ));
    }

    #[test]
    fn a_save_never_folds_into_a_row_the_network_has_seen() {
        let incoming = save("note", "newer");
        let claimed = OutboxTail {
            claimed: true,
            ..tail("save_document", "note")
        };
        let attempted = OutboxTail {
            attempts: 1,
            ..tail("save_document", "note")
        };
        assert!(!coalesces_into_tail(&incoming, &claimed));
        assert!(!coalesces_into_tail(&incoming, &attempted));
    }

    #[test]
    fn only_a_same_note_save_tail_qualifies() {
        let incoming = save("note", "newer");
        assert!(!coalesces_into_tail(
            &incoming,
            &tail("save_document", "other")
        ));
        assert!(!coalesces_into_tail(
            &incoming,
            &tail("create_note", "note")
        ));
        let rename = WorkspaceOperation::RenameNode {
            id: "note".into(),
            title: "Renamed".into(),
            at: 1,
        };
        assert!(!coalesces_into_tail(
            &rename,
            &tail("save_document", "note")
        ));
    }
}
