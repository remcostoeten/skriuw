use std::collections::BTreeSet;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    BoundedWriter, ContentManifest, ContentManifestKind, ContentValidationError, MAX_CONTENT_BYTES,
    OperationValidationError, WorkspaceOperation, WorkspaceOperationEnvelope, validate_id,
};

pub const WORKSPACE_SYNC_PROTOCOL_VERSION: u16 = 2;
pub const SUPPORTED_SYNC_PROTOCOL_VERSIONS: [u16; 2] = [1, 2];
pub const MIN_CHUNKED_CONTENT_PROTOCOL_VERSION: u16 = 2;
pub const MAX_SYNC_BATCH_OPERATIONS: usize = 64;
pub const MAX_SYNC_PULL_OPERATIONS: usize = 256;
pub const MAX_INLINE_SYNC_OPERATION_BYTES: usize = 1_500_000;
pub const MAX_SYNC_BATCH_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_SAFE_SYNC_SEQUENCE: u64 = 9_007_199_254_740_991;
pub const MAX_OPERATION_ASSET_MANIFESTS: usize = 4;

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
    AttachImage => ("attach_image", ReplicatedWorkspaceContent),
    SetNoteProperty => ("set_note_property", ReplicatedWorkspaceContent),
    RemoveNoteProperty => ("remove_note_property", ReplicatedWorkspaceContent),
    ReorderNoteProperties => ("reorder_note_properties", ReplicatedWorkspaceContent),
    SetNotePropertyTemplate => ("set_note_property_template", ReplicatedWorkspaceContent),
    DeleteNotePropertyTemplate => ("delete_note_property_template", ReplicatedWorkspaceContent),
    ReorderNotePropertyTemplates => ("reorder_note_property_templates", ReplicatedWorkspaceContent),
    RecordProviderImport => ("record_provider_import", DeviceLocal),
    CreateTask => ("create_task", ReplicatedWorkspaceContent),
    UpdateTask => ("update_task", ReplicatedWorkspaceContent),
    DeleteTask => ("delete_task", ReplicatedWorkspaceContent),
    DetachTask => ("detach_task", ReplicatedWorkspaceContent),
    PromoteChecklistTask => ("promote_checklist_task", ReplicatedWorkspaceContent),
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
    #[error("chunked content requires sync protocol version {minimum} or later")]
    ChunkedContentRequiresProtocol { minimum: u16 },
    #[error("chunked sync operations must carry an operation-envelope manifest")]
    UnexpectedManifestKind,
    #[error("operation assets must carry asset manifests")]
    UnexpectedAssetManifestKind,
    #[error("sync operation carries more than {maximum} asset manifests")]
    TooManyAssets { maximum: usize },
    #[error("workspace operation {operation_type} cannot carry asset content")]
    UnexpectedAssets { operation_type: &'static str },
    #[error("workspace operation {operation_type} requires its asset content manifest")]
    MissingAssetContent { operation_type: &'static str },
    #[error("asset manifest does not match the content {operation_type} declares")]
    AssetManifestMismatch { operation_type: &'static str },
    #[error(transparent)]
    Content(#[from] ContentValidationError),
    #[error(transparent)]
    Operation(#[from] OperationValidationError),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "form",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SyncOperationPayload {
    Inline {
        operation: WorkspaceOperationEnvelope,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        assets: Vec<ContentManifest>,
    },
    Chunked {
        manifest: ContentManifest,
    },
}

/// The out-of-band asset bytes a workspace operation declares. The sync layer
/// transports exactly this content next to the operation and verifies the
/// received bytes against these fields before anything is applied.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequiredAssetContent<'a> {
    pub content_hash: &'a str,
    pub mime_type: &'a str,
    pub byte_length: u64,
}

impl WorkspaceOperation {
    #[must_use]
    pub fn required_asset_content(&self) -> Option<RequiredAssetContent<'_>> {
        match self {
            Self::AttachImage { image } => Some(RequiredAssetContent {
                content_hash: &image.content_hash,
                mime_type: &image.mime_type,
                byte_length: image.byte_size.max(0) as u64,
            }),
            _ => None,
        }
    }

    #[must_use]
    pub fn target_entity_id(&self) -> Option<&str> {
        match self {
            Self::CreateTag { tag } => Some(&tag.id),
            Self::CreatePerson { person } => Some(&person.id),
            Self::RenameTag { id, .. }
            | Self::RecolorTag { id, .. }
            | Self::DeleteTag { id }
            | Self::RenamePerson { id, .. }
            | Self::RecolorPerson { id, .. }
            | Self::DeletePerson { id }
            | Self::CreateFolder { id, .. }
            | Self::CreateNote { id, .. }
            | Self::RenameNode { id, .. }
            | Self::MoveNode { id, .. }
            | Self::SetNodePinned { id, .. } => Some(id),
            Self::SetNoteCover { note_id, .. }
            | Self::SetNoteCoverFullWidth { note_id, .. }
            | Self::SetNoteCoverTransform { note_id, .. }
            | Self::SaveDocument { note_id, .. }
            | Self::RemoveNoteProperty { note_id, .. }
            | Self::ReorderNoteProperties { note_id, .. } => Some(note_id),
            Self::TrashSubtree { root_id, .. }
            | Self::RestoreSubtree { root_id, .. }
            | Self::PurgeSubtree { root_id, .. } => Some(root_id),
            Self::SetActiveNote { note_id } => note_id.as_deref(),
            Self::AttachImage { image } => Some(&image.note_id),
            Self::SetNoteProperty { property, .. } => Some(&property.note_id),
            Self::SetNotePropertyTemplate { template } => Some(&template.id),
            Self::DeleteNotePropertyTemplate { template_id } => Some(template_id),
            Self::CreateTask { task, .. }
            | Self::UpdateTask { task, .. }
            | Self::PromoteChecklistTask { task, .. } => Some(&task.id),
            Self::DeleteTask { id, .. } | Self::DetachTask { id, .. } => Some(id),
            Self::UpdateSettings { .. }
            | Self::ReorderNotePropertyTemplates { .. }
            | Self::RecordProviderImport { .. } => None,
        }
    }
}

pub const SYNC_RECOVERY_VIEW_VERSION: u16 = 1;

/// One replicable operation the sync queue set aside because it can not be
/// pushed. The record keeps its stable `blocked_id` until it is retried or
/// discarded, so the UI can list and act on it across refreshes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BlockedSyncOperationView {
    pub blocked_id: String,
    pub operation_type: String,
    pub reason_code: String,
    pub target_id: Option<String>,
    pub target_title: Option<String>,
    pub asset_content_hash: Option<String>,
    pub asset_mime_type: Option<String>,
    pub first_blocked_at: i64,
}

/// The durable record of a blocked operation the user explicitly discarded.
/// Discarding never deletes the row, so the decision stays visible.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiscardedSyncOperationView {
    pub blocked_id: String,
    pub operation_type: String,
    pub reason_code: String,
    pub target_id: Option<String>,
    pub target_title: Option<String>,
    pub first_blocked_at: i64,
    pub discarded_at: i64,
}

