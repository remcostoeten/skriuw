use std::collections::BTreeSet;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{OperationValidationError, validate_bounded_text, validate_id, validate_timestamp};

pub const MAX_ANNOTATION_COMMENT_BYTES: usize = 4_000;
pub const MAX_ANNOTATION_ANCHOR_TEXT_BYTES: usize = 2_000;
pub const MAX_ANNOTATION_COMMENTS: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AnnotationStatus {
    Open,
    Resolved,
}

impl AnnotationStatus {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Resolved => "resolved",
        }
    }

    pub fn parse(value: &str) -> Result<Self, OperationValidationError> {
        match value {
            "open" => Ok(Self::Open),
            "resolved" => Ok(Self::Resolved),
            _ => Err(OperationValidationError::InvalidIdentifier {
                field: "annotation status",
            }),
        }
    }
}

/// A single comment in a thread. `author_id` is always `None` today; it is
/// carried so that attributing comments to collaborators later adds a value
/// rather than reshaping the record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationComment {
    pub id: String,
    pub body_markdown: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl AnnotationComment {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        validate_id("annotation comment id", &self.id)?;
        validate_bounded_text(
            "annotation comment body",
            &self.body_markdown,
            MAX_ANNOTATION_COMMENT_BYTES,
        )?;
        if let Some(author_id) = &self.author_id {
            validate_id("annotation comment author id", author_id)?;
        }
        validate_timestamp(self.created_at)?;
        validate_timestamp(self.updated_at)?;
        if self.updated_at < self.created_at {
            return Err(OperationValidationError::InvalidIdentifier {
                field: "annotation comment updated at",
            });
        }
        Ok(())
    }
}

/// A comment thread anchored to a range of note text. The anchor itself lives
/// in the document as a mark carrying this id; the thread survives the anchor
/// being deleted so it can be surfaced as an orphan instead of disappearing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAnnotation {
    pub id: String,
    pub note_id: String,
    pub status: AnnotationStatus,
    pub anchor_text: String,
    pub created_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolved_at: Option<i64>,
    #[serde(default)]
    pub comments: Vec<AnnotationComment>,
}

impl WorkspaceAnnotation {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        validate_id("annotation id", &self.id)?;
        validate_id("annotation note id", &self.note_id)?;
        validate_bounded_text(
            "annotation anchor text",
            &self.anchor_text,
            MAX_ANNOTATION_ANCHOR_TEXT_BYTES,
        )?;
        validate_timestamp(self.created_at)?;

        match (self.status, self.resolved_at) {
            (AnnotationStatus::Resolved, Some(at)) => {
                validate_timestamp(at)?;
                if at < self.created_at {
                    return Err(OperationValidationError::InvalidIdentifier {
                        field: "annotation resolved at",
                    });
                }
            }
            (AnnotationStatus::Open, None) => {}
            /* A resolved thread without a timestamp, or an open one carrying
            one, would let the panel and the stored row disagree about
            whether the thread is still live. */
            _ => {
                return Err(OperationValidationError::InvalidIdentifier {
                    field: "annotation resolved at",
                });
            }
        }

        if self.comments.len() > MAX_ANNOTATION_COMMENTS {
            return Err(OperationValidationError::TooMany {
                field: "annotation comments",
                maximum: MAX_ANNOTATION_COMMENTS,
            });
        }
        let mut seen = BTreeSet::new();
        for comment in &self.comments {
            comment.validate()?;
            if !seen.insert(&comment.id) {
                return Err(OperationValidationError::Duplicate {
                    field: "annotation comments",
                    id: comment.id.clone(),
                });
            }
            if comment.created_at < self.created_at {
                return Err(OperationValidationError::InvalidIdentifier {
                    field: "annotation comment created at",
                });
            }
        }
        Ok(())
    }

    /// A thread is created with its opening comment in the same operation, so
    /// a crash can never leave an anchored thread with nothing to read.
    pub fn validate_as_created(&self) -> Result<(), OperationValidationError> {
        self.validate()?;
        if self.comments.is_empty() {
            return Err(OperationValidationError::Empty {
                field: "annotation comments",
            });
        }
        if self.status != AnnotationStatus::Open {
            return Err(OperationValidationError::InvalidIdentifier {
                field: "annotation status",
            });
        }
        Ok(())
    }
}
