use super::document_write_target;
use crate::{SyncConflictReason, WorkspaceOperation, classify_apply_failure};

/// The storage-neutral shape of a failure raised while applying a
/// reconciliation-approved remote operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteApplyErrorKind {
    RevisionConflict,
    NotFound,
    AlreadyExists,
    /// The store itself failed or was busy; the same apply may succeed later.
    Transient,
    /// Domain validation refused the operation.
    Rejected,
}

/// What a failed remote apply does to the pull.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteApplyFailure {
    /// Roll back the whole pull and retry; nothing was decided.
    Abort,
    /// Record the operation as superseded and advance the cursor.
    Supersede(SyncConflictReason),
}

/// Decide how a failed remote apply resolves. Transient store failures abort
/// the pull so the operation is applied later; every semantic failure becomes
/// a superseded record with the most precise reason available.
#[must_use]
pub fn remote_apply_failure(
    operation: &WorkspaceOperation,
    kind: RemoteApplyErrorKind,
) -> RemoteApplyFailure {
    let reason = match kind {
        RemoteApplyErrorKind::Transient => return RemoteApplyFailure::Abort,
        RemoteApplyErrorKind::RevisionConflict => SyncConflictReason::ConcurrentDocumentVersion,
        RemoteApplyErrorKind::NotFound => SyncConflictReason::MissingDependency,
        RemoteApplyErrorKind::AlreadyExists => SyncConflictReason::IdentityConflict,
        RemoteApplyErrorKind::Rejected => classify_apply_failure(operation),
    };
    RemoteApplyFailure::Supersede(reason)
}

/// What this device holds for the note a superseded document write targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SupersededNoteState {
    pub exists: bool,
    pub sealed: bool,
}

/// The document side effects of recording a superseded remote write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SupersededDocumentPlan<'a> {
    pub note_id: &'a str,
    /// The losing plaintext body to keep as a history revision.
    pub preserved_markdown: Option<&'a str>,
    /// Whether the note's incorporated head moves to the write's sequence.
    pub advances_head: bool,
}

/// Plan the document effects of a remote write this device did not take, or
/// `None` for operations that write no document. A losing plaintext body is
/// preserved as history when the note still exists and is not sealed here,
/// since a locked note keeps no history; a sealed body is never written to
/// history. A write that lost purely on ordering moves the head, so the
/// note's incorporated sequence stays the greatest one seen.
#[must_use]
pub fn superseded_document_plan(
    operation: &WorkspaceOperation,
    reason: SyncConflictReason,
    note: SupersededNoteState,
) -> Option<SupersededDocumentPlan<'_>> {
    let note_id = document_write_target(operation)?;
    let losing_markdown = match operation {
        WorkspaceOperation::SaveDocument { markdown, .. }
        | WorkspaceOperation::CreateNote { markdown, .. } => Some(markdown.as_str()),
        _ => None,
    };
    Some(SupersededDocumentPlan {
        note_id,
        preserved_markdown: losing_markdown.filter(|_| note.exists && !note.sealed),
        advances_head: reason == SyncConflictReason::ConcurrentDocumentVersion,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        RemoteApplyErrorKind, RemoteApplyFailure, SupersededDocumentPlan, SupersededNoteState,
        remote_apply_failure, superseded_document_plan,
    };
    use crate::{SealedPayload, SyncConflictReason, WorkspaceOperation};

    const PRESENT: SupersededNoteState = SupersededNoteState {
        exists: true,
        sealed: false,
    };

    fn save() -> WorkspaceOperation {
        WorkspaceOperation::SaveDocument {
            note_id: "note".into(),
            document_json: json!({ "type": "doc" }),
            markdown: "losing body".into(),
            word_count: 2,
            expected_revision: 1,
            at: 1,
        }
    }

    #[test]
    fn transient_failures_abort_the_pull() {
        assert_eq!(
            remote_apply_failure(&save(), RemoteApplyErrorKind::Transient),
            RemoteApplyFailure::Abort
        );
    }

    #[test]
    fn storage_shaped_failures_map_to_their_reason() {
        let cases = [
            (
                RemoteApplyErrorKind::RevisionConflict,
                SyncConflictReason::ConcurrentDocumentVersion,
            ),
            (
                RemoteApplyErrorKind::NotFound,
                SyncConflictReason::MissingDependency,
            ),
            (
                RemoteApplyErrorKind::AlreadyExists,
                SyncConflictReason::IdentityConflict,
            ),
        ];
        for (kind, reason) in cases {
            assert_eq!(
                remote_apply_failure(&save(), kind),
                RemoteApplyFailure::Supersede(reason)
            );
        }
    }

    #[test]
    fn rejected_operations_take_their_family_reason() {
        let moved = WorkspaceOperation::MoveNode {
            id: "note".into(),
            placement: crate::NodePlacement::last(None),
            at: 1,
        };
        assert_eq!(
            remote_apply_failure(&moved, RemoteApplyErrorKind::Rejected),
            RemoteApplyFailure::Supersede(SyncConflictReason::TreeConflict)
        );
    }

    #[test]
    fn a_losing_body_is_preserved_when_the_note_is_present_and_plain() {
        let operation = save();
        assert_eq!(
            superseded_document_plan(
                &operation,
                SyncConflictReason::ConcurrentDocumentVersion,
                PRESENT
            ),
            Some(SupersededDocumentPlan {
                note_id: "note",
                preserved_markdown: Some("losing body"),
                advances_head: true,
            })
        );
    }

    #[test]
    fn a_missing_or_locked_note_keeps_no_losing_history() {
        let operation = save();
        for note in [
            SupersededNoteState {
                exists: false,
                sealed: false,
            },
            SupersededNoteState {
                exists: true,
                sealed: true,
            },
        ] {
            let plan =
                superseded_document_plan(&operation, SyncConflictReason::TombstoneBlocked, note)
                    .unwrap();
            assert_eq!(plan.preserved_markdown, None);
            assert!(!plan.advances_head);
        }
    }

    #[test]
    fn a_sealed_write_moves_the_head_but_never_reaches_history() {
        let operation = WorkspaceOperation::SaveSealedDocument {
            note_id: "note".into(),
            sealed: SealedPayload {
                scheme: "skriuw-lock-v1".into(),
                key_id: "0123456789abcdef".into(),
                nonce: "nonce".into(),
                ciphertext: "ciphertext".into(),
            },
            expected_revision: 1,
            at: 1,
        };
        let plan = superseded_document_plan(
            &operation,
            SyncConflictReason::ConcurrentDocumentVersion,
            PRESENT,
        )
        .unwrap();
        assert_eq!(plan.preserved_markdown, None);
        assert!(plan.advances_head);
    }

    #[test]
    fn operations_without_a_document_have_no_plan() {
        let rename = WorkspaceOperation::RenameNode {
            id: "note".into(),
            title: "Renamed".into(),
            at: 1,
        };
        assert_eq!(
            superseded_document_plan(&rename, SyncConflictReason::TreeConflict, PRESENT),
            None
        );
    }
}