/// Versioned projection of the blocked-operation queue for the recovery UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SyncRecoveryView {
    pub view_version: u16,
    pub blocked: Vec<BlockedSyncOperationView>,
    pub discarded: Vec<DiscardedSyncOperationView>,
}

impl SyncOperationPayload {
    #[must_use]
    pub fn inline(operation: WorkspaceOperationEnvelope) -> Self {
        Self::Inline {
            operation,
            assets: Vec::new(),
        }
    }

    #[must_use]
    pub fn inline_operation(&self) -> Option<&WorkspaceOperationEnvelope> {
        match self {
            Self::Inline { operation, .. } => Some(operation),
            Self::Chunked { .. } => None,
        }
    }

    #[must_use]
    pub fn assets(&self) -> &[ContentManifest] {
        match self {
            Self::Inline { assets, .. } => assets,
            Self::Chunked { .. } => &[],
        }
    }

    #[must_use]
    pub fn manifest(&self) -> Option<&ContentManifest> {
        match self {
            Self::Chunked { manifest } => Some(manifest),
            Self::Inline { .. } => None,
        }
    }

    pub fn validate(&self, protocol_version: u16) -> Result<(), SyncValidationError> {
        self.validate_with_mode(protocol_version, false)
    }

    /// Validate a payload that is still queued locally: required asset
    /// manifests are attached at push time, so their absence is not an error
    /// yet, while every present manifest must already be consistent.
    pub fn validate_queued(&self, protocol_version: u16) -> Result<(), SyncValidationError> {
        self.validate_with_mode(protocol_version, true)
    }

