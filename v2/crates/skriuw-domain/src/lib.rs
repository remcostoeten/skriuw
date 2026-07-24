use std::collections::{BTreeMap, BTreeSet};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

pub const WORKSPACE_PROTOCOL_VERSION: u16 = 1;
pub const WORKSPACE_ARCHIVE_VERSION: u16 = 1;
pub const WORKSPACE_SETTINGS_VERSION: u16 = 1;
pub const MAX_ENTITY_ID_BYTES: usize = 128;
pub const MAX_TITLE_BYTES: usize = 512;
pub const MAX_SETTING_KEY_BYTES: usize = 128;
pub const MAX_SETTING_TEXT_BYTES: usize = 512;
pub const MAX_REFERENCE_NAME_BYTES: usize = 512;
pub const MAX_REFERENCE_COLOR_BYTES: usize = 64;

pub const SETTINGS_FIELDS: [&str; 10] = [
    "settingsVersion",
    "theme",
    "compactSidebar",
    "showPageIcons",
    "reduceMotion",
    "rememberLastNote",
    "editorFont",
    "editorLineHeight",
    "showLineNumbers",
    "editorPlaceholder",
];

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum OperationValidationError {
    #[error("unsupported workspace protocol version {0}")]
    UnsupportedProtocol(u16),
    #[error("{field} cannot be empty")]
    Empty { field: &'static str },
    #[error("{field} exceeds {maximum} bytes")]
    TooLong { field: &'static str, maximum: usize },
    #[error("{field} contains unsupported characters")]
    InvalidIdentifier { field: &'static str },
    #[error("timestamp cannot be negative")]
    NegativeTimestamp,
    #[error("document must be a JSON object")]
    InvalidDocument,
    #[error("word count cannot be negative")]
    NegativeWordCount,
    #[error("expected revision must be between 1 and {maximum}")]
    InvalidRevision { maximum: i64 },
    #[error("node cannot be its own parent")]
    SelfParent,
    #[error("node cannot be placed relative to itself")]
    SelfAnchor,
    #[error("unsupported workspace settings version {0}")]
    UnsupportedSettingsVersion(u16),
    #[error("extension setting {key} collides with a schema field")]
    SettingFieldCollision { key: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ArchiveValidationError {
    #[error("unsupported workspace archive version {0}")]
    UnsupportedArchiveVersion(u16),
    #[error("unsupported workspace protocol version {0}")]
    UnsupportedProtocol(u16),
    #[error("invalid workspace archive: {0}")]
    Invalid(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Note,
    Folder,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceNode {
    pub id: String,
    pub kind: NodeKind,
    pub parent_id: Option<String>,
    pub rank: i64,
    pub title: String,
    pub icon: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDocument {
    pub note_id: String,
    pub document_json: Value,
    pub markdown: String,
    pub revision: i64,
    pub word_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct HistoryHeader {
    pub note_id: String,
    pub version_id: String,
    pub created_at: i64,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettings {
    #[serde(default = "default_settings_version")]
    pub settings_version: u16,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub compact_sidebar: bool,
    #[serde(default = "default_enabled")]
    pub show_page_icons: bool,
    #[serde(default)]
    pub reduce_motion: bool,
    #[serde(default = "default_enabled")]
    pub remember_last_note: bool,
    #[serde(default = "default_editor_font")]
    pub editor_font: String,
    #[serde(default = "default_editor_line_height")]
    pub editor_line_height: String,
    #[serde(default = "default_enabled")]
    pub show_line_numbers: bool,
    #[serde(default = "default_editor_placeholder")]
    pub editor_placeholder: String,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, Value>,
}

impl Default for WorkspaceSettings {
    fn default() -> Self {
        Self {
            settings_version: default_settings_version(),
            theme: default_theme(),
            compact_sidebar: false,
            show_page_icons: default_enabled(),
            reduce_motion: false,
            remember_last_note: default_enabled(),
            editor_font: default_editor_font(),
            editor_line_height: default_editor_line_height(),
            show_line_numbers: default_enabled(),
            editor_placeholder: default_editor_placeholder(),
            extensions: BTreeMap::new(),
        }
    }
}

impl WorkspaceSettings {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        if self.settings_version != WORKSPACE_SETTINGS_VERSION {
            return Err(OperationValidationError::UnsupportedSettingsVersion(
                self.settings_version,
            ));
        }
        validate_id("theme", &self.theme)?;
        validate_id("editor font", &self.editor_font)?;
        validate_id("editor line height", &self.editor_line_height)?;
        validate_setting_text("editor placeholder", &self.editor_placeholder)?;
        for key in self.extensions.keys() {
            validate_setting_key(key)?;
            if SETTINGS_FIELDS.contains(&key.as_str()) {
                return Err(OperationValidationError::SettingFieldCollision { key: key.clone() });
            }
        }
        Ok(())
    }
}

fn default_settings_version() -> u16 {
    WORKSPACE_SETTINGS_VERSION
}

fn default_enabled() -> bool {
    true
}

fn default_theme() -> String {
    "midnight".into()
}

fn default_editor_font() -> String {
    "inter".into()
}

fn default_editor_line_height() -> String {
    "comfortable".into()
}

fn default_editor_placeholder() -> String {
    "Start writing...".into()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub protocol_version: u16,
    pub active_note_id: Option<String>,
    pub nodes: Vec<WorkspaceNode>,
    pub documents: Vec<WorkspaceDocument>,
    pub history_headers: Vec<HistoryHeader>,
    pub settings: WorkspaceSettings,
    #[serde(default)]
    pub tags: Vec<WorkspaceTag>,
    #[serde(default)]
    pub people: Vec<WorkspacePerson>,
    #[serde(default)]
    pub references: Vec<NoteReferences>,
}

impl WorkspaceSnapshot {
    #[must_use]
    pub fn unavailable_node_ids(&self) -> BTreeSet<&str> {
        let mut children = BTreeMap::<&str, Vec<&str>>::new();
        let mut pending = Vec::new();
        for node in &self.nodes {
            if let Some(parent_id) = node.parent_id.as_deref() {
                children.entry(parent_id).or_default().push(&node.id);
            }
            if node.deleted_at.is_some() {
                pending.push(node.id.as_str());
            }
        }

        let mut unavailable = BTreeSet::new();
        while let Some(id) = pending.pop() {
            if !unavailable.insert(id) {
                continue;
            }
            if let Some(descendants) = children.get(id) {
                pending.extend(descendants.iter().copied());
            }
        }
        unavailable
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceArchive {
    pub archive_version: u16,
    pub protocol_version: u16,
    pub exported_at: i64,
    pub active_note_id: Option<String>,
    pub nodes: Vec<WorkspaceNode>,
    pub documents: Vec<WorkspaceDocument>,
    pub settings: WorkspaceSettings,
    #[serde(default)]
    pub tags: Vec<WorkspaceTag>,
    #[serde(default)]
    pub people: Vec<WorkspacePerson>,
}

impl WorkspaceArchive {
    #[must_use]
    pub fn v1(snapshot: WorkspaceSnapshot, exported_at: i64) -> Self {
        Self {
            archive_version: WORKSPACE_ARCHIVE_VERSION,
            protocol_version: snapshot.protocol_version,
            exported_at,
            active_note_id: snapshot.active_note_id,
            nodes: snapshot.nodes,
            documents: snapshot.documents,
            settings: snapshot.settings,
            tags: snapshot.tags,
            people: snapshot.people,
        }
    }

    pub fn validate(&self) -> Result<(), ArchiveValidationError> {
        if self.archive_version != WORKSPACE_ARCHIVE_VERSION {
            return Err(ArchiveValidationError::UnsupportedArchiveVersion(
                self.archive_version,
            ));
        }
        if self.protocol_version != WORKSPACE_PROTOCOL_VERSION {
            return Err(ArchiveValidationError::UnsupportedProtocol(
                self.protocol_version,
            ));
        }
        if self.exported_at < 0 {
            return archive_error("export timestamp cannot be negative");
        }

        let mut nodes = BTreeMap::new();
        for node in &self.nodes {
            validate_id("node id", &node.id).map_err(archive_operation_error)?;
            validate_title(&node.title).map_err(archive_operation_error)?;
            validate_timestamp(node.created_at).map_err(archive_operation_error)?;
            validate_timestamp(node.updated_at).map_err(archive_operation_error)?;
            if node.created_at > node.updated_at {
                return archive_error(format!("node {} is updated before creation", node.id));
            }
            if node
                .deleted_at
                .is_some_and(|deleted_at| deleted_at < node.created_at)
            {
                return archive_error(format!("node {} is deleted before creation", node.id));
            }
            if nodes.insert(node.id.as_str(), node).is_some() {
                return archive_error(format!("duplicate node {}", node.id));
            }
        }

        for node in &self.nodes {
            let Some(parent_id) = node.parent_id.as_deref() else {
                continue;
            };
            let parent = nodes.get(parent_id).ok_or_else(|| {
                ArchiveValidationError::Invalid(format!("missing parent {parent_id}"))
            })?;
            if parent.kind != NodeKind::Folder {
                return archive_error(format!("parent {parent_id} is not a folder"));
            }
            let mut ancestors = BTreeSet::new();
            let mut current = Some(parent_id);
            while let Some(ancestor_id) = current {
                if !ancestors.insert(ancestor_id) || ancestor_id == node.id {
                    return archive_error(format!("node {} has a parent cycle", node.id));
                }
                current = nodes
                    .get(ancestor_id)
                    .and_then(|ancestor| ancestor.parent_id.as_deref());
            }
        }

        let mut documents = BTreeSet::new();
        for document in &self.documents {
            validate_id("note id", &document.note_id).map_err(archive_operation_error)?;
            let node = nodes.get(document.note_id.as_str()).ok_or_else(|| {
                ArchiveValidationError::Invalid(format!(
                    "document references missing note {}",
                    document.note_id
                ))
            })?;
            if node.kind != NodeKind::Note {
                return archive_error(format!("document {} belongs to a folder", document.note_id));
            }
            validate_document(&document.document_json).map_err(archive_operation_error)?;
            if document.revision < 1 {
                return archive_error(format!(
                    "document {} has invalid revision",
                    document.note_id
                ));
            }
            if document.word_count < 0 {
                return archive_error(format!(
                    "document {} has negative word count",
                    document.note_id
                ));
            }
            if !documents.insert(document.note_id.as_str()) {
                return archive_error(format!("duplicate document {}", document.note_id));
            }
        }

        for node in self.nodes.iter().filter(|node| node.kind == NodeKind::Note) {
            if !documents.contains(node.id.as_str()) {
                return archive_error(format!("note {} has no document", node.id));
            }
        }

        if let Some(active_note_id) = self.active_note_id.as_deref() {
            let active = nodes.get(active_note_id).ok_or_else(|| {
                ArchiveValidationError::Invalid(format!(
                    "active note {active_note_id} does not exist"
                ))
            })?;
            if active.kind != NodeKind::Note {
                return archive_error(format!("active note {active_note_id} is unavailable"));
            }
            let mut current = Some(*active);
            while let Some(node) = current {
                if node.deleted_at.is_some() {
                    return archive_error(format!("active note {active_note_id} is unavailable"));
                }
                current = node
                    .parent_id
                    .as_deref()
                    .and_then(|parent_id| nodes.get(parent_id).copied());
            }
        }

        self.settings.validate().map_err(archive_operation_error)?;
        validate_relationships(&self.tags, &self.people, &self.documents, &nodes)?;
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub created_in: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePerson {
    pub id: String,
    pub name: String,
    pub initials: Option<String>,
    pub color: Option<String>,
    pub note: Option<String>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub created_in: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentReference {
    pub kind: ReferenceKind,
    pub target_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReferenceKind {
    Tag,
    Person,
    Note,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NoteReferences {
    pub note_id: String,
    pub targets: Vec<DocumentReference>,
}

fn archive_error<T>(message: impl Into<String>) -> Result<T, ArchiveValidationError> {
    Err(ArchiveValidationError::Invalid(message.into()))
}

fn archive_operation_error(error: OperationValidationError) -> ArchiveValidationError {
    ArchiveValidationError::Invalid(error.to_string())
}

fn validate_reference_name(value: &str) -> Result<(), OperationValidationError> {
    if value.trim().is_empty() {
        return Err(OperationValidationError::Empty {
            field: "reference name",
        });
    }
    if value.len() > MAX_REFERENCE_NAME_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "reference name",
            maximum: MAX_REFERENCE_NAME_BYTES,
        });
    }
    Ok(())
}

fn validate_reference_color(value: &Option<String>) -> Result<(), OperationValidationError> {
    let Some(color) = value else {
        return Ok(());
    };
    if color.trim().is_empty() {
        return Err(OperationValidationError::Empty {
            field: "reference color",
        });
    }
    if color.len() > MAX_REFERENCE_COLOR_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "reference color",
            maximum: MAX_REFERENCE_COLOR_BYTES,
        });
    }
    Ok(())
}

fn validate_tag(tag: &WorkspaceTag) -> Result<(), OperationValidationError> {
    validate_id("tag id", &tag.id)?;
    validate_reference_name(&tag.name)
}

fn validate_person(person: &WorkspacePerson) -> Result<(), OperationValidationError> {
    validate_id("person id", &person.id)?;
    validate_reference_name(&person.name)
}

pub fn document_references(value: &Value) -> Vec<DocumentReference> {
    fn visit(value: &Value, targets: &mut Vec<DocumentReference>) {
        let Some(object) = value.as_object() else {
            return;
        };
        let kind = match object.get("type").and_then(Value::as_str) {
            Some("tag_ref") => Some(ReferenceKind::Tag),
            Some("mention_ref") => match object
                .get("attrs")
                .and_then(Value::as_object)
                .and_then(|attrs| attrs.get("kind"))
                .and_then(Value::as_str)
            {
                Some("person") => Some(ReferenceKind::Person),
                Some("note") => Some(ReferenceKind::Note),
                _ => None,
            },
            _ => None,
        };
        if let Some(kind) = kind
            && let Some(id) = object
                .get("attrs")
                .and_then(Value::as_object)
                .and_then(|attrs| attrs.get("id"))
                .and_then(Value::as_str)
        {
            targets.push(DocumentReference {
                kind,
                target_id: id.into(),
            });
        }
        if let Some(content) = object.get("content").and_then(Value::as_array) {
            for child in content {
                visit(child, targets);
            }
        }
    }
    let mut targets = Vec::new();
    visit(value, &mut targets);
    targets
}

fn validate_relationships(
    tags: &[WorkspaceTag],
    people: &[WorkspacePerson],
    documents: &[WorkspaceDocument],
    nodes: &BTreeMap<&str, &WorkspaceNode>,
) -> Result<(), ArchiveValidationError> {
    let mut tag_ids = BTreeSet::new();
    for tag in tags {
        validate_tag(tag).map_err(archive_operation_error)?;
        if !tag_ids.insert(tag.id.as_str()) {
            return archive_error(format!("duplicate tag {}", tag.id));
        }
    }
    let mut person_ids = BTreeSet::new();
    for person in people {
        validate_person(person).map_err(archive_operation_error)?;
        if !person_ids.insert(person.id.as_str()) {
            return archive_error(format!("duplicate person {}", person.id));
        }
    }
    for document in documents {
        for reference in document_references(&document.document_json) {
            let valid = match reference.kind {
                ReferenceKind::Tag => tag_ids.contains(reference.target_id.as_str()),
                ReferenceKind::Person => person_ids.contains(reference.target_id.as_str()),
                ReferenceKind::Note => nodes
                    .get(reference.target_id.as_str())
                    .is_some_and(|node| node.kind == NodeKind::Note),
            };
            if !valid {
                return archive_error(format!(
                    "document {} has dangling reference {}",
                    document.note_id, reference.target_id
                ));
            }
        }
    }
    Ok(())
}

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
    MoveNode {
        id: String,
        placement: NodePlacement,
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
                at,
                ..
            } => {
                validate_id("id", id)?;
                validate_title(title)?;
                validate_document(document_json)?;
                validate_timestamp(*at)?;
                validate_placement(id, placement)
            }
            Self::RenameNode { id, title, at } => {
                validate_id("id", id)?;
                validate_title(title)?;
                validate_timestamp(*at)
            }
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
                word_count,
                expected_revision,
                at,
                ..
            } => {
                validate_id("note id", note_id)?;
                validate_document(document_json)?;
                if *word_count < 0 {
                    return Err(OperationValidationError::NegativeWordCount);
                }
                if !(1..i64::MAX).contains(expected_revision) {
                    return Err(OperationValidationError::InvalidRevision {
                        maximum: i64::MAX - 1,
                    });
                }
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
        }
    }
}

fn validate_id(field: &'static str, value: &str) -> Result<(), OperationValidationError> {
    if value.is_empty() {
        return Err(OperationValidationError::Empty { field });
    }
    if value.len() > MAX_ENTITY_ID_BYTES {
        return Err(OperationValidationError::TooLong {
            field,
            maximum: MAX_ENTITY_ID_BYTES,
        });
    }
    if !value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(OperationValidationError::InvalidIdentifier { field });
    }
    Ok(())
}

fn validate_optional_id(
    field: &'static str,
    value: &Option<String>,
) -> Result<(), OperationValidationError> {
    match value {
        Some(value) => validate_id(field, value),
        None => Ok(()),
    }
}

fn validate_title(title: &str) -> Result<(), OperationValidationError> {
    if title.trim().is_empty() {
        return Err(OperationValidationError::Empty { field: "title" });
    }
    if title.len() > MAX_TITLE_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "title",
            maximum: MAX_TITLE_BYTES,
        });
    }
    Ok(())
}

fn validate_setting_key(key: &str) -> Result<(), OperationValidationError> {
    if key.trim().is_empty() {
        return Err(OperationValidationError::Empty {
            field: "setting key",
        });
    }
    if key.len() > MAX_SETTING_KEY_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "setting key",
            maximum: MAX_SETTING_KEY_BYTES,
        });
    }
    Ok(())
}

