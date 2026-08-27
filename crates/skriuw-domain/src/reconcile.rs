use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::WorkspaceOperation;

/// Stable semantic-conflict reason codes from the sync convergence v1
/// specification. The first four are the broad compatibility categories
/// already persisted by the inbound adapter; the remainder are the precise
/// subreasons stored alongside them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncConflictReason {
    RevisionConflict,
    MissingDependency,
    IdentityConflict,
    DomainConflict,
    ConcurrentDocumentVersion,
    TombstoneBlocked,
    ConcurrentFieldEdit,
    CollectionConflict,
    TreeConflict,
    ContentUnavailable,
}

impl SyncConflictReason {
    #[must_use]
    pub const fn code(self) -> &'static str {
        match self {
            Self::RevisionConflict => "revision_conflict",
            Self::MissingDependency => "missing_dependency",
            Self::IdentityConflict => "identity_conflict",
            Self::DomainConflict => "domain_conflict",
            Self::ConcurrentDocumentVersion => "concurrent_document_version",
            Self::TombstoneBlocked => "tombstone_blocked",
            Self::ConcurrentFieldEdit => "concurrent_field_edit",
            Self::CollectionConflict => "collection_conflict",
            Self::TreeConflict => "tree_conflict",
            Self::ContentUnavailable => "content_unavailable",
        }
    }

    /// The broad category persisted in `sync_conflicts.reason_code`, which
    /// keeps the four-value compatibility contract of the current schema.
    #[must_use]
    pub const fn broad_code(self) -> &'static str {
        match self {
            Self::RevisionConflict | Self::ConcurrentDocumentVersion => "revision_conflict",
            Self::MissingDependency | Self::TombstoneBlocked | Self::ContentUnavailable => {
                "missing_dependency"
            }
            Self::IdentityConflict => "identity_conflict",
            Self::DomainConflict
            | Self::ConcurrentFieldEdit
            | Self::CollectionConflict
            | Self::TreeConflict => "domain_conflict",
        }
    }

    /// The precise subreason code, or `None` when the broad category already
    /// is the most precise classification.
    #[must_use]
    pub const fn subreason_code(self) -> Option<&'static str> {
        match self {
            Self::RevisionConflict
            | Self::MissingDependency
            | Self::IdentityConflict
            | Self::DomainConflict => None,
            Self::ConcurrentDocumentVersion
            | Self::TombstoneBlocked
            | Self::ConcurrentFieldEdit
            | Self::CollectionConflict
            | Self::TreeConflict
            | Self::ContentUnavailable => Some(self.code()),
        }
    }
}

/// Deterministic decision for one replicated remote operation, taken before
/// the operation reaches domain/storage validation. `Apply` still runs the
/// complete normal validation; reconciliation never legalizes an operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemoteOperationDecision {
    /// Submit the operation unchanged through domain/storage validation.
    Apply,
    /// The complete intended state is already present; record the operation
    /// without reapplying it.
    AlreadyApplied,
    /// Preserve a durable semantic conflict instead of mutating canonical
    /// state.
    Conflict { reason: SyncConflictReason },
    /// The operation class can never appear in the replicated v1 log. The
    /// whole inbound transaction is rejected; this is not a semantic
    /// conflict and must not consume the cursor.
    ProtocolInvalid { operation_type: &'static str },
}

