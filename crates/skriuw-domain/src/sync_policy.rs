//! Product rules for the local sync queue, kept free of any storage engine.
//!
//! Storage adapters read rows, pass the facts to these functions, and write
//! the returned decision inside their own transaction. The remote convergence
//! rules live in `reconcile`; these cover what this device queues, parks,
//! requeues, and records when a replicated operation loses.

mod blocked;
mod initial;
mod outbox;
mod superseded;

pub use blocked::{
    BlockedSyncReason, CanonicalDocument, ParkedSyncOperation, blocked_reason_is_retryable,
    blocking_requires_release, requeued_operation,
};
pub use initial::{InitialSyncError, initial_sync_operations};
pub use outbox::{OutboxAdmission, OutboxTail, coalesces_into_tail, outbox_admission};
pub use superseded::{
    RemoteApplyErrorKind, RemoteApplyFailure, SupersededDocumentPlan, SupersededNoteState,
    remote_apply_failure, superseded_document_plan,
};

use crate::WorkspaceOperation;

/// The note whose canonical document an operation writes, or `None` for the
/// operations that leave document bodies alone.
#[must_use]
pub fn document_write_target(operation: &WorkspaceOperation) -> Option<&str> {
    match operation {
        WorkspaceOperation::SaveDocument { note_id, .. }
        | WorkspaceOperation::SaveSealedDocument { note_id, .. } => Some(note_id),
        WorkspaceOperation::CreateNote { id, .. } => Some(id),
        _ => None,
    }
}

/// Whether a stored document body equals an incoming one. The stored JSON is
/// compared structurally, so key order and whitespace never count as a change.
#[must_use]
pub fn documents_equivalent(
    stored_json: &str,
    stored_markdown: &str,
    document_json: &serde_json::Value,
    markdown: &str,
) -> bool {
    stored_markdown == markdown
        && serde_json::from_str::<serde_json::Value>(stored_json)
            .is_ok_and(|stored| &stored == document_json)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{document_write_target, documents_equivalent};
    use crate::{NodePlacement, WorkspaceOperation};

    #[test]
    fn document_writes_target_their_note() {
        let save = WorkspaceOperation::SaveDocument {
            note_id: "note".into(),
            document_json: json!({ "type": "doc" }),
            markdown: String::new(),
            word_count: 0,
            expected_revision: 1,
            at: 1,
        };
        let create = WorkspaceOperation::CreateNote {
            id: "created".into(),
            title: "Created".into(),
            placement: NodePlacement::last(None),
            document_json: json!({ "type": "doc" }),
            markdown: String::new(),
            at: 1,
        };
        let rename = WorkspaceOperation::RenameNode {
            id: "note".into(),
            title: "Renamed".into(),
            at: 1,
        };
        assert_eq!(document_write_target(&save), Some("note"));
        assert_eq!(document_write_target(&create), Some("created"));
        assert_eq!(document_write_target(&rename), None);
    }

    #[test]
    fn equivalence_ignores_json_formatting_but_not_content() {
        let document = json!({ "type": "doc", "content": [] });
        assert!(documents_equivalent(
            r#"{ "content": [], "type": "doc" }"#,
            "body",
            &document,
            "body"
        ));
        assert!(!documents_equivalent(
            r#"{"type":"doc","content":[]}"#,
            "body",
            &document,
            "other"
        ));
        assert!(!documents_equivalent("not json", "body", &document, "body"));
    }
}
