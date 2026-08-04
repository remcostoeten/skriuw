use std::collections::BTreeSet;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    BoundedWriter, OperationValidationError, WorkspaceOperation, WorkspaceOperationEnvelope,
    validate_id,
};

pub const WORKSPACE_SYNC_PROTOCOL_VERSION: u16 = 1;
pub const MAX_SYNC_BATCH_OPERATIONS: usize = 64;
pub const MAX_SYNC_PULL_OPERATIONS: usize = 256;
pub const MAX_INLINE_SYNC_OPERATION_BYTES: usize = 1_500_000;
pub const MAX_SYNC_BATCH_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_SAFE_SYNC_SEQUENCE: u64 = 9_007_199_254_740_991;

pub fn validate_sync_identifier(
    field: &'static str,
    value: &str,
) -> Result<(), SyncValidationError> {
    validate_id(field, value).map_err(SyncValidationError::from)
}

pub fn validate_sync_sequence(
    field: &'static str,
    value: u64,
    allow_zero: bool,
) -> Result<(), SyncValidationError> {
    if value > MAX_SAFE_SYNC_SEQUENCE || (!allow_zero && value == 0) {
        return Err(SyncValidationError::InvalidSequence { field });
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SyncReplicationClass {
    ReplicatedWorkspaceContent,
    DeviceLocal,
    UnsupportedSyncProtocolV1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOperationSyncPolicy {
    pub operation_type: &'static str,
    pub replication_class: SyncReplicationClass,
}

macro_rules! define_workspace_operation_sync_policy {
    ($($variant:ident => ($operation_type:literal, $class:ident)),+ $(,)?) => {
        impl WorkspaceOperation {
            #[must_use]
            pub fn sync_policy(&self) -> WorkspaceOperationSyncPolicy {
                match self {
                    $(Self::$variant { .. } => WorkspaceOperationSyncPolicy {
                        operation_type: $operation_type,
                        replication_class: SyncReplicationClass::$class,
                    },)+
                }
            }
        }

        pub const WORKSPACE_OPERATION_SYNC_POLICY_V1: &[WorkspaceOperationSyncPolicy] = &[
            $(WorkspaceOperationSyncPolicy {
                operation_type: $operation_type,
                replication_class: SyncReplicationClass::$class,
            },)+
        ];
    };
}

define_workspace_operation_sync_policy! {
    CreateTag => ("create_tag", ReplicatedWorkspaceContent),
    RenameTag => ("rename_tag", ReplicatedWorkspaceContent),
    RecolorTag => ("recolor_tag", ReplicatedWorkspaceContent),
    DeleteTag => ("delete_tag", ReplicatedWorkspaceContent),
    CreatePerson => ("create_person", ReplicatedWorkspaceContent),
    RenamePerson => ("rename_person", ReplicatedWorkspaceContent),
    RecolorPerson => ("recolor_person", ReplicatedWorkspaceContent),
    DeletePerson => ("delete_person", ReplicatedWorkspaceContent),
    CreateFolder => ("create_folder", ReplicatedWorkspaceContent),
    CreateNote => ("create_note", ReplicatedWorkspaceContent),
    RenameNode => ("rename_node", ReplicatedWorkspaceContent),
    SetNoteCover => ("set_note_cover", ReplicatedWorkspaceContent),
    SetNoteCoverFullWidth => ("set_note_cover_full_width", ReplicatedWorkspaceContent),
    SetNoteCoverTransform => ("set_note_cover_transform", ReplicatedWorkspaceContent),
    MoveNode => ("move_node", ReplicatedWorkspaceContent),
    SetNodePinned => ("set_node_pinned", ReplicatedWorkspaceContent),
    SaveDocument => ("save_document", ReplicatedWorkspaceContent),
    TrashSubtree => ("trash_subtree", ReplicatedWorkspaceContent),
    RestoreSubtree => ("restore_subtree", ReplicatedWorkspaceContent),
    PurgeSubtree => ("purge_subtree", ReplicatedWorkspaceContent),
    SetActiveNote => ("set_active_note", DeviceLocal),
    UpdateSettings => ("update_settings", DeviceLocal),
    AttachImage => ("attach_image", UnsupportedSyncProtocolV1),
    SetNoteProperty => ("set_note_property", ReplicatedWorkspaceContent),
    RemoveNoteProperty => ("remove_note_property", ReplicatedWorkspaceContent),
    ReorderNoteProperties => ("reorder_note_properties", ReplicatedWorkspaceContent),
    SetNotePropertyTemplate => ("set_note_property_template", ReplicatedWorkspaceContent),
    DeleteNotePropertyTemplate => ("delete_note_property_template", ReplicatedWorkspaceContent),
    ReorderNotePropertyTemplates => ("reorder_note_property_templates", ReplicatedWorkspaceContent),
    RecordProviderImport => ("record_provider_import", DeviceLocal),
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum SyncValidationError {
    #[error("unsupported workspace sync protocol version {0}")]
    UnsupportedProtocol(u16),
    #[error("sync operation batch cannot be empty")]
    EmptyBatch,
    #[error("sync operation batch exceeds {maximum} operations")]
    TooManyOperations { maximum: usize },
    #[error("{field} must be greater than zero")]
    InvalidSequence { field: &'static str },
    #[error("client sequences must be contiguous and increasing")]
    NonContiguousClientSequence,
    #[error("duplicate sync operation id {0}")]
    DuplicateOperationId(String),
    #[error("duplicate client sequence {0}")]
    DuplicateClientSequence(u64),
    #[error("sync operation exceeds {maximum} bytes")]
    OperationTooLarge { maximum: usize },
    #[error("sync operation batch exceeds {maximum} bytes")]
    BatchTooLarge { maximum: usize },
    #[error("workspace operation {operation_type} is device-local and cannot be replicated")]
    DeviceLocalOperation { operation_type: &'static str },
    #[error("workspace operation {operation_type} requires a later sync protocol capability")]
    UnsupportedOperation { operation_type: &'static str },
    #[error(transparent)]
    Operation(#[from] OperationValidationError),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClientSyncOperation {
    pub operation_id: String,
    pub client_sequence: u64,
    pub base_server_sequence: u64,
    pub operation: WorkspaceOperationEnvelope,
}

impl ClientSyncOperation {
    pub fn validate(&self) -> Result<(), SyncValidationError> {
        validate_sync_identifier("sync operation id", &self.operation_id)?;
        validate_sync_sequence("client sequence", self.client_sequence, false)?;
        validate_sync_sequence("base server sequence", self.base_server_sequence, true)?;
        self.operation.validate()?;
        validate_replication_policy(&self.operation.operation)?;
        ensure_serialized_size(
            self,
            MAX_INLINE_SYNC_OPERATION_BYTES,
            SyncValidationError::OperationTooLarge {
                maximum: MAX_INLINE_SYNC_OPERATION_BYTES,
            },
        )
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SyncPushRequest {
    pub sync_protocol_version: u16,
    pub device_id: String,
    pub operations: Vec<ClientSyncOperation>,
}

impl SyncPushRequest {
    #[must_use]
    pub fn v1(device_id: impl Into<String>, operations: Vec<ClientSyncOperation>) -> Self {
        Self {
            sync_protocol_version: WORKSPACE_SYNC_PROTOCOL_VERSION,
            device_id: device_id.into(),
            operations,
        }
    }

    pub fn validate(&self) -> Result<(), SyncValidationError> {
        if self.sync_protocol_version != WORKSPACE_SYNC_PROTOCOL_VERSION {
            return Err(SyncValidationError::UnsupportedProtocol(
                self.sync_protocol_version,
            ));
        }
        validate_sync_identifier("sync device id", &self.device_id)?;
        if self.operations.is_empty() {
            return Err(SyncValidationError::EmptyBatch);
        }
        if self.operations.len() > MAX_SYNC_BATCH_OPERATIONS {
            return Err(SyncValidationError::TooManyOperations {
                maximum: MAX_SYNC_BATCH_OPERATIONS,
            });
        }

        let mut operation_ids = BTreeSet::new();
        let mut client_sequences = BTreeSet::new();
        let mut previous_sequence = None;
        for operation in &self.operations {
            operation.validate()?;
            if !operation_ids.insert(operation.operation_id.as_str()) {
                return Err(SyncValidationError::DuplicateOperationId(
                    operation.operation_id.clone(),
                ));
            }
            if !client_sequences.insert(operation.client_sequence) {
                return Err(SyncValidationError::DuplicateClientSequence(
                    operation.client_sequence,
                ));
            }
            if previous_sequence.is_some_and(|previous| operation.client_sequence != previous + 1) {
                return Err(SyncValidationError::NonContiguousClientSequence);
            }
            previous_sequence = Some(operation.client_sequence);
        }

        ensure_serialized_size(
            self,
            MAX_SYNC_BATCH_BYTES,
            SyncValidationError::BatchTooLarge {
                maximum: MAX_SYNC_BATCH_BYTES,
            },
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SyncAcceptedOperation {
    pub operation_id: String,
    pub client_sequence: u64,
    pub server_sequence: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SyncPushResponse {
    pub sync_protocol_version: u16,
    pub accepted: Vec<SyncAcceptedOperation>,
    pub latest_server_sequence: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReplicatedWorkspaceOperation {
    pub operation_id: String,
    pub device_id: String,
    pub client_sequence: u64,
    pub base_server_sequence: u64,
    pub server_sequence: u64,
    pub operation: WorkspaceOperationEnvelope,
}

impl ReplicatedWorkspaceOperation {
    pub fn validate(&self) -> Result<(), SyncValidationError> {
        validate_sync_identifier("sync operation id", &self.operation_id)?;
        validate_sync_identifier("sync device id", &self.device_id)?;
        validate_sync_sequence("client sequence", self.client_sequence, false)?;
        validate_sync_sequence("base server sequence", self.base_server_sequence, true)?;
        validate_sync_sequence("server sequence", self.server_sequence, false)?;
        self.operation.validate()?;
        validate_replication_policy(&self.operation.operation)?;
        Ok(())
    }
}

fn validate_replication_policy(operation: &WorkspaceOperation) -> Result<(), SyncValidationError> {
    let policy = operation.sync_policy();
    match policy.replication_class {
        SyncReplicationClass::ReplicatedWorkspaceContent => Ok(()),
        SyncReplicationClass::DeviceLocal => Err(SyncValidationError::DeviceLocalOperation {
            operation_type: policy.operation_type,
        }),
        SyncReplicationClass::UnsupportedSyncProtocolV1 => {
            Err(SyncValidationError::UnsupportedOperation {
                operation_type: policy.operation_type,
            })
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SyncPullResponse {
    pub sync_protocol_version: u16,
    pub operations: Vec<ReplicatedWorkspaceOperation>,
    pub latest_server_sequence: u64,
}

impl SyncPullResponse {
    pub fn validate(&self) -> Result<(), SyncValidationError> {
        if self.sync_protocol_version != WORKSPACE_SYNC_PROTOCOL_VERSION {
            return Err(SyncValidationError::UnsupportedProtocol(
                self.sync_protocol_version,
            ));
        }
        if self.latest_server_sequence > MAX_SAFE_SYNC_SEQUENCE {
            return Err(SyncValidationError::InvalidSequence {
                field: "latest server sequence",
            });
        }
        if self.operations.len() > MAX_SYNC_PULL_OPERATIONS {
            return Err(SyncValidationError::TooManyOperations {
                maximum: MAX_SYNC_PULL_OPERATIONS,
            });
        }
        let mut previous_sequence = None;
        for operation in &self.operations {
            operation.validate()?;
            if previous_sequence.is_some_and(|previous| operation.server_sequence <= previous) {
                return Err(SyncValidationError::InvalidSequence {
                    field: "server sequence",
                });
            }
            if operation.server_sequence > self.latest_server_sequence {
                return Err(SyncValidationError::InvalidSequence {
                    field: "latest server sequence",
                });
            }
            previous_sequence = Some(operation.server_sequence);
        }
        Ok(())
    }
}

fn ensure_serialized_size(
    value: &impl Serialize,
    maximum: usize,
    error: SyncValidationError,
) -> Result<(), SyncValidationError> {
    let mut counter = BoundedWriter::new(maximum);
    serde_json::to_writer(&mut counter, value).map_err(|_| error)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use serde_json::json;

    use super::{
        ClientSyncOperation, ReplicatedWorkspaceOperation, SyncPullResponse, SyncPushRequest,
        SyncReplicationClass, SyncValidationError, WORKSPACE_OPERATION_SYNC_POLICY_V1,
        WORKSPACE_SYNC_PROTOCOL_VERSION,
    };
    use crate::{NodePlacement, WorkspaceImage, WorkspaceOperation, WorkspaceOperationEnvelope};

    fn operation(id: &str, sequence: u64) -> ClientSyncOperation {
        ClientSyncOperation {
            operation_id: id.into(),
            client_sequence: sequence,
            base_server_sequence: 0,
            operation: WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateFolder {
                id: format!("folder-{sequence}"),
                title: "Folder".into(),
                placement: NodePlacement::last(None),
                at: 1,
            }),
        }
    }

    #[test]
    fn validates_contiguous_client_sequences() {
        SyncPushRequest::v1("device-1", vec![operation("op-1", 4), operation("op-2", 5)])
            .validate()
            .expect("valid sync request");

        let error =
            SyncPushRequest::v1("device-1", vec![operation("op-1", 4), operation("op-2", 6)])
                .validate()
                .expect_err("sequence gap must fail");
        assert_eq!(error, SyncValidationError::NonContiguousClientSequence);
    }

    #[test]
    fn rejects_duplicate_operation_ids() {
        let error =
            SyncPushRequest::v1("device-1", vec![operation("op-1", 1), operation("op-1", 2)])
                .validate()
                .expect_err("duplicate id must fail");
        assert_eq!(
            error,
            SyncValidationError::DuplicateOperationId("op-1".into())
        );
    }

    #[test]
    fn validates_golden_push_fixture() {
        let request: SyncPushRequest = serde_json::from_str(include_str!(
            "../../../contracts/fixtures/sync-push-v1.json"
        ))
        .expect("deserialize golden sync request");
        request.validate().expect("validate golden sync request");
        assert_eq!(
            request.sync_protocol_version,
            WORKSPACE_SYNC_PROTOCOL_VERSION
        );
        assert_eq!(request.operations[0].operation_id, "operation-1");
    }

    #[test]
    fn every_workspace_operation_has_one_explicit_sync_policy() {
        let operation_types = WORKSPACE_OPERATION_SYNC_POLICY_V1
            .iter()
            .map(|policy| policy.operation_type)
            .collect::<BTreeSet<_>>();
        assert_eq!(
            operation_types.len(),
            WORKSPACE_OPERATION_SYNC_POLICY_V1.len()
        );
        assert_eq!(WORKSPACE_OPERATION_SYNC_POLICY_V1.len(), 30);
        assert_eq!(
            operation_types,
            serde_json::from_str::<serde_json::Value>(include_str!(
                "../../../contracts/generated/workspace-operation.schema.json"
            ))
            .expect("generated workspace operation schema")
            .pointer("/$defs/WorkspaceOperation/oneOf")
            .and_then(serde_json::Value::as_array)
            .expect("workspace operation variants")
            .iter()
            .map(|variant| {
                variant["properties"]["type"]["const"]
                    .as_str()
                    .expect("workspace operation type")
            })
            .collect()
        );
        assert_eq!(
            WorkspaceOperation::SetActiveNote { note_id: None }
                .sync_policy()
                .replication_class,
            SyncReplicationClass::DeviceLocal
        );
    }

    #[test]
    fn rejects_non_replicated_operations_with_stable_classification() {
        let device_local = ClientSyncOperation {
            operation_id: "op-local".into(),
            client_sequence: 1,
            base_server_sequence: 0,
            operation: WorkspaceOperationEnvelope::v1(WorkspaceOperation::SetActiveNote {
                note_id: None,
            }),
        };
        assert_eq!(
            device_local.validate(),
            Err(SyncValidationError::DeviceLocalOperation {
                operation_type: "set_active_note"
            })
        );

        let unsupported = ClientSyncOperation {
            operation_id: "op-image".into(),
            client_sequence: 1,
            base_server_sequence: 0,
            operation: WorkspaceOperationEnvelope::v1(WorkspaceOperation::AttachImage {
                image: WorkspaceImage {
                    id: "image-1".into(),
                    note_id: "note-1".into(),
                    content_hash: "a".repeat(64),
                    mime_type: "image/png".into(),
                    byte_size: 1,
                    width: Some(1),
                    height: Some(1),
                    created_at: 1,
                },
            }),
        };
        assert_eq!(
            unsupported.validate(),
            Err(SyncValidationError::UnsupportedOperation {
                operation_type: "attach_image"
            })
        );
    }

    #[test]
    fn validates_ordered_pull_response() {
        let response = SyncPullResponse {
            sync_protocol_version: WORKSPACE_SYNC_PROTOCOL_VERSION,
            operations: vec![ReplicatedWorkspaceOperation {
                operation_id: "op-1".into(),
                device_id: "device-1".into(),
                client_sequence: 1,
                base_server_sequence: 0,
                server_sequence: 1,
                operation: WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateNote {
                    id: "note-1".into(),
                    title: "Note".into(),
                    placement: NodePlacement::last(None),
                    document_json: json!({"type": "doc"}),
                    markdown: String::new(),
                    at: 1,
                }),
            }],
            latest_server_sequence: 1,
        };
        response.validate().expect("valid pull response");
    }
}
