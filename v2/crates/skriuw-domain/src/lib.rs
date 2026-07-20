use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

pub const WORKSPACE_PROTOCOL_VERSION: u16 = 1;
pub const MAX_ENTITY_ID_BYTES: usize = 128;
pub const MAX_TITLE_BYTES: usize = 512;
pub const MAX_SETTING_KEY_BYTES: usize = 128;

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
pub struct WorkspaceSnapshot {
    pub protocol_version: u16,
    pub active_note_id: Option<String>,
    pub nodes: Vec<WorkspaceNode>,
    pub documents: Vec<WorkspaceDocument>,
    pub history_headers: Vec<HistoryHeader>,
    pub settings: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOperationEnvelope {
    pub protocol_version: u16,
    pub operation: WorkspaceOperation,
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
    CreateFolder {
        id: String,
        parent_id: Option<String>,
        title: String,
        rank: i64,
        at: i64,
    },
    CreateNote {
        id: String,
        parent_id: Option<String>,
        title: String,
        rank: i64,
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
        parent_id: Option<String>,
        rank: i64,
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
    SoftDeleteNode {
        id: String,
        at: i64,
    },
    RestoreNode {
        id: String,
        parent_id: Option<String>,
        rank: i64,
        at: i64,
    },
    SetActiveNote {
        note_id: Option<String>,
    },
    SetSetting {
        key: String,
        value: Value,
    },
}

impl WorkspaceOperation {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        match self {
            Self::CreateFolder {
                id,
                parent_id,
                title,
                at,
                ..
            } => {
                validate_id("id", id)?;
                validate_optional_id("parent id", parent_id)?;
                validate_title(title)?;
                validate_timestamp(*at)?;
                validate_parent(id, parent_id)
            }
            Self::CreateNote {
                id,
                parent_id,
                title,
                document_json,
                at,
                ..
            } => {
                validate_id("id", id)?;
                validate_optional_id("parent id", parent_id)?;
                validate_title(title)?;
                validate_document(document_json)?;
                validate_timestamp(*at)?;
                validate_parent(id, parent_id)
            }
            Self::RenameNode { id, title, at } => {
                validate_id("id", id)?;
                validate_title(title)?;
                validate_timestamp(*at)
            }
            Self::MoveNode {
                id, parent_id, at, ..
            }
            | Self::RestoreNode {
                id, parent_id, at, ..
            } => {
                validate_id("id", id)?;
                validate_optional_id("parent id", parent_id)?;
                validate_timestamp(*at)?;
                validate_parent(id, parent_id)
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
            Self::SoftDeleteNode { id, at } => {
                validate_id("id", id)?;
                validate_timestamp(*at)
            }
            Self::SetActiveNote { note_id } => validate_optional_id("note id", note_id),
            Self::SetSetting { key, .. } => validate_setting_key(key),
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityRevision {
    pub id: String,
    pub revision: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OperationAck {
    pub applied: usize,
    pub revisions: Vec<EntityRevision>,
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
    use serde_json::json;

    use super::{
        OperationValidationError, WORKSPACE_PROTOCOL_VERSION, WorkspaceOperation,
        WorkspaceOperationEnvelope,
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
    }

    #[test]
    fn validates_portable_operation_rules() {
        let invalid_id = WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateFolder {
            id: "../folder".into(),
            parent_id: None,
            title: "Folder".into(),
            rank: 1024,
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
    }
}