/// Facts about the reconciliation target gathered by the storage adapter
/// inside the inbound transaction. The domain rules consume these facts;
/// adapters never decide policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct RemoteTargetState {
    /// A terminal tombstone protects the operation's primary identity.
    pub target_tombstoned: bool,
    /// A terminal tombstone protects a required dependency (parent, anchor,
    /// owner note, or a referenced tag/person/note).
    pub dependency_tombstoned: bool,
    /// The primary target row currently exists.
    pub target_exists: bool,
    /// The target is a node that exists but is unavailable because it or an
    /// ancestor is in the trash.
    pub target_trashed: bool,
    /// The operation's complete intended state is already the canonical
    /// state, as verified by the adapter against current rows.
    pub state_equivalent: bool,
    /// For `SaveDocument`: the expected revision matches the current
    /// canonical revision, so optimistic application is safe.
    pub document_revision_matches: bool,
    /// The operation's causal base already covers every write this device has
    /// incorporated for the target, so the author saw at least as much as we
    /// hold and the operation is downstream rather than concurrent.
    ///
    /// Revision equality cannot answer this on its own: a device that joined
    /// through the replicated log rebuilds documents from scratch and starts
    /// its counter over, so two devices holding identical content routinely
    /// disagree about the number.
    pub remote_supersedes_local: bool,
}

/// Decide how a validated replicated remote operation reconciles against
/// current local state. The match is intentionally wildcard-free so a new
/// `WorkspaceOperation` variant fails compilation until its concurrent
/// behavior is specified.
#[must_use]
pub fn reconcile_remote_operation(
    operation: &WorkspaceOperation,
    state: &RemoteTargetState,
) -> RemoteOperationDecision {
    match operation {
        WorkspaceOperation::CreateTag { .. }
        | WorkspaceOperation::CreatePerson { .. }
        | WorkspaceOperation::CreateFolder { .. }
        | WorkspaceOperation::CreateNote { .. } => reconcile_create(state),
        WorkspaceOperation::RenameTag { .. }
        | WorkspaceOperation::RecolorTag { .. }
        | WorkspaceOperation::RenamePerson { .. }
        | WorkspaceOperation::RecolorPerson { .. } => reconcile_scalar_update(state),
        WorkspaceOperation::DeleteTag { .. } | WorkspaceOperation::DeletePerson { .. } => {
            reconcile_delete(state)
        }
        WorkspaceOperation::RenameNode { .. }
        | WorkspaceOperation::SetNodePinned { .. }
        | WorkspaceOperation::SetNoteCover { .. }
        | WorkspaceOperation::SetNoteCoverFullWidth { .. }
        | WorkspaceOperation::SetNoteCoverTransform { .. }
        | WorkspaceOperation::MoveNode { .. } => reconcile_node_update(state),
        WorkspaceOperation::SaveDocument { .. } => reconcile_save_document(state),
        WorkspaceOperation::TrashSubtree { .. } => reconcile_trash(state),
        WorkspaceOperation::RestoreSubtree { .. } => reconcile_restore(state),
        WorkspaceOperation::PurgeSubtree { .. } => reconcile_purge(state),
        WorkspaceOperation::SetNoteProperty { .. }
        | WorkspaceOperation::SetNotePropertyTemplate { .. }
        | WorkspaceOperation::SetPrompt { .. } => reconcile_field_upsert(state),
        WorkspaceOperation::RemoveNoteProperty { .. }
        | WorkspaceOperation::DeleteNotePropertyTemplate { .. }
        | WorkspaceOperation::DeletePrompt { .. } => reconcile_delete(state),
        WorkspaceOperation::ReorderNoteProperties { .. }
        | WorkspaceOperation::ReorderNotePropertyTemplates { .. } => reconcile_reorder(state),
        WorkspaceOperation::AttachImage { .. } => reconcile_create(state),
        WorkspaceOperation::CreateAnnotation { .. } => reconcile_create(state),
        WorkspaceOperation::AddAnnotationComment { .. }
        | WorkspaceOperation::UpdateAnnotationComment { .. }
        | WorkspaceOperation::DeleteAnnotationComment { .. }
        | WorkspaceOperation::ResolveAnnotation { .. }
        | WorkspaceOperation::ReopenAnnotation { .. } => reconcile_scalar_update(state),
        WorkspaceOperation::DeleteAnnotation { .. } => reconcile_delete(state),
        WorkspaceOperation::CreateTask { .. } | WorkspaceOperation::PromoteChecklistTask { .. } => {
            reconcile_create(state)
        }
        WorkspaceOperation::UpdateTask { .. } | WorkspaceOperation::DetachTask { .. } => {
            reconcile_scalar_update(state)
        }
        WorkspaceOperation::DeleteTask { .. } => reconcile_delete(state),
        WorkspaceOperation::SetActiveNote { .. }
        | WorkspaceOperation::UpdateSettings { .. }
        | WorkspaceOperation::RecordProviderImport { .. } => {
            RemoteOperationDecision::ProtocolInvalid {
                operation_type: operation.sync_policy().operation_type,
            }
        }
    }
}