fn validate_setting_text(field: &'static str, value: &str) -> Result<(), OperationValidationError> {
    if value.len() > MAX_SETTING_TEXT_BYTES {
        return Err(OperationValidationError::TooLong {
            field,
            maximum: MAX_SETTING_TEXT_BYTES,
        });
    }
    Ok(())
}

fn validate_timestamp(at: i64) -> Result<(), OperationValidationError> {
    if at < 0 {
        Err(OperationValidationError::NegativeTimestamp)
    } else {
        Ok(())
    }
}

fn validate_document(document: &Value) -> Result<(), OperationValidationError> {
    if document.is_object() {
        Ok(())
    } else {
        Err(OperationValidationError::InvalidDocument)
    }
}

fn validate_parent(id: &str, parent_id: &Option<String>) -> Result<(), OperationValidationError> {
    if parent_id.as_deref() == Some(id) {
        Err(OperationValidationError::SelfParent)
    } else {
        Ok(())
    }
}

fn validate_placement(id: &str, placement: &NodePlacement) -> Result<(), OperationValidationError> {
    validate_optional_id("parent id", &placement.parent_id)?;
    validate_parent(id, &placement.parent_id)?;
    let anchor_id = match &placement.position {
        NodePosition::First | NodePosition::Last => return Ok(()),
        NodePosition::Before { anchor_id } | NodePosition::After { anchor_id } => anchor_id,
    };
    validate_id("anchor id", anchor_id)?;
    if anchor_id == id {
        Err(OperationValidationError::SelfAnchor)
    } else {
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityRevision {
    pub id: String,
    pub revision: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NodeRankChange {
    pub id: String,
    pub parent_id: Option<String>,
    pub rank: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OperationAck {
    pub applied: usize,
    pub revisions: Vec<EntityRevision>,
    pub rank_changes: Vec<NodeRankChange>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub note_id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use serde_json::json;

    use super::{
        ArchiveValidationError, NodeKind, NodePlacement, OperationValidationError, SETTINGS_FIELDS,
        WORKSPACE_ARCHIVE_VERSION, WORKSPACE_PROTOCOL_VERSION, WORKSPACE_SETTINGS_VERSION,
        WorkspaceArchive, WorkspaceDocument, WorkspaceNode, WorkspaceOperation,
        WorkspaceOperationEnvelope, WorkspaceSettings, WorkspaceTag,
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
    fn validates_portable_archive_graph() {
        let archive = WorkspaceArchive {
            archive_version: WORKSPACE_ARCHIVE_VERSION,
            protocol_version: WORKSPACE_PROTOCOL_VERSION,
            exported_at: 10,
            active_note_id: Some("note-1".into()),
            nodes: vec![
                WorkspaceNode {
                    id: "folder-1".into(),
                    kind: NodeKind::Folder,
                    parent_id: None,
                    rank: 1024,
                    title: "Folder".into(),
                    icon: None,
                    created_at: 1,
                    updated_at: 1,
                    deleted_at: None,
                },
                WorkspaceNode {
                    id: "note-1".into(),
                    kind: NodeKind::Note,
                    parent_id: Some("folder-1".into()),
                    rank: 1024,
                    title: "Note".into(),
                    icon: None,
                    created_at: 2,
                    updated_at: 2,
                    deleted_at: None,
                },
            ],
            documents: vec![WorkspaceDocument {
                note_id: "note-1".into(),
                document_json: json!({"type": "doc"}),
                markdown: "# Note".into(),
                revision: 1,
                word_count: 1,
            }],
            settings: WorkspaceSettings::default(),
            tags: Vec::new(),
            people: Vec::new(),
        };

        archive.validate().expect("valid archive");
    }

    #[test]
    fn rejects_archive_parent_cycle() {
        let mut archive = WorkspaceArchive {
            archive_version: WORKSPACE_ARCHIVE_VERSION,
            protocol_version: WORKSPACE_PROTOCOL_VERSION,
            exported_at: 10,
            active_note_id: None,
            nodes: vec![
                WorkspaceNode {
                    id: "folder-1".into(),
                    kind: NodeKind::Folder,
                    parent_id: Some("folder-2".into()),
                    rank: 1024,
                    title: "One".into(),
                    icon: None,
                    created_at: 1,
                    updated_at: 1,
                    deleted_at: None,
                },
                WorkspaceNode {
                    id: "folder-2".into(),
                    kind: NodeKind::Folder,
                    parent_id: Some("folder-1".into()),
                    rank: 1024,
                    title: "Two".into(),
                    icon: None,
                    created_at: 1,
                    updated_at: 1,
                    deleted_at: None,
                },
            ],
            documents: Vec::new(),
            settings: WorkspaceSettings::default(),
            tags: Vec::new(),
            people: Vec::new(),
        };

        assert!(matches!(
            archive.validate(),
            Err(ArchiveValidationError::Invalid(_))
        ));
        archive.nodes[1].parent_id = None;
        archive.validate().expect("repaired archive");
    }

    #[test]
    fn settings_wire_format_is_stable() {
        let envelope = WorkspaceOperationEnvelope::v1(WorkspaceOperation::UpdateSettings {
            settings: WorkspaceSettings::default(),
        });

        let value = serde_json::to_value(envelope).expect("serialize settings operation");
        assert_eq!(value["operation"]["type"], "update_settings");
        assert_eq!(
            value["operation"]["settings"]["settingsVersion"],
            WORKSPACE_SETTINGS_VERSION
        );
        assert_eq!(value["operation"]["settings"]["theme"], "midnight");

        let keys = value["operation"]["settings"]
            .as_object()
            .expect("settings object")
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        let mut expected = SETTINGS_FIELDS.map(String::from).to_vec();
        expected.sort();
        let mut sorted = keys.clone();
        sorted.sort();
        assert_eq!(sorted, expected);
    }

    #[test]
    fn settings_default_from_empty_document() {
        let settings =
            serde_json::from_value::<WorkspaceSettings>(json!({})).expect("empty document");

        assert_eq!(settings, WorkspaceSettings::default());
        settings.validate().expect("default settings");
        assert_eq!(settings.settings_version, WORKSPACE_SETTINGS_VERSION);
        assert!(settings.remember_last_note);
        assert_eq!(settings.editor_line_height, "comfortable");
    }

    #[test]
    fn settings_fill_missing_fields_with_defaults() {
        let settings = serde_json::from_value::<WorkspaceSettings>(json!({
            "theme": "paper",
            "compactSidebar": true
        }))
        .expect("partial document");

        settings.validate().expect("partial settings");
        assert_eq!(settings.theme, "paper");
        assert!(settings.compact_sidebar);
        assert_eq!(settings.editor_font, "inter");
        assert_eq!(settings.editor_placeholder, "Start writing...");
    }

    #[test]
    fn settings_preserve_unknown_fields_losslessly() {
        let document = json!({
            "theme": "paper",
            "futureFlag": true,
            "futureSection": {"nested": 3}
        });

        let settings =
            serde_json::from_value::<WorkspaceSettings>(document).expect("extended document");
        settings.validate().expect("extended settings");
        assert_eq!(settings.extensions["futureFlag"], json!(true));
        assert_eq!(settings.extensions["futureSection"], json!({"nested": 3}));

        let round_trip = serde_json::to_value(&settings).expect("serialize settings");
        assert_eq!(round_trip["futureFlag"], json!(true));
        assert_eq!(round_trip["futureSection"], json!({"nested": 3}));
        assert_eq!(
            serde_json::from_value::<WorkspaceSettings>(round_trip).expect("reparse settings"),
            settings
        );
    }

    #[test]
    fn settings_reject_unsupported_versions_and_invalid_fields() {
        let future = serde_json::from_value::<WorkspaceSettings>(json!({"settingsVersion": 2}))
            .expect("future document");
        assert_eq!(
            future.validate(),
            Err(OperationValidationError::UnsupportedSettingsVersion(2))
        );

        let invalid_theme = WorkspaceSettings {
            theme: "../theme".into(),
            ..WorkspaceSettings::default()
        };
        assert!(matches!(
            invalid_theme.validate(),
            Err(OperationValidationError::InvalidIdentifier { .. })
        ));

        let oversized = WorkspaceSettings {
            editor_placeholder: "x".repeat(513),
            ..WorkspaceSettings::default()
        };
        assert!(matches!(
            oversized.validate(),
            Err(OperationValidationError::TooLong { .. })
        ));

        let collision = WorkspaceSettings {
            extensions: BTreeMap::from([("theme".to_string(), json!("paper"))]),
            ..WorkspaceSettings::default()
        };
        assert_eq!(
            collision.validate(),
            Err(OperationValidationError::SettingFieldCollision {
                key: "theme".into()
            })
        );

        let empty_key = WorkspaceSettings {
            extensions: BTreeMap::from([(" ".to_string(), json!(true))]),
            ..WorkspaceSettings::default()
        };
        assert!(matches!(
            empty_key.validate(),
            Err(OperationValidationError::Empty { .. })
        ));
    }

    #[test]
    fn archive_rejects_unsupported_settings_version() {
        let mut archive = WorkspaceArchive {
            archive_version: WORKSPACE_ARCHIVE_VERSION,
            protocol_version: WORKSPACE_PROTOCOL_VERSION,
            exported_at: 10,
            active_note_id: None,
            nodes: Vec::new(),
            documents: Vec::new(),
            settings: WorkspaceSettings::default(),
            tags: Vec::new(),
            people: Vec::new(),
        };
        archive.settings.settings_version = 2;

        assert!(matches!(
            archive.validate(),
            Err(ArchiveValidationError::Invalid(_))
        ));
        archive.settings.settings_version = WORKSPACE_SETTINGS_VERSION;
        archive.validate().expect("supported settings version");
    }

    #[test]
    fn rejects_active_note_below_trashed_ancestor() {
        let archive = WorkspaceArchive {
            archive_version: WORKSPACE_ARCHIVE_VERSION,
            protocol_version: WORKSPACE_PROTOCOL_VERSION,
            exported_at: 10,
            active_note_id: Some("note-1".into()),
            nodes: vec![
                WorkspaceNode {
                    id: "folder-1".into(),
                    kind: NodeKind::Folder,
                    parent_id: None,
                    rank: 1024,
                    title: "Folder".into(),
                    icon: None,
                    created_at: 1,
                    updated_at: 5,
                    deleted_at: Some(5),
                },
                WorkspaceNode {
                    id: "note-1".into(),
                    kind: NodeKind::Note,
                    parent_id: Some("folder-1".into()),
                    rank: 1024,
                    title: "Note".into(),
                    icon: None,
                    created_at: 2,
                    updated_at: 2,
                    deleted_at: None,
                },
            ],
            documents: vec![WorkspaceDocument {
                note_id: "note-1".into(),
                document_json: json!({"type": "doc"}),
                markdown: "# Note".into(),
                revision: 1,
                word_count: 1,
            }],
            settings: WorkspaceSettings::default(),
            tags: Vec::new(),
            people: Vec::new(),
        };

        assert!(matches!(
            archive.validate(),
            Err(ArchiveValidationError::Invalid(_))
        ));
    }

    #[test]
    fn archive_validates_structured_reference_targets() {
        let mut archive = WorkspaceArchive {
            archive_version: WORKSPACE_ARCHIVE_VERSION,
            protocol_version: WORKSPACE_PROTOCOL_VERSION,
            exported_at: 1,
            active_note_id: None,
            nodes: vec![WorkspaceNode {
                id: "note-1".into(),
                kind: NodeKind::Note,
                parent_id: None,
                rank: 1,
                title: "Note".into(),
                icon: None,
                created_at: 1,
                updated_at: 1,
                deleted_at: None,
            }],
            documents: vec![WorkspaceDocument {
                note_id: "note-1".into(),
                document_json: json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"tag_ref","attrs":{"id":"tag-1","label":"Tag"}}]}]}),
                markdown: "#Tag".into(),
                revision: 1,
                word_count: 1,
            }],
            settings: WorkspaceSettings::default(),
            tags: vec![WorkspaceTag {
                id: "tag-1".into(),
                name: "Tag".into(),
                color: None,
                created_at: 0,
                updated_at: 0,
                created_in: None,
            }],
            people: Vec::new(),
        };
        archive.validate().expect("valid reference");
        archive.tags.clear();
        assert!(matches!(
            archive.validate(),
            Err(ArchiveValidationError::Invalid(_))
        ));
    }
}
