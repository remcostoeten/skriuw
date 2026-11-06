use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    AnnotationComment, BoundedWriter, MAX_ANNOTATION_COMMENT_BYTES, MAX_NOTE_PROPERTIES,
    MAX_OPERATION_GROUP, MAX_OPERATION_GROUP_BYTES, MediaMetadata, NoteProperty,
    NotePropertyTemplate, OperationValidationError, ProviderImportReceipt, TaskSourceDocument,
    WORKSPACE_PROTOCOL_VERSION, WorkspaceAnnotation, WorkspaceImage, WorkspacePerson,
    WorkspacePrompt, WorkspaceSettings, WorkspaceTag, WorkspaceTask, lock, validate_bounded_text,
    validate_cover_gradient, validate_cover_transform, validate_document, validate_id,
    validate_math_macros, validate_optional_id, validate_ordered_ids, validate_person,
    validate_placement, validate_reference_color, validate_reference_name, validate_revision,
    validate_tag, validate_task_document, validate_timestamp, validate_title,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOperationEnvelope {
    pub protocol_version: u16,
    pub operation: WorkspaceOperation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NodePlacement {
    pub parent_id: Option<String>,
    pub position: NodePosition,
}

impl NodePlacement {
    #[must_use]
    pub fn first(parent_id: Option<String>) -> Self {
        Self {
            parent_id,
            position: NodePosition::First,
        }
    }

    #[must_use]
    pub fn last(parent_id: Option<String>) -> Self {
        Self {
            parent_id,
            position: NodePosition::Last,
        }
    }

    #[must_use]
    pub fn before(parent_id: Option<String>, anchor_id: impl Into<String>) -> Self {
        Self {
            parent_id,
            position: NodePosition::Before {
                anchor_id: anchor_id.into(),
            },
        }
    }

    #[must_use]
    pub fn after(parent_id: Option<String>, anchor_id: impl Into<String>) -> Self {
        Self {
            parent_id,
            position: NodePosition::After {
                anchor_id: anchor_id.into(),
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum NodePosition {
    First,
    Last,
    Before { anchor_id: String },
    After { anchor_id: String },
}

impl WorkspaceOperationEnvelope {
    #[must_use]
    pub fn v1(operation: WorkspaceOperation) -> Self {
        Self {
            protocol_version: WORKSPACE_PROTOCOL_VERSION,
            operation,
        }
    }

    pub fn validate(&self) -> Result<(), OperationValidationError> {
        if self.protocol_version != WORKSPACE_PROTOCOL_VERSION {
            return Err(OperationValidationError::UnsupportedProtocol(
                self.protocol_version,
            ));
        }
        self.operation.validate()
    }
}

pub fn validate_operation_group(
    operations: &[WorkspaceOperationEnvelope],
) -> Result<(), OperationValidationError> {
    validate_operation_group_with_limits(operations, MAX_OPERATION_GROUP, MAX_OPERATION_GROUP_BYTES)
}

pub(crate) fn validate_operation_group_with_limits(
    operations: &[WorkspaceOperationEnvelope],
    maximum: usize,
    maximum_bytes: usize,
) -> Result<(), OperationValidationError> {
    if operations.len() > maximum {
        return Err(OperationValidationError::TooMany {
            field: "workspace operations",
            maximum,
        });
    }
    let mut counter = BoundedWriter::new(maximum_bytes);
    serde_json::to_writer(&mut counter, operations).map_err(|_| {
        OperationValidationError::TooLong {
            field: "workspace operations",
            maximum: maximum_bytes,
        }
    })?;
    for operation in operations {
        operation.validate()?;
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum WorkspaceOperation {
    CreateTag {
        tag: WorkspaceTag,
    },
    RenameTag {
        id: String,
        name: String,
    },
    RecolorTag {
        id: String,
        color: Option<String>,
    },
    DeleteTag {
        id: String,
    },
    CreatePerson {
        person: WorkspacePerson,
    },
    RenamePerson {
        id: String,
        name: String,
    },
    RecolorPerson {
        id: String,
        color: Option<String>,
    },
    DeletePerson {
        id: String,
    },
    CreateFolder {
        id: String,
        title: String,
        placement: NodePlacement,
        at: i64,
    },
    CreateNote {
        id: String,
        title: String,
        placement: NodePlacement,
        document_json: Value,
        markdown: String,
        at: i64,
    },
    RenameNode {
        id: String,
        title: String,
        at: i64,
    },
    SetNoteCover {
        note_id: String,
        image_id: Option<String>,
        at: i64,
    },
    SetNoteCoverGradient {
        note_id: String,
        gradient: Option<String>,
        at: i64,
    },
    SetNoteCoverFullWidth {
        note_id: String,
        full_width: bool,
        at: i64,
    },
    SetNoteCoverTransform {
        note_id: String,
        position_x: f64,
        position_y: f64,
        zoom: f64,
        at: i64,
    },
    MoveNode {
        id: String,
        placement: NodePlacement,
        at: i64,
    },
    SetNodePinned {
        id: String,
        pinned: bool,
        at: i64,
    },
    /// Marks a note or folder as locked. The bodies of the notes it covers
    /// must already be sealed, or the applying device must hold the lock key
    /// so it can seal them; a device that can do neither refuses.
    SetNodeLocked {
        id: String,
        locked: bool,
        at: i64,
    },
    /// Writes a locked note's body as ciphertext. Devices that hold the lock
    /// key open it on demand; every other device stores it as is.
    SaveSealedDocument {
        note_id: String,
        sealed: lock::SealedPayload,
        expected_revision: i64,
        at: i64,
    },
    /// Installs or replaces the workspace's note lock: the wrapped content key
    /// under both the secret and the recovery code. Carries no key material.
    ConfigureNoteLock {
        lock: lock::NoteLockConfig,
        at: i64,
    },
    /// Removes the note lock after every locked note was unlocked.
    RemoveNoteLock {
        at: i64,
    },
    SaveDocument {
        note_id: String,
        document_json: Value,
        markdown: String,
        word_count: i64,
        expected_revision: i64,
        at: i64,
    },
    TrashSubtree {
        root_id: String,
        at: i64,
    },
    RestoreSubtree {
        root_id: String,
        placement: NodePlacement,
        at: i64,
    },
    PurgeSubtree {
        root_id: String,
        trashed_before: i64,
    },
    SetActiveNote {
        note_id: Option<String>,
    },
    UpdateSettings {
        settings: WorkspaceSettings,
    },
    SetMathMacros {
        macros: BTreeMap<String, String>,
    },
    AttachImage {
        image: WorkspaceImage,
    },
    SetMediaMetadata {
        metadata: MediaMetadata,
    },
    SetNoteProperty {
        property: NoteProperty,
        at: i64,
    },
    RemoveNoteProperty {
        note_id: String,
        property_id: String,
        at: i64,
    },
    ReorderNoteProperties {
        note_id: String,
        ordered_property_ids: Vec<String>,
        at: i64,
    },
    SetNotePropertyTemplate {
        template: NotePropertyTemplate,
    },
    DeleteNotePropertyTemplate {
        template_id: String,
    },
    ReorderNotePropertyTemplates {
        ordered_template_ids: Vec<String>,
    },
    RecordProviderImport {
        receipt: ProviderImportReceipt,
    },
    CreateTask {
        task: Box<WorkspaceTask>,
    },
    UpdateTask {
        task: Box<WorkspaceTask>,
        document: Option<Box<TaskSourceDocument>>,
    },
    DeleteTask {
        id: String,
        document: Option<Box<TaskSourceDocument>>,
        at: i64,
    },
    DetachTask {
        id: String,
        document: Option<Box<TaskSourceDocument>>,
        at: i64,
    },
    /// Creates the task and stamps the checklist item that produced it in one
    /// indivisible step. Splitting this into a document save plus a task
    /// create would allow a half-promoted checklist item to survive a crash.
    PromoteChecklistTask {
        task: Box<WorkspaceTask>,
        document: Box<TaskSourceDocument>,
    },
    /// Creates the thread and its opening comment together. Splitting them
    /// would let a crash strand an anchored thread with nothing to read.
    CreateAnnotation {
        annotation: Box<WorkspaceAnnotation>,
    },
    AddAnnotationComment {
        annotation_id: String,
        comment: Box<AnnotationComment>,
    },
    UpdateAnnotationComment {
        annotation_id: String,
        comment_id: String,
        body_markdown: String,
        updated_at: i64,
    },
    /// Removing the last comment leaves the thread in place; a thread is only
    /// destroyed by `DeleteAnnotation`, which tombstones it.
    DeleteAnnotationComment {
        annotation_id: String,
        comment_id: String,
    },
    ResolveAnnotation {
        id: String,
        at: i64,
    },
    ReopenAnnotation {
        id: String,
    },
    DeleteAnnotation {
        id: String,
    },
    SetPrompt {
        prompt: Box<WorkspacePrompt>,
    },
    DeletePrompt {
        id: String,
    },
}

impl WorkspaceOperation {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        match self {
            Self::CreateTag { tag } => validate_tag(tag),
            Self::RenameTag { id, name } | Self::RenamePerson { id, name } => {
                validate_id("id", id)?;
                validate_reference_name(name)
            }
            Self::RecolorTag { id, color } | Self::RecolorPerson { id, color } => {
                validate_id("id", id)?;
                validate_reference_color(color)
            }
            Self::DeleteTag { id } | Self::DeletePerson { id } => validate_id("id", id),
            Self::CreatePerson { person } => validate_person(person),
            Self::CreateFolder {
                id,
                title,
                placement,
                at,
                ..
            } => {
                validate_id("id", id)?;
                validate_title(title)?;
                validate_timestamp(*at)?;
                validate_placement(id, placement)
            }
            Self::CreateNote {
                id,
                title,
                placement,
                document_json,
                markdown,
                at,
            } => {
                validate_id("id", id)?;
                validate_title(title)?;
                validate_document(document_json, markdown)?;
                validate_timestamp(*at)?;
                validate_placement(id, placement)
            }
            Self::RenameNode { id, title, at } => {
                validate_id("id", id)?;
                validate_title(title)?;
                validate_timestamp(*at)
            }
            Self::SetNoteCover {
                note_id,
                image_id,
                at,
            } => {
                validate_id("note id", note_id)?;
                if let Some(image_id) = image_id {
                    validate_id("image id", image_id)?;
                }
                validate_timestamp(*at)
            }
            Self::SetNoteCoverGradient {
                note_id,
                gradient,
                at,
            } => {
                validate_id("note id", note_id)?;
                if let Some(gradient) = gradient {
                    validate_cover_gradient(gradient)?;
                }
                validate_timestamp(*at)
            }
            Self::SetNoteCoverFullWidth { note_id, at, .. } => {
                validate_id("note id", note_id)?;
                validate_timestamp(*at)
            }
            Self::SetNoteCoverTransform {
                note_id,
                position_x,
                position_y,
                zoom,
                at,
            } => {
                validate_id("note id", note_id)?;
                validate_cover_transform(*position_x, *position_y, *zoom)?;
                validate_timestamp(*at)
            }
            Self::SetNodePinned { id, at, .. } | Self::SetNodeLocked { id, at, .. } => {
                validate_id("id", id)?;
                validate_timestamp(*at)
            }
            Self::SaveSealedDocument {
                note_id,
                sealed,
                expected_revision,
                at,
            } => {
                lock::validate_sealed_document(note_id, sealed)?;
                validate_revision(*expected_revision)?;
                validate_timestamp(*at)
            }
            Self::ConfigureNoteLock { lock, at } => {
                lock::validate_note_lock_config(lock)?;
                validate_timestamp(*at)
            }
            Self::RemoveNoteLock { at } => validate_timestamp(*at),
            Self::MoveNode {
                id, placement, at, ..
            }
            | Self::RestoreSubtree {
                root_id: id,
                placement,
                at,
                ..
            } => {
                validate_id("id", id)?;
                validate_timestamp(*at)?;
                validate_placement(id, placement)
            }
            Self::SaveDocument {
                note_id,
                document_json,
                markdown,
                word_count,
                expected_revision,
                at,
            } => {
                validate_id("note id", note_id)?;
                validate_document(document_json, markdown)?;
                if *word_count < 0 {
                    return Err(OperationValidationError::NegativeWordCount);
                }
                validate_revision(*expected_revision)?;
                validate_timestamp(*at)
            }
            Self::TrashSubtree { root_id, at } => {
                validate_id("root id", root_id)?;
                validate_timestamp(*at)
            }
            Self::PurgeSubtree {
                root_id,
                trashed_before,
            } => {
                validate_id("root id", root_id)?;
                validate_timestamp(*trashed_before)
            }
            Self::SetActiveNote { note_id } => validate_optional_id("note id", note_id),
            Self::UpdateSettings { settings } => settings.validate(),
            Self::SetMathMacros { macros } => validate_math_macros(macros),
            Self::AttachImage { image } => image.validate(),
            Self::SetMediaMetadata { metadata } => metadata.validate(),
            Self::SetNoteProperty { property, at } => {
                validate_id("note id", &property.note_id)?;
                property.field.validate()?;
                validate_timestamp(*at)
            }
            Self::RemoveNoteProperty {
                note_id,
                property_id,
                at,
            } => {
                validate_id("note id", note_id)?;
                validate_id("property id", property_id)?;
                validate_timestamp(*at)
            }
            Self::ReorderNoteProperties {
                note_id,
                ordered_property_ids,
                at,
            } => {
                validate_id("note id", note_id)?;
                validate_ordered_ids(
                    "property reorder",
                    ordered_property_ids,
                    MAX_NOTE_PROPERTIES,
                )?;
                validate_timestamp(*at)
            }
            Self::SetNotePropertyTemplate { template } => template.validate(),
            Self::DeleteNotePropertyTemplate { template_id } => {
                validate_id("property template id", template_id)
            }
            Self::ReorderNotePropertyTemplates {
                ordered_template_ids,
            } => validate_ordered_ids(
                "property template reorder",
                ordered_template_ids,
                MAX_NOTE_PROPERTIES,
            ),
            Self::RecordProviderImport { receipt } => {
                validate_bounded_text("import provider", &receipt.provider, 80)?;
                validate_bounded_text("import source key", &receipt.source_key, 128)?;
                validate_bounded_text("import source path", &receipt.source_path, 1_024)?;
                validate_id("import note id", &receipt.note_id)?;
                validate_timestamp(receipt.imported_at)
            }
            Self::CreateAnnotation { annotation } => annotation.validate_as_created(),
            Self::AddAnnotationComment {
                annotation_id,
                comment,
            } => {
                validate_id("annotation id", annotation_id)?;
                comment.validate()
            }
            Self::UpdateAnnotationComment {
                annotation_id,
                comment_id,
                body_markdown,
                updated_at,
            } => {
                validate_id("annotation id", annotation_id)?;
                validate_id("annotation comment id", comment_id)?;
                validate_bounded_text(
                    "annotation comment body",
                    body_markdown,
                    MAX_ANNOTATION_COMMENT_BYTES,
                )?;
                validate_timestamp(*updated_at)
            }
            Self::DeleteAnnotationComment {
                annotation_id,
                comment_id,
            } => {
                validate_id("annotation id", annotation_id)?;
                validate_id("annotation comment id", comment_id)
            }
            Self::ResolveAnnotation { id, at } => {
                validate_id("annotation id", id)?;
                validate_timestamp(*at)
            }
            Self::ReopenAnnotation { id } | Self::DeleteAnnotation { id } => {
                validate_id("annotation id", id)
            }
            Self::CreateTask { task } => task.validate(),
            Self::UpdateTask { task, document } => {
                task.validate()?;
                validate_task_document(task, document.as_deref())
            }
            Self::DeleteTask { id, document, at } | Self::DetachTask { id, document, at } => {
                validate_id("task id", id)?;
                validate_timestamp(*at)?;
                if let Some(document) = document {
                    document.validate()?;
                }
                Ok(())
            }
            Self::PromoteChecklistTask { task, document } => {
                task.validate()?;
                if task.source.is_none() {
                    return Err(OperationValidationError::UnlinkedTaskSource {
                        id: task.id.clone(),
                    });
                }
                validate_task_document(task, Some(document.as_ref()))
            }
            Self::SetPrompt { prompt } => prompt.validate(),
            Self::DeletePrompt { id } => validate_id("prompt id", id),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        WorkspaceOperation, WorkspaceOperationEnvelope, validate_operation_group_with_limits,
    };
    use crate::{
        DocumentLimits, MAX_MEDIA_ALT_BYTES, MAX_MEDIA_NAME_BYTES, MAX_OPERATION_GROUP_BYTES,
        MediaMetadata, NodePlacement, OperationValidationError, WORKSPACE_PROTOCOL_VERSION,
        WorkspaceImage, validate_document_with_limits,
    };

    #[test]
    fn operation_wire_format_is_stable() {
        let envelope = WorkspaceOperationEnvelope::v1(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: json!({"type": "doc"}),
            markdown: "# Note".into(),
            word_count: 1,
            expected_revision: 3,
            at: 42,
        });

        let value = serde_json::to_value(envelope).expect("serialize operation");
        assert_eq!(value["protocolVersion"], WORKSPACE_PROTOCOL_VERSION);
        assert_eq!(value["operation"]["type"], "save_document");
        assert_eq!(value["operation"]["expectedRevision"], 3);

        let purge = WorkspaceOperationEnvelope::v1(WorkspaceOperation::PurgeSubtree {
            root_id: "folder-1".into(),
            trashed_before: 86_400,
        });
        let value = serde_json::to_value(purge).expect("serialize purge operation");
        assert_eq!(value["operation"]["type"], "purge_subtree");
        assert_eq!(value["operation"]["rootId"], "folder-1");
        assert_eq!(value["operation"]["trashedBefore"], 86_400);

        let placement = WorkspaceOperationEnvelope::v1(WorkspaceOperation::MoveNode {
            id: "note-1".into(),
            placement: NodePlacement::before(Some("folder-1".into()), "note-2"),
            at: 43,
        });
        let value = serde_json::to_value(placement).expect("serialize node placement");
        assert_eq!(value["operation"]["placement"]["parentId"], "folder-1");
        assert_eq!(
            value["operation"]["placement"]["position"]["type"],
            "before"
        );
        assert_eq!(
            value["operation"]["placement"]["position"]["anchorId"],
            "note-2"
        );
    }

    #[test]
    fn validates_portable_operation_rules() {
        let invalid_id = WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateFolder {
            id: "../folder".into(),
            title: "Folder".into(),
            placement: NodePlacement::last(None),
            at: 1,
        });
        assert!(matches!(
            invalid_id.validate(),
            Err(OperationValidationError::InvalidIdentifier { .. })
        ));

        let invalid_document = WorkspaceOperationEnvelope::v1(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: json!([]),
            markdown: String::new(),
            word_count: 0,
            expected_revision: 1,
            at: 1,
        });
        assert_eq!(
            invalid_document.validate(),
            Err(OperationValidationError::InvalidDocument)
        );

        let invalid_cutoff = WorkspaceOperationEnvelope::v1(WorkspaceOperation::PurgeSubtree {
            root_id: "folder-1".into(),
            trashed_before: -1,
        });
        assert_eq!(
            invalid_cutoff.validate(),
            Err(OperationValidationError::NegativeTimestamp)
        );

        let self_anchor = WorkspaceOperationEnvelope::v1(WorkspaceOperation::MoveNode {
            id: "note-1".into(),
            placement: NodePlacement::after(None, "note-1"),
            at: 1,
        });
        assert_eq!(
            self_anchor.validate(),
            Err(OperationValidationError::SelfAnchor)
        );
    }

    #[test]
    fn bounds_document_shape_bytes_and_operation_groups() {
        let limits = DocumentLimits {
            json_bytes: 48,
            markdown_bytes: 4,
            nodes: 4,
            depth: 3,
        };
        assert!(matches!(
            validate_document_with_limits(&json!({"type": "doc"}), "12345", limits),
            Err(OperationValidationError::TooLong {
                field: "document Markdown",
                ..
            })
        ));
        assert!(matches!(
            validate_document_with_limits(
                &json!({"type": "doc", "text": "a string that exceeds the JSON limit"}),
                "",
                limits,
            ),
            Err(OperationValidationError::TooLong {
                field: "document JSON",
                ..
            })
        ));
        assert!(matches!(
            validate_document_with_limits(&json!({"a": [1, 2, 3, 4]}), "", limits),
            Err(OperationValidationError::TooMany {
                field: "document JSON nodes",
                ..
            })
        ));
        assert!(matches!(
            validate_document_with_limits(&json!({"a": {"b": {"c": 1}}}), "", limits),
            Err(OperationValidationError::DocumentTooDeep { maximum: 3 })
        ));

        let operation =
            WorkspaceOperationEnvelope::v1(WorkspaceOperation::SetActiveNote { note_id: None });
        assert!(matches!(
            validate_operation_group_with_limits(
                &[operation.clone(), operation],
                1,
                MAX_OPERATION_GROUP_BYTES,
            ),
            Err(OperationValidationError::TooMany {
                field: "workspace operations",
                maximum: 1,
            })
        ));
        let operation =
            WorkspaceOperationEnvelope::v1(WorkspaceOperation::SetActiveNote { note_id: None });
        assert!(matches!(
            validate_operation_group_with_limits(&[operation], 1, 8),
            Err(OperationValidationError::TooLong {
                field: "workspace operations",
                maximum: 8,
            })
        ));
    }

    #[test]
    fn set_media_metadata_wire_format_and_validation() {
        fn metadata() -> MediaMetadata {
            MediaMetadata {
                content_hash: "a".repeat(64),
                name: "Roadmap hero".into(),
                alt: "A wide shot of the team wall".into(),
                updated_at: 9,
            }
        }

        let envelope = WorkspaceOperationEnvelope::v1(WorkspaceOperation::SetMediaMetadata {
            metadata: metadata(),
        });
        envelope.validate().expect("valid media metadata");
        let value = serde_json::to_value(&envelope).expect("serialize media metadata");
        assert_eq!(value["operation"]["type"], "set_media_metadata");
        assert_eq!(
            value["operation"]["metadata"]["contentHash"],
            "a".repeat(64)
        );
        assert_eq!(value["operation"]["metadata"]["name"], "Roadmap hero");

        let mut blank = metadata();
        blank.name = "  ".into();
        blank.alt = String::new();
        blank
            .validate()
            .expect("a blank record is valid; storage drops it");
        assert!(blank.is_empty());
        assert!(!metadata().is_empty());

        let mut short_hash = metadata();
        short_hash.content_hash = "abc".into();
        assert_eq!(
            short_hash.validate(),
            Err(OperationValidationError::InvalidIdentifier {
                field: "content hash"
            })
        );
        let mut long_name = metadata();
        long_name.name = "n".repeat(MAX_MEDIA_NAME_BYTES + 1);
        assert_eq!(
            long_name.validate(),
            Err(OperationValidationError::TooLong {
                field: "media name",
                maximum: MAX_MEDIA_NAME_BYTES
            })
        );
        let mut long_alt = metadata();
        long_alt.alt = "a".repeat(MAX_MEDIA_ALT_BYTES + 1);
        assert_eq!(
            long_alt.validate(),
            Err(OperationValidationError::TooLong {
                field: "media alt text",
                maximum: MAX_MEDIA_ALT_BYTES
            })
        );
    }

    #[test]
    fn attach_image_wire_format_and_validation() {
        fn image() -> WorkspaceImage {
            WorkspaceImage {
                id: "image-1".into(),
                note_id: "note-1".into(),
                content_hash: "a".repeat(64),
                mime_type: "image/png".into(),
                byte_size: 512,
                width: Some(32),
                height: Some(32),
                created_at: 7,
            }
        }

        let envelope =
            WorkspaceOperationEnvelope::v1(WorkspaceOperation::AttachImage { image: image() });
        envelope.validate().expect("valid attach image");
        let value = serde_json::to_value(&envelope).expect("serialize attach image");
        assert_eq!(value["operation"]["type"], "attach_image");
        assert_eq!(value["operation"]["image"]["noteId"], "note-1");
        assert_eq!(value["operation"]["image"]["contentHash"], "a".repeat(64));

        let mut short_hash = image();
        short_hash.content_hash = "abc".into();
        assert_eq!(
            short_hash.validate(),
            Err(OperationValidationError::InvalidIdentifier {
                field: "content hash"
            })
        );
        let mut bad_mime = image();
        bad_mime.mime_type = "text/plain".into();
        assert_eq!(
            bad_mime.validate(),
            Err(OperationValidationError::InvalidIdentifier { field: "mime type" })
        );
        let mut empty_size = image();
        empty_size.byte_size = 0;
        assert_eq!(
            empty_size.validate(),
            Err(OperationValidationError::NotPositive {
                field: "image byte size"
            })
        );
        let mut flat = image();
        flat.height = Some(0);
        assert_eq!(
            flat.validate(),
            Err(OperationValidationError::NotPositive {
                field: "image height"
            })
        );
    }

    #[test]
    fn cover_gradients_must_name_a_built_in() {
        fn gradient(id: Option<&str>) -> WorkspaceOperation {
            WorkspaceOperation::SetNoteCoverGradient {
                note_id: "note-1".into(),
                gradient: id.map(str::to_owned),
                at: 7,
            }
        }
        assert_eq!(gradient(Some("ocean")).validate(), Ok(()));
        assert_eq!(gradient(None).validate(), Ok(()));
        assert_eq!(
            gradient(Some("linear-gradient(red, blue)")).validate(),
            Err(OperationValidationError::UnknownCoverGradient {
                id: "linear-gradient(red, blue)".into()
            })
        );
    }

    #[test]
    fn accepts_video_mime_types_on_attach() {
        fn attachment(mime_type: &str) -> WorkspaceImage {
            WorkspaceImage {
                id: "media-1".into(),
                note_id: "note-1".into(),
                content_hash: "a".repeat(64),
                mime_type: mime_type.into(),
                byte_size: 512,
                width: None,
                height: None,
                created_at: 7,
            }
        }
        assert_eq!(attachment("video/mp4").validate(), Ok(()));
        assert_eq!(attachment("video/webm").validate(), Ok(()));
        assert_eq!(
            attachment("application/pdf").validate(),
            Err(OperationValidationError::InvalidIdentifier { field: "mime type" })
        );
    }
}
