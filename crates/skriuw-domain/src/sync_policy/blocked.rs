use super::{document_write_target, documents_equivalent};
use crate::{
    BlockedSyncOperationView, DiscardedSyncOperationView, SealedPayload, WorkspaceOperation,
    WorkspaceOperationEnvelope,
};

/// Why a replicable operation sits in the blocked queue instead of the outbox.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockedSyncReason {
    UnsupportedOperation,
    OperationTooLarge,
    AssetContentMissing,
    CloudRejected,
}

impl BlockedSyncReason {
    #[must_use]
    pub const fn code(self) -> &'static str {
        match self {
            Self::UnsupportedOperation => "unsupported_operation",
            Self::OperationTooLarge => "operation_too_large",
            Self::AssetContentMissing => "asset_content_missing",
            Self::CloudRejected => "cloud_rejected",
        }
    }

    #[must_use]
    pub fn from_code(code: &str) -> Option<Self> {
        [
            Self::UnsupportedOperation,
            Self::OperationTooLarge,
            Self::AssetContentMissing,
            Self::CloudRejected,
        ]
        .into_iter()
        .find(|reason| reason.code() == code)
    }

    /// Whether a retry can ever succeed under the current sync protocol.
    #[must_use]
    pub const fn is_retryable(self) -> bool {
        !matches!(self, Self::UnsupportedOperation | Self::OperationTooLarge)
    }
}

/// Whether a stored reason code may be retried. Codes this build does not
/// know stay retryable, so a newer reason never strands a record.
#[must_use]
pub fn blocked_reason_is_retryable(code: &str) -> bool {
    BlockedSyncReason::from_code(code).is_none_or(BlockedSyncReason::is_retryable)
}

/// Whether parking a claimed batch must instead release it for a retry. A
/// row attempted more than once may already be server-visible, and parking
/// renumbers the remaining outbox, which could collide with a client sequence
/// the server accepted. A cloud rejection is final for that row, so it parks.
#[must_use]
pub fn blocking_requires_release(reason: BlockedSyncReason, most_attempts: i64) -> bool {
    most_attempts > 1 && reason != BlockedSyncReason::CloudRejected
}

/// One unresolved or discarded row of the blocked queue.
#[derive(Debug, Clone, PartialEq)]
pub struct ParkedSyncOperation {
    pub id: String,
    pub operation_type: String,
    pub reason_code: String,
    pub envelope: WorkspaceOperationEnvelope,
    pub created_at: i64,
}

impl ParkedSyncOperation {
    /// The entity the recovery surface names for this operation.
    #[must_use]
    pub fn target_id(&self) -> Option<&str> {
        self.envelope.operation.target_entity_id()
    }

    #[must_use]
    pub fn blocked_view(self, target_title: Option<String>) -> BlockedSyncOperationView {
        let target_id = self.target_id().map(str::to_owned);
        let (asset_content_hash, asset_mime_type) = self
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
        BlockedSyncOperationView {
            blocked_id: self.id,
            operation_type: self.operation_type,
            reason_code: self.reason_code,
            target_id,
            target_title,
            asset_content_hash,
            asset_mime_type,
            first_blocked_at: self.created_at,
        }
    }

    #[must_use]
    pub fn discarded_view(
        self,
        target_title: Option<String>,
        discarded_at: i64,
    ) -> DiscardedSyncOperationView {
        let target_id = self.target_id().map(str::to_owned);
        DiscardedSyncOperationView {
            blocked_id: self.id,
            operation_type: self.operation_type,
            reason_code: self.reason_code,
            target_id,
            target_title,
            first_blocked_at: self.created_at,
            discarded_at,
        }
    }
}

/// The canonical body this device holds for the note a parked write targets.
#[derive(Debug, Clone, PartialEq)]
pub enum CanonicalDocument {
    Sealed {
        sealed: SealedPayload,
        revision: i64,
    },
    Plain {
        document_json: String,
        markdown: String,
        revision: i64,
        word_count: i64,
    },
}