    fn validate_with_mode(
        &self,
        protocol_version: u16,
        queued: bool,
    ) -> Result<(), SyncValidationError> {
        match self {
            Self::Inline { operation, assets } => {
                operation.validate()?;
                validate_replication_policy(&operation.operation)?;
                validate_operation_assets(&operation.operation, assets, protocol_version, queued)
            }
            Self::Chunked { manifest } => {
                if protocol_version < MIN_CHUNKED_CONTENT_PROTOCOL_VERSION {
                    return Err(SyncValidationError::ChunkedContentRequiresProtocol {
                        minimum: MIN_CHUNKED_CONTENT_PROTOCOL_VERSION,
                    });
                }
                if manifest.kind != ContentManifestKind::OperationEnvelope {
                    return Err(SyncValidationError::UnexpectedManifestKind);
                }
                manifest.validate()?;
                Ok(())
            }
        }
    }
}

fn validate_operation_assets(
    operation: &WorkspaceOperation,
    assets: &[ContentManifest],
    protocol_version: u16,
    queued: bool,
) -> Result<(), SyncValidationError> {
    if !assets.is_empty() {
        if protocol_version < MIN_CHUNKED_CONTENT_PROTOCOL_VERSION {
            return Err(SyncValidationError::ChunkedContentRequiresProtocol {
                minimum: MIN_CHUNKED_CONTENT_PROTOCOL_VERSION,
            });
        }
        if assets.len() > MAX_OPERATION_ASSET_MANIFESTS {
            return Err(SyncValidationError::TooManyAssets {
                maximum: MAX_OPERATION_ASSET_MANIFESTS,
            });
        }
        for manifest in assets {
            if manifest.kind != ContentManifestKind::Asset {
                return Err(SyncValidationError::UnexpectedAssetManifestKind);
            }
            manifest.validate()?;
        }
    }
    let operation_type = operation.sync_policy().operation_type;
    let Some(required) = operation.required_asset_content() else {
        if assets.is_empty() {
            return Ok(());
        }
        return Err(SyncValidationError::UnexpectedAssets { operation_type });
    };
    if assets.is_empty() {
        if queued {
            return Ok(());
        }
        return Err(SyncValidationError::MissingAssetContent { operation_type });
    }
    let [manifest] = assets else {
        return Err(SyncValidationError::AssetManifestMismatch { operation_type });
    };
    if manifest.content_digest != required.content_hash
        || manifest.mime_type != required.mime_type
        || manifest.total_byte_length != required.byte_length
    {
        return Err(SyncValidationError::AssetManifestMismatch { operation_type });
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClientSyncOperation {
    pub operation_id: String,
    pub client_sequence: u64,
    pub base_server_sequence: u64,
    pub payload: SyncOperationPayload,
}

impl ClientSyncOperation {
    pub fn validate(&self, protocol_version: u16) -> Result<(), SyncValidationError> {
        self.validate_fields(protocol_version, false)?;
        ensure_serialized_size(
            self,
            MAX_INLINE_SYNC_OPERATION_BYTES,
            SyncValidationError::OperationTooLarge {
                maximum: MAX_INLINE_SYNC_OPERATION_BYTES,
            },
        )
    }

    /// Validate an operation that is still queued locally and may be
    /// externalized into chunked content before it reaches the wire, so the
    /// inline ceiling does not apply yet. The content ceiling still does.
    pub fn validate_queued(&self, protocol_version: u16) -> Result<(), SyncValidationError> {
        self.validate_fields(protocol_version, true)?;
        ensure_serialized_size(
            self,
            MAX_CONTENT_BYTES as usize,
            SyncValidationError::OperationTooLarge {
                maximum: MAX_CONTENT_BYTES as usize,
            },
        )
    }

    #[must_use]
    pub fn exceeds_inline_ceiling(&self) -> bool {
        ensure_serialized_size(
            self,
            MAX_INLINE_SYNC_OPERATION_BYTES,
            SyncValidationError::OperationTooLarge {
                maximum: MAX_INLINE_SYNC_OPERATION_BYTES,
            },
        )
        .is_err()
    }

    fn validate_fields(
        &self,
        protocol_version: u16,
        queued: bool,
    ) -> Result<(), SyncValidationError> {
        validate_sync_identifier("sync operation id", &self.operation_id)?;
        validate_sync_sequence("client sequence", self.client_sequence, false)?;
        validate_sync_sequence("base server sequence", self.base_server_sequence, true)?;
        if queued {
            self.payload.validate_queued(protocol_version)
        } else {
            self.payload.validate(protocol_version)
        }
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
        self.validate_batch(false)
    }

    /// Validate a batch that is still queued locally, where operations above
    /// the inline ceiling have not been externalized into chunked content yet.
    pub fn validate_queued(&self) -> Result<(), SyncValidationError> {
        self.validate_batch(true)
    }

    #[must_use]
    pub fn exceeds_batch_ceiling(&self) -> bool {
        ensure_serialized_size(
            self,
            MAX_SYNC_BATCH_BYTES,
            SyncValidationError::BatchTooLarge {
                maximum: MAX_SYNC_BATCH_BYTES,
            },
        )
        .is_err()
    }

    fn validate_batch(&self, queued: bool) -> Result<(), SyncValidationError> {
        if !SUPPORTED_SYNC_PROTOCOL_VERSIONS.contains(&self.sync_protocol_version) {
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
            if queued {
                operation.validate_queued(self.sync_protocol_version)?;
            } else {
                operation.validate(self.sync_protocol_version)?;
            }
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

        if queued {
            return Ok(());
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
    pub payload: SyncOperationPayload,
}

impl ReplicatedWorkspaceOperation {
    pub fn validate(&self, protocol_version: u16) -> Result<(), SyncValidationError> {
        validate_sync_identifier("sync operation id", &self.operation_id)?;
        validate_sync_identifier("sync device id", &self.device_id)?;
        validate_sync_sequence("client sequence", self.client_sequence, false)?;
        validate_sync_sequence("base server sequence", self.base_server_sequence, true)?;
        validate_sync_sequence("server sequence", self.server_sequence, false)?;
        self.payload.validate(protocol_version)
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
        if !SUPPORTED_SYNC_PROTOCOL_VERSIONS.contains(&self.sync_protocol_version) {
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
            operation.validate(self.sync_protocol_version)?;
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
        ClientSyncOperation, MIN_CHUNKED_CONTENT_PROTOCOL_VERSION, ReplicatedWorkspaceOperation,
        SyncOperationPayload, SyncPullResponse, SyncPushRequest, SyncReplicationClass,
        SyncValidationError, WORKSPACE_OPERATION_SYNC_POLICY_V1, WORKSPACE_SYNC_PROTOCOL_VERSION,
    };
    use crate::{
        ContentManifest, ContentManifestKind, NodePlacement, WorkspaceImage, WorkspaceOperation,
        WorkspaceOperationEnvelope,
    };

    fn inline(envelope: WorkspaceOperationEnvelope) -> SyncOperationPayload {
        SyncOperationPayload::inline(envelope)
    }

    fn envelope_manifest(bytes: &[u8]) -> ContentManifest {
        ContentManifest::build(
            ContentManifestKind::OperationEnvelope,
            "application/json",
            bytes,
        )
        .expect("valid manifest")
    }

    fn operation(id: &str, sequence: u64) -> ClientSyncOperation {
        ClientSyncOperation {
            operation_id: id.into(),
            client_sequence: sequence,
            base_server_sequence: 0,
            payload: inline(WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::CreateFolder {
                    id: format!("folder-{sequence}"),
                    title: "Folder".into(),
                    placement: NodePlacement::last(None),
                    at: 1,
                },
            )),
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
            "../../../contracts/fixtures/sync-push-v2.json"
        ))
        .expect("deserialize golden sync request");
        request.validate().expect("validate golden sync request");
        assert_eq!(
            request.sync_protocol_version,
            WORKSPACE_SYNC_PROTOCOL_VERSION
        );
        assert_eq!(request.operations[0].operation_id, "operation-1");
        assert!(request.operations[0].payload.inline_operation().is_some());
        let manifest = request.operations[1]
            .payload
            .manifest()
            .expect("chunked payload manifest");
        assert_eq!(manifest.kind, ContentManifestKind::OperationEnvelope);
        assert_eq!(manifest.chunks.len(), 1);
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
        assert_eq!(WORKSPACE_OPERATION_SYNC_POLICY_V1.len(), 35);
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
            payload: inline(WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::SetActiveNote { note_id: None },
            )),
        };
        assert_eq!(
            device_local.validate(WORKSPACE_SYNC_PROTOCOL_VERSION),
            Err(SyncValidationError::DeviceLocalOperation {
                operation_type: "set_active_note"
            })
        );
    }

    fn attach_image_envelope(bytes: &[u8]) -> WorkspaceOperationEnvelope {
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::AttachImage {
            image: WorkspaceImage {
                id: "image-1".into(),
                note_id: "note-1".into(),
                content_hash: crate::content_digest(bytes),
                mime_type: "image/png".into(),
                byte_size: bytes.len() as i64,
                width: Some(1),
                height: Some(1),
                created_at: 1,
            },
        })
    }

    #[test]
    fn attach_image_requires_a_matching_asset_manifest() {
        let bytes = b"png-bytes";
        let manifest = ContentManifest::build(ContentManifestKind::Asset, "image/png", bytes)
            .expect("valid asset manifest");
        let mut operation = ClientSyncOperation {
            operation_id: "op-image".into(),
            client_sequence: 1,
            base_server_sequence: 0,
            payload: SyncOperationPayload::Inline {
                operation: attach_image_envelope(bytes),
                assets: vec![manifest.clone()],
            },
        };
        operation
            .validate(WORKSPACE_SYNC_PROTOCOL_VERSION)
            .expect("attach_image with its asset manifest is replicated");

        operation.payload = SyncOperationPayload::inline(attach_image_envelope(bytes));
        assert_eq!(
            operation.validate(WORKSPACE_SYNC_PROTOCOL_VERSION),
            Err(SyncValidationError::MissingAssetContent {
                operation_type: "attach_image"
            })
        );
        operation
            .validate_queued(WORKSPACE_SYNC_PROTOCOL_VERSION)
            .expect("queued attach_image gains its asset manifest at push time");

        let mut mismatched = manifest.clone();
        mismatched.content_digest = crate::content_digest(b"different");
        operation.payload = SyncOperationPayload::Inline {
            operation: attach_image_envelope(bytes),
            assets: vec![mismatched],
        };
        assert_eq!(
            operation.validate(WORKSPACE_SYNC_PROTOCOL_VERSION),
            Err(SyncValidationError::AssetManifestMismatch {
                operation_type: "attach_image"
            })
        );

        operation.payload = SyncOperationPayload::Inline {
            operation: attach_image_envelope(bytes),
            assets: vec![manifest.clone()],
        };
        assert_eq!(
            operation.validate(1),
            Err(SyncValidationError::ChunkedContentRequiresProtocol {
                minimum: MIN_CHUNKED_CONTENT_PROTOCOL_VERSION
            })
        );

        operation.payload = SyncOperationPayload::Inline {
            operation: attach_image_envelope(bytes),
            assets: vec![envelope_manifest(b"{}")],
        };
        assert_eq!(
            operation.validate(WORKSPACE_SYNC_PROTOCOL_VERSION),
            Err(SyncValidationError::UnexpectedAssetManifestKind)
        );
    }

    #[test]
    fn operations_without_declared_assets_reject_asset_manifests() {
        let manifest = ContentManifest::build(ContentManifestKind::Asset, "image/png", b"bytes")
            .expect("valid asset manifest");
        let operation = ClientSyncOperation {
            operation_id: "op-folder".into(),
            client_sequence: 1,
            base_server_sequence: 0,
            payload: SyncOperationPayload::Inline {
                operation: WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateFolder {
                    id: "folder-1".into(),
                    title: "Folder".into(),
                    placement: NodePlacement::last(None),
                    at: 1,
                }),
                assets: vec![manifest],
            },
        };
        assert_eq!(
            operation.validate(WORKSPACE_SYNC_PROTOCOL_VERSION),
            Err(SyncValidationError::UnexpectedAssets {
                operation_type: "create_folder"
            })
        );
    }

    #[test]
    fn chunked_payloads_require_protocol_two_and_an_envelope_manifest() {
        let chunked = ClientSyncOperation {
            operation_id: "op-chunked".into(),
            client_sequence: 1,
            base_server_sequence: 0,
            payload: SyncOperationPayload::Chunked {
                manifest: envelope_manifest(b"{\"protocolVersion\":1}"),
            },
        };
        chunked
            .validate(WORKSPACE_SYNC_PROTOCOL_VERSION)
            .expect("chunked payload is valid under protocol 2");
        assert_eq!(
            chunked.validate(1),
            Err(SyncValidationError::ChunkedContentRequiresProtocol {
                minimum: MIN_CHUNKED_CONTENT_PROTOCOL_VERSION
            })
        );

        let asset = ClientSyncOperation {
            operation_id: "op-asset".into(),
            client_sequence: 1,
            base_server_sequence: 0,
            payload: SyncOperationPayload::Chunked {
                manifest: ContentManifest::build(ContentManifestKind::Asset, "image/png", b"bytes")
                    .expect("valid asset manifest"),
            },
        };
        assert_eq!(
            asset.validate(WORKSPACE_SYNC_PROTOCOL_VERSION),
            Err(SyncValidationError::UnexpectedManifestKind)
        );
    }

    #[test]
    fn rejects_protocol_versions_outside_the_supported_window() {
        let mut request = SyncPushRequest::v1("device-1", vec![operation("op-1", 1)]);
        request.sync_protocol_version = 1;
        request
            .validate()
            .expect("inline-only batches remain valid under protocol 1");

        request.sync_protocol_version = 3;
        assert_eq!(
            request.validate(),
            Err(SyncValidationError::UnsupportedProtocol(3))
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
                payload: inline(WorkspaceOperationEnvelope::v1(
                    WorkspaceOperation::CreateNote {
                        id: "note-1".into(),
                        title: "Note".into(),
                        placement: NodePlacement::last(None),
                        document_json: json!({"type": "doc"}),
                        markdown: String::new(),
                        at: 1,
                    },
                )),
            }],
            latest_server_sequence: 1,
        };
        response.validate().expect("valid pull response");
    }
}