fn reconcile_create(state: &RemoteTargetState) -> RemoteOperationDecision {
    if state.target_tombstoned {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if state.dependency_tombstoned {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if state.target_exists {
        if state.state_equivalent {
            return RemoteOperationDecision::AlreadyApplied;
        }
        return conflict(SyncConflictReason::IdentityConflict);
    }
    RemoteOperationDecision::Apply
}

fn reconcile_scalar_update(state: &RemoteTargetState) -> RemoteOperationDecision {
    if state.target_tombstoned {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if !state.target_exists {
        return conflict(SyncConflictReason::MissingDependency);
    }
    if state.state_equivalent {
        return RemoteOperationDecision::AlreadyApplied;
    }
    RemoteOperationDecision::Apply
}

fn reconcile_delete(state: &RemoteTargetState) -> RemoteOperationDecision {
    if state.target_tombstoned {
        return RemoteOperationDecision::AlreadyApplied;
    }
    if state.dependency_tombstoned {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if !state.target_exists {
        return conflict(SyncConflictReason::MissingDependency);
    }
    RemoteOperationDecision::Apply
}

fn reconcile_node_update(state: &RemoteTargetState) -> RemoteOperationDecision {
    if state.target_tombstoned || state.dependency_tombstoned {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if !state.target_exists {
        return conflict(SyncConflictReason::MissingDependency);
    }
    if state.target_trashed {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if state.state_equivalent {
        return RemoteOperationDecision::AlreadyApplied;
    }
    RemoteOperationDecision::Apply
}

fn reconcile_save_document(state: &RemoteTargetState) -> RemoteOperationDecision {
    if state.target_tombstoned || state.dependency_tombstoned {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if !state.target_exists {
        return conflict(SyncConflictReason::MissingDependency);
    }
    if state.state_equivalent {
        return RemoteOperationDecision::AlreadyApplied;
    }
    if state.target_trashed {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if state.document_revision_matches || state.remote_supersedes_local {
        return RemoteOperationDecision::Apply;
    }
    conflict(SyncConflictReason::ConcurrentDocumentVersion)
}

fn reconcile_trash(state: &RemoteTargetState) -> RemoteOperationDecision {
    if state.target_tombstoned {
        return RemoteOperationDecision::AlreadyApplied;
    }
    if !state.target_exists {
        return conflict(SyncConflictReason::MissingDependency);
    }
    if state.state_equivalent {
        return RemoteOperationDecision::AlreadyApplied;
    }
    RemoteOperationDecision::Apply
}

fn reconcile_restore(state: &RemoteTargetState) -> RemoteOperationDecision {
    if state.target_tombstoned {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if state.dependency_tombstoned {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if !state.target_exists {
        return conflict(SyncConflictReason::MissingDependency);
    }
    RemoteOperationDecision::Apply
}

fn reconcile_purge(state: &RemoteTargetState) -> RemoteOperationDecision {
    if state.target_tombstoned {
        return RemoteOperationDecision::AlreadyApplied;
    }
    if !state.target_exists {
        return conflict(SyncConflictReason::MissingDependency);
    }
    RemoteOperationDecision::Apply
}

fn reconcile_field_upsert(state: &RemoteTargetState) -> RemoteOperationDecision {
    if state.target_tombstoned || state.dependency_tombstoned {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if state.target_trashed {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if state.state_equivalent {
        return RemoteOperationDecision::AlreadyApplied;
    }
    RemoteOperationDecision::Apply
}

fn reconcile_reorder(state: &RemoteTargetState) -> RemoteOperationDecision {
    if state.target_tombstoned || state.dependency_tombstoned {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if state.target_trashed {
        return conflict(SyncConflictReason::TombstoneBlocked);
    }
    if state.state_equivalent {
        return RemoteOperationDecision::AlreadyApplied;
    }
    RemoteOperationDecision::Apply
}

const fn conflict(reason: SyncConflictReason) -> RemoteOperationDecision {
    RemoteOperationDecision::Conflict { reason }
}

/// Classify a validation failure raised while applying a remote operation
/// that reconciliation approved. The per-family mapping refines the broad
/// `domain_conflict` category; it never converts a failure into success.
#[must_use]
pub fn classify_apply_failure(operation: &WorkspaceOperation) -> SyncConflictReason {
    match operation {
        WorkspaceOperation::CreateFolder { .. }
        | WorkspaceOperation::CreateNote { .. }
        | WorkspaceOperation::MoveNode { .. }
        | WorkspaceOperation::TrashSubtree { .. }
        | WorkspaceOperation::RestoreSubtree { .. }
        | WorkspaceOperation::PurgeSubtree { .. } => SyncConflictReason::TreeConflict,
        WorkspaceOperation::SetNoteProperty { .. }
        | WorkspaceOperation::SetNotePropertyTemplate { .. }
        | WorkspaceOperation::SetPrompt { .. }
        | WorkspaceOperation::UpdateTask { .. }
        | WorkspaceOperation::DetachTask { .. }
        | WorkspaceOperation::AddAnnotationComment { .. }
        | WorkspaceOperation::UpdateAnnotationComment { .. }
        | WorkspaceOperation::DeleteAnnotationComment { .. }
        | WorkspaceOperation::ResolveAnnotation { .. }
        | WorkspaceOperation::ReopenAnnotation { .. } => SyncConflictReason::ConcurrentFieldEdit,
        WorkspaceOperation::CreateTask { .. }
        | WorkspaceOperation::PromoteChecklistTask { .. }
        | WorkspaceOperation::DeleteTask { .. }
        | WorkspaceOperation::CreateAnnotation { .. }
        | WorkspaceOperation::DeleteAnnotation { .. } => SyncConflictReason::DomainConflict,
        WorkspaceOperation::ReorderNoteProperties { .. }
        | WorkspaceOperation::ReorderNotePropertyTemplates { .. } => {
            SyncConflictReason::CollectionConflict
        }
        WorkspaceOperation::CreateTag { .. }
        | WorkspaceOperation::RenameTag { .. }
        | WorkspaceOperation::RecolorTag { .. }
        | WorkspaceOperation::DeleteTag { .. }
        | WorkspaceOperation::CreatePerson { .. }
        | WorkspaceOperation::RenamePerson { .. }
        | WorkspaceOperation::RecolorPerson { .. }
        | WorkspaceOperation::DeletePerson { .. }
        | WorkspaceOperation::RenameNode { .. }
        | WorkspaceOperation::SetNoteCover { .. }
        | WorkspaceOperation::SetNoteCoverFullWidth { .. }
        | WorkspaceOperation::SetNoteCoverTransform { .. }
        | WorkspaceOperation::SetNodePinned { .. }
        | WorkspaceOperation::SaveDocument { .. }
        | WorkspaceOperation::RemoveNoteProperty { .. }
        | WorkspaceOperation::DeleteNotePropertyTemplate { .. }
        | WorkspaceOperation::DeletePrompt { .. }
        | WorkspaceOperation::SetActiveNote { .. }
        | WorkspaceOperation::UpdateSettings { .. }
        | WorkspaceOperation::RecordProviderImport { .. } => SyncConflictReason::DomainConflict,
        WorkspaceOperation::AttachImage { .. } => SyncConflictReason::MissingDependency,
    }
}

/// The user's durable resolution of a preserved document conflict. Version 1
/// resolutions replicate their canonical result as an ordinary
/// `SaveDocument`; the unselected alternative is never deleted.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "choice"
)]
pub enum DocumentConflictResolutionChoice {
    /// Keep the current local canonical document; the remote alternative
    /// remains preserved as recovery evidence.
    KeepLocal,
    /// Make the preserved remote alternative canonical; the previous local
    /// version remains preserved as recovery evidence.
    KeepRemote,
    /// Save an explicit user-merged document as canonical; both original
    /// alternatives remain preserved as recovery evidence.
    Merged {
        document_json: Value,
        markdown: String,
    },
}

impl DocumentConflictResolutionChoice {
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::KeepLocal => "local",
            Self::KeepRemote => "remote",
            Self::Merged { .. } => "merged",
        }
    }
}

/// A complete, versioned resolution request for one preserved document
/// conflict.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveDocumentConflict {
    pub conflict_id: String,
    #[serde(flatten)]
    pub choice: DocumentConflictResolutionChoice,
    pub at: i64,
}

#[cfg(test)]
mod tests {
    use super::{
        RemoteOperationDecision, RemoteTargetState, SyncConflictReason, classify_apply_failure,
        reconcile_remote_operation,
    };
    use crate::{NodePlacement, WorkspaceOperation, WorkspaceSettings};
    use serde_json::json;

    fn save_document() -> WorkspaceOperation {
        WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: json!({"type": "doc"}),
            markdown: "body".into(),
            word_count: 1,
            expected_revision: 1,
            at: 1,
        }
    }

    #[test]
    fn identical_document_save_is_already_applied() {
        let decision = reconcile_remote_operation(
            &save_document(),
            &RemoteTargetState {
                target_exists: true,
                state_equivalent: true,
                ..RemoteTargetState::default()
            },
        );
        assert_eq!(decision, RemoteOperationDecision::AlreadyApplied);
    }

    #[test]
    fn divergent_document_save_preserves_both_versions() {
        let decision = reconcile_remote_operation(
            &save_document(),
            &RemoteTargetState {
                target_exists: true,
                ..RemoteTargetState::default()
            },
        );
        assert_eq!(
            decision,
            RemoteOperationDecision::Conflict {
                reason: SyncConflictReason::ConcurrentDocumentVersion
            }
        );
    }

    #[test]
    fn a_downstream_document_save_applies_despite_a_foreign_revision() {
        let decision = reconcile_remote_operation(
            &save_document(),
            &RemoteTargetState {
                target_exists: true,
                document_revision_matches: false,
                remote_supersedes_local: true,
                ..RemoteTargetState::default()
            },
        );
        assert_eq!(decision, RemoteOperationDecision::Apply);
    }

    #[test]
    fn a_concurrent_document_save_conflicts_even_with_a_matching_counter() {
        let decision = reconcile_remote_operation(
            &save_document(),
            &RemoteTargetState {
                target_exists: true,
                document_revision_matches: false,
                remote_supersedes_local: false,
                ..RemoteTargetState::default()
            },
        );
        assert_eq!(
            decision,
            RemoteOperationDecision::Conflict {
                reason: SyncConflictReason::ConcurrentDocumentVersion
            }
        );
    }

    #[test]
    fn a_tombstone_outranks_a_downstream_causal_base() {
        let decision = reconcile_remote_operation(
            &save_document(),
            &RemoteTargetState {
                target_exists: true,
                target_tombstoned: true,
                remote_supersedes_local: true,
                ..RemoteTargetState::default()
            },
        );
        assert_eq!(
            decision,
            RemoteOperationDecision::Conflict {
                reason: SyncConflictReason::TombstoneBlocked
            }
        );
    }

    #[test]
    fn tombstoned_target_blocks_resurrection() {
        let state = RemoteTargetState {
            target_tombstoned: true,
            ..RemoteTargetState::default()
        };
        for operation in [
            save_document(),
            WorkspaceOperation::CreateNote {
                id: "note-1".into(),
                title: "Note".into(),
                placement: NodePlacement::last(None),
                document_json: json!({"type": "doc"}),
                markdown: String::new(),
                at: 1,
            },
            WorkspaceOperation::RenameNode {
                id: "note-1".into(),
                title: "Renamed".into(),
                at: 1,
            },
            WorkspaceOperation::RestoreSubtree {
                root_id: "note-1".into(),
                placement: NodePlacement::last(None),
                at: 1,
            },
        ] {
            assert_eq!(
                reconcile_remote_operation(&operation, &state),
                RemoteOperationDecision::Conflict {
                    reason: SyncConflictReason::TombstoneBlocked
                },
                "operation {:?} must be tombstone-blocked",
                operation.sync_policy().operation_type
            );
        }
    }

    #[test]
    fn duplicate_delete_with_tombstone_is_already_applied() {
        let state = RemoteTargetState {
            target_tombstoned: true,
            ..RemoteTargetState::default()
        };
        for operation in [
            WorkspaceOperation::DeleteTag { id: "tag-1".into() },
            WorkspaceOperation::PurgeSubtree {
                root_id: "note-1".into(),
                trashed_before: 10,
            },
            WorkspaceOperation::TrashSubtree {
                root_id: "note-1".into(),
                at: 1,
            },
        ] {
            assert_eq!(
                reconcile_remote_operation(&operation, &state),
                RemoteOperationDecision::AlreadyApplied
            );
        }
    }

    #[test]
    fn device_local_operations_are_protocol_invalid() {
        let decision = reconcile_remote_operation(
            &WorkspaceOperation::UpdateSettings {
                settings: WorkspaceSettings::default(),
            },
            &RemoteTargetState::default(),
        );
        assert_eq!(
            decision,
            RemoteOperationDecision::ProtocolInvalid {
                operation_type: "update_settings"
            }
        );
    }

    #[test]
    fn attach_image_reconciles_as_an_identity_creating_operation() {
        let operation = WorkspaceOperation::AttachImage {
            image: crate::WorkspaceImage {
                id: "image-1".into(),
                note_id: "note-1".into(),
                content_hash: "a".repeat(64),
                mime_type: "image/png".into(),
                byte_size: 8,
                width: Some(1),
                height: Some(1),
                created_at: 1,
            },
        };
        assert_eq!(
            reconcile_remote_operation(&operation, &RemoteTargetState::default()),
            RemoteOperationDecision::Apply
        );
        assert_eq!(
            reconcile_remote_operation(
                &operation,
                &RemoteTargetState {
                    target_exists: true,
                    state_equivalent: true,
                    ..RemoteTargetState::default()
                }
            ),
            RemoteOperationDecision::AlreadyApplied
        );
        assert_eq!(
            reconcile_remote_operation(
                &operation,
                &RemoteTargetState {
                    dependency_tombstoned: true,
                    ..RemoteTargetState::default()
                }
            ),
            RemoteOperationDecision::Conflict {
                reason: SyncConflictReason::TombstoneBlocked
            }
        );
        assert_eq!(
            classify_apply_failure(&operation),
            SyncConflictReason::MissingDependency
        );
    }

    #[test]
    fn broad_codes_stay_in_the_four_value_contract() {
        for reason in [
            SyncConflictReason::ConcurrentDocumentVersion,
            SyncConflictReason::TombstoneBlocked,
            SyncConflictReason::ConcurrentFieldEdit,
            SyncConflictReason::CollectionConflict,
            SyncConflictReason::TreeConflict,
            SyncConflictReason::ContentUnavailable,
            SyncConflictReason::RevisionConflict,
            SyncConflictReason::MissingDependency,
            SyncConflictReason::IdentityConflict,
            SyncConflictReason::DomainConflict,
        ] {
            assert!(matches!(
                reason.broad_code(),
                "revision_conflict"
                    | "missing_dependency"
                    | "identity_conflict"
                    | "domain_conflict"
            ));
        }
    }
}