/// The operation a parked change re-enters the outbox as. A parked document
/// write whose body no longer matches the canonical document is replaced by a
/// write of the canonical body, so the stale version can never overtake later
/// local edits on other devices. Everything else requeues unchanged.
pub fn requeued_operation(
    parked: &WorkspaceOperationEnvelope,
    canonical: Option<CanonicalDocument>,
    at: i64,
) -> Result<WorkspaceOperationEnvelope, serde_json::Error> {
    let (Some(note_id), Some(canonical)) = (document_write_target(&parked.operation), canonical)
    else {
        return Ok(parked.clone());
    };
    let (stored_json, stored_markdown, revision, word_count) = match canonical {
        CanonicalDocument::Sealed { sealed, revision } => {
            let same = matches!(
                &parked.operation,
                WorkspaceOperation::SaveSealedDocument { sealed: current, .. } if *current == sealed
            );
            if same {
                return Ok(parked.clone());
            }
            let mut fresh = parked.clone();
            fresh.operation = WorkspaceOperation::SaveSealedDocument {
                note_id: note_id.to_owned(),
                sealed,
                expected_revision: revision,
                at: at.max(0),
            };
            return Ok(fresh);
        }
        CanonicalDocument::Plain {
            document_json,
            markdown,
            revision,
            word_count,
        } => (document_json, markdown, revision, word_count),
    };
    let (parked_json, parked_markdown) = match &parked.operation {
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
        _ => return Ok(parked.clone()),
    };
    if documents_equivalent(&stored_json, &stored_markdown, parked_json, parked_markdown) {
        return Ok(parked.clone());
    }
    let document_json = serde_json::from_str(&stored_json)?;
    let mut fresh = parked.clone();
    fresh.operation = match &parked.operation {
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        BlockedSyncReason, CanonicalDocument, ParkedSyncOperation, blocked_reason_is_retryable,
        blocking_requires_release, requeued_operation,
    };
    use crate::{
        NodePlacement, SealedPayload, WorkspaceImage, WorkspaceOperation,
        WorkspaceOperationEnvelope,
    };

    fn save(markdown: &str) -> WorkspaceOperationEnvelope {
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::SaveDocument {
            note_id: "note".into(),
            document_json: json!({ "type": "doc", "text": markdown }),
            markdown: markdown.into(),
            word_count: 1,
            expected_revision: 2,
            at: 10,
        })
    }

    fn plain(markdown: &str, revision: i64) -> CanonicalDocument {
        CanonicalDocument::Plain {
            document_json: json!({ "type": "doc", "text": markdown }).to_string(),
            markdown: markdown.into(),
            revision,
            word_count: 3,
        }
    }

    fn sealed(ciphertext: &str) -> SealedPayload {
        SealedPayload {
            scheme: "skriuw-lock-v1".into(),
            key_id: "0123456789abcdef".into(),
            nonce: "nonce".into(),
            ciphertext: ciphertext.into(),
        }
    }

    #[test]
    fn reason_codes_round_trip() {
        for reason in [
            BlockedSyncReason::UnsupportedOperation,
            BlockedSyncReason::OperationTooLarge,
            BlockedSyncReason::AssetContentMissing,
            BlockedSyncReason::CloudRejected,
        ] {
            assert_eq!(BlockedSyncReason::from_code(reason.code()), Some(reason));
        }
        assert_eq!(BlockedSyncReason::from_code("tree_conflict"), None);
    }

    #[test]
    fn protocol_limits_are_never_retryable() {
        assert!(!blocked_reason_is_retryable("operation_too_large"));
        assert!(!blocked_reason_is_retryable("unsupported_operation"));
        assert!(blocked_reason_is_retryable("asset_content_missing"));
        assert!(blocked_reason_is_retryable("cloud_rejected"));
        assert!(blocked_reason_is_retryable("a_future_reason"));
    }

    #[test]
    fn a_previously_pushed_batch_parks_only_on_cloud_rejection() {
        assert!(!blocking_requires_release(
            BlockedSyncReason::AssetContentMissing,
            1
        ));
        assert!(blocking_requires_release(
            BlockedSyncReason::AssetContentMissing,
            2
        ));
        assert!(blocking_requires_release(
            BlockedSyncReason::OperationTooLarge,
            3
        ));
        assert!(!blocking_requires_release(
            BlockedSyncReason::CloudRejected,
            3
        ));
    }

    #[test]
    fn a_matching_parked_body_requeues_unchanged() {
        let parked = save("same");
        assert_eq!(
            requeued_operation(&parked, Some(plain("same", 7)), 50).unwrap(),
            parked
        );
    }

    #[test]
    fn a_stale_parked_save_requeues_as_the_canonical_body() {
        let requeued = requeued_operation(&save("old"), Some(plain("newer", 7)), 50).unwrap();
        assert_eq!(
            requeued.operation,
            WorkspaceOperation::SaveDocument {
                note_id: "note".into(),
                document_json: json!({ "type": "doc", "text": "newer" }),
                markdown: "newer".into(),
                word_count: 3,
                expected_revision: 7,
                at: 50,
            }
        );
    }

    #[test]
    fn a_stale_parked_create_keeps_its_node_record() {
        let parked = WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateNote {
            id: "note".into(),
            title: "Title".into(),
            placement: NodePlacement::last(None),
            document_json: json!({ "type": "doc", "text": "old" }),
            markdown: "old".into(),
            at: 4,
        });
        let requeued = requeued_operation(&parked, Some(plain("newer", 7)), 50).unwrap();
        assert_eq!(
            requeued.operation,
            WorkspaceOperation::CreateNote {
                id: "note".into(),
                title: "Title".into(),
                placement: NodePlacement::last(None),
                document_json: json!({ "type": "doc", "text": "newer" }),
                markdown: "newer".into(),
                at: 4,
            }
        );
    }

    #[test]
    fn a_note_sealed_since_parking_requeues_as_its_sealed_body() {
        let requeued = requeued_operation(
            &save("plain"),
            Some(CanonicalDocument::Sealed {
                sealed: sealed("current"),
                revision: 9,
            }),
            -5,
        )
        .unwrap();
        assert_eq!(
            requeued.operation,
            WorkspaceOperation::SaveSealedDocument {
                note_id: "note".into(),
                sealed: sealed("current"),
                expected_revision: 9,
                at: 0,
            }
        );
    }

    #[test]
    fn a_current_sealed_write_requeues_unchanged() {
        let parked = WorkspaceOperationEnvelope::v1(WorkspaceOperation::SaveSealedDocument {
            note_id: "note".into(),
            sealed: sealed("current"),
            expected_revision: 3,
            at: 1,
        });
        let canonical = CanonicalDocument::Sealed {
            sealed: sealed("current"),
            revision: 9,
        };
        assert_eq!(
            requeued_operation(&parked, Some(canonical), 50).unwrap(),
            parked
        );
    }

    #[test]
    fn a_purged_note_or_non_document_write_requeues_unchanged() {
        let parked = save("old");
        assert_eq!(requeued_operation(&parked, None, 50).unwrap(), parked);
        let rename = WorkspaceOperationEnvelope::v1(WorkspaceOperation::RenameNode {
            id: "note".into(),
            title: "Renamed".into(),
            at: 1,
        });
        assert_eq!(
            requeued_operation(&rename, Some(plain("x", 1)), 50).unwrap(),
            rename
        );
    }

    #[test]
    fn a_corrupt_canonical_body_is_an_error() {
        let canonical = CanonicalDocument::Plain {
            document_json: "{".into(),
            markdown: "newer".into(),
            revision: 1,
            word_count: 1,
        };
        assert!(requeued_operation(&save("old"), Some(canonical), 50).is_err());
    }

    #[test]
    fn views_name_the_target_and_the_missing_asset() {
        let image = WorkspaceImage {
            id: "image".into(),
            note_id: "note".into(),
            content_hash: "a".repeat(64),
            mime_type: "image/png".into(),
            byte_size: 3,
            width: None,
            height: None,
            created_at: 1,
        };
        let parked = ParkedSyncOperation {
            id: "blocked".into(),
            operation_type: "attach_image".into(),
            reason_code: "asset_content_missing".into(),
            envelope: WorkspaceOperationEnvelope::v1(WorkspaceOperation::AttachImage { image }),
            created_at: 5,
        };
        let view = parked.clone().blocked_view(Some("Note".into()));
        assert_eq!(view.blocked_id, "blocked");
        assert_eq!(view.target_title.as_deref(), Some("Note"));
        assert_eq!(view.asset_content_hash, Some("a".repeat(64)));
        assert_eq!(view.asset_mime_type.as_deref(), Some("image/png"));
        assert_eq!(view.first_blocked_at, 5);
        let discarded = parked.discarded_view(None, 9);
        assert_eq!(discarded.discarded_at, 9);
        assert_eq!(discarded.target_id, view.target_id);
    }
}
