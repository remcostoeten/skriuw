use std::collections::{BTreeMap, BTreeSet};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    MAX_ENTITY_ID_BYTES, OperationValidationError, validate_id, validate_timestamp, validate_title,
};

pub const MAX_TASK_DESCRIPTION_BYTES: usize = 4_000;
pub const MAX_TASK_TAGS: usize = 32;
pub const MAX_TASK_ASSIGNEES: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Todo,
    InProgress,
    Done,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TaskPriority {
    Urgent,
    High,
    Medium,
    Low,
}

impl TaskStatus {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::InProgress => "in_progress",
            Self::Done => "done",
        }
    }

    pub fn parse(value: &str) -> Result<Self, OperationValidationError> {
        match value {
            "todo" => Ok(Self::Todo),
            "in_progress" => Ok(Self::InProgress),
            "done" => Ok(Self::Done),
            _ => Err(OperationValidationError::InvalidIdentifier {
                field: "task status",
            }),
        }
    }
}

impl TaskPriority {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Urgent => "urgent",
            Self::High => "high",
            Self::Medium => "medium",
            Self::Low => "low",
        }
    }

    pub fn parse(value: &str) -> Result<Self, OperationValidationError> {
        match value {
            "urgent" => Ok(Self::Urgent),
            "high" => Ok(Self::High),
            "medium" => Ok(Self::Medium),
            "low" => Ok(Self::Low),
            _ => Err(OperationValidationError::InvalidIdentifier {
                field: "task priority",
            }),
        }
    }
}

/// The checklist item a task was promoted from. Both halves move together so
/// a task is either fully linked or fully standalone; there is no state where
/// only one half survives.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TaskSource {
    pub note_id: String,
    pub block_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTask {
    pub id: String,
    pub title: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tag_ids: Vec<String>,
    #[serde(default)]
    pub assignee_ids: Vec<String>,
    #[serde(default)]
    pub source: Option<TaskSource>,
    #[serde(default)]
    pub detached_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// The document state that a task operation writes in the same transaction as
/// the task record. Promotion, detachment, and deletion all rewrite the source
/// checklist item, and neither half may land without the other.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TaskSourceDocument {
    pub note_id: String,
    pub document_json: Value,
    pub markdown: String,
    pub word_count: i64,
    pub expected_revision: i64,
}

/// A promoted checklist item as the stored document currently describes it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentTaskLink {
    pub task_id: String,
    pub block_id: String,
    pub title: String,
    pub checked: bool,
}

impl WorkspaceTask {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        validate_id("task id", &self.id)?;
        validate_title(&self.title)?;
        if self.description.len() > MAX_TASK_DESCRIPTION_BYTES {
            return Err(OperationValidationError::TooLong {
                field: "task description",
                maximum: MAX_TASK_DESCRIPTION_BYTES,
            });
        }
        validate_due_date(self.due_date.as_deref())?;
        validate_task_ids("task tags", &self.tag_ids, MAX_TASK_TAGS)?;
        validate_task_ids("task assignees", &self.assignee_ids, MAX_TASK_ASSIGNEES)?;
        validate_timestamp(self.created_at)?;
        validate_timestamp(self.updated_at)?;
        if let Some(source) = &self.source {
            validate_id("task source note id", &source.note_id)?;
            validate_id("task source block id", &source.block_id)?;
            if source.block_id == self.id {
                return Err(OperationValidationError::InvalidIdentifier {
                    field: "task source block id",
                });
            }
            if self.detached_at.is_some() {
                return Err(OperationValidationError::DetachedTaskKeepsSource {
                    id: self.id.clone(),
                });
            }
        }
        if let Some(detached_at) = self.detached_at {
            validate_timestamp(detached_at)?;
        }
        Ok(())
    }

    /// The status the task takes once the source checkbox is known. The
    /// document owns completion: a checked box completes the task, and
    /// unchecking reopens a completed task without discarding an in-progress
    /// state the document cannot express.
    #[must_use]
    pub const fn reconciled_status(status: TaskStatus, checked: bool) -> TaskStatus {
        match (status, checked) {
            (_, true) => TaskStatus::Done,
            (TaskStatus::Done, false) => TaskStatus::Todo,
            (status, false) => status,
        }
    }
}

impl TaskSourceDocument {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        validate_id("note id", &self.note_id)?;
        crate::validate_document(&self.document_json, &self.markdown)?;
        if self.word_count < 0 {
            return Err(OperationValidationError::NegativeWordCount);
        }
        crate::validate_revision(self.expected_revision)
    }
}

fn validate_due_date(value: Option<&str>) -> Result<(), OperationValidationError> {
    let Some(value) = value else {
        return Ok(());
    };
    let field = "task due date";
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return Err(OperationValidationError::InvalidIdentifier { field });
    }
    if !bytes
        .iter()
        .enumerate()
        .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit())
    {
        return Err(OperationValidationError::InvalidIdentifier { field });
    }
    let month = value[5..7]
        .parse::<u8>()
        .map_err(|_| OperationValidationError::InvalidIdentifier { field })?;
    let day = value[8..10]
        .parse::<u8>()
        .map_err(|_| OperationValidationError::InvalidIdentifier { field })?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return Err(OperationValidationError::InvalidIdentifier { field });
    }
    Ok(())
}

fn validate_task_ids(
    field: &'static str,
    ids: &[String],
    maximum: usize,
) -> Result<(), OperationValidationError> {
    if ids.len() > maximum {
        return Err(OperationValidationError::TooMany { field, maximum });
    }
    let mut seen = BTreeSet::new();
    for id in ids {
        if id.is_empty() || id.len() > MAX_ENTITY_ID_BYTES {
            return Err(OperationValidationError::InvalidIdentifier { field });
        }
        validate_id(field, id)?;
        if !seen.insert(id.as_str()) {
            return Err(OperationValidationError::Duplicate {
                field,
                id: id.clone(),
            });
        }
    }
    Ok(())
}

/// Collect every promoted checklist item in a stored document, in document
/// order. Items without a complete, well-formed link are ordinary checklist
/// content and are deliberately invisible here: nothing in the document ever
/// creates a task implicitly.
#[must_use]
pub fn document_task_links(document: &Value) -> Vec<DocumentTaskLink> {
    fn text_content(value: &Value, out: &mut String) {
        let Some(object) = value.as_object() else {
            return;
        };
        if let Some(text) = object.get("text").and_then(Value::as_str) {
            out.push_str(text);
        }
        if let Some(content) = object.get("content").and_then(Value::as_array) {
            for child in content {
                text_content(child, out);
            }
        }
    }

    fn link_title(node: &serde_json::Map<String, Value>) -> String {
        let Some(first) = node
            .get("content")
            .and_then(Value::as_array)
            .and_then(|content| content.first())
        else {
            return String::new();
        };
        if first.get("type").and_then(Value::as_str) != Some("paragraph") {
            return String::new();
        }
        let mut title = String::new();
        text_content(first, &mut title);
        title.trim().to_string()
    }

    fn visit(value: &Value, links: &mut Vec<DocumentTaskLink>) {
        let Some(object) = value.as_object() else {
            return;
        };
        if object.get("type").and_then(Value::as_str) == Some("check_item")
            && let Some(attrs) = object.get("attrs").and_then(Value::as_object)
        {
            let task_id = attrs.get("taskId").and_then(Value::as_str);
            let block_id = attrs.get("blockId").and_then(Value::as_str);
            if let (Some(task_id), Some(block_id)) = (task_id, block_id)
                && validate_id("task id", task_id).is_ok()
                && validate_id("task source block id", block_id).is_ok()
                && task_id != block_id
            {
                let title = link_title(object);
                if !title.is_empty() {
                    links.push(DocumentTaskLink {
                        task_id: task_id.to_string(),
                        block_id: block_id.to_string(),
                        title,
                        checked: attrs
                            .get("checked")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                    });
                }
            }
        }
        if let Some(content) = object.get("content").and_then(Value::as_array) {
            for child in content {
                visit(child, links);
            }
        }
    }

    let mut links = Vec::new();
    visit(document, &mut links);
    links
}

/// The single link a document declares for `task_id`, or `None` when the
/// document declares none or declares it more than once. A duplicated link is
/// never treated as authoritative because the checklist item it belongs to is
/// ambiguous.
#[must_use]
pub fn unique_document_task_link<'a>(
    links: &'a [DocumentTaskLink],
    task_id: &str,
) -> Option<&'a DocumentTaskLink> {
    let mut matches = links.iter().filter(|link| link.task_id == task_id);
    let first = matches.next()?;
    matches.next().is_none().then_some(first)
}

/// Validate the task index against the entities it references. Every caller
/// that materializes tasks — snapshot reads and archive imports alike — runs
/// this so a dangling source link or assignee surfaces immediately instead of
/// being rendered as a silently broken task.
pub fn validate_workspace_tasks(
    tasks: &[WorkspaceTask],
    note_documents: &BTreeMap<&str, &Value>,
    tag_ids: &BTreeSet<&str>,
    person_ids: &BTreeSet<&str>,
) -> Result<(), OperationValidationError> {
    let mut ids = BTreeSet::new();
    let mut sources = BTreeSet::new();
    for task in tasks {
        task.validate()?;
        if !ids.insert(task.id.as_str()) {
            return Err(OperationValidationError::Duplicate {
                field: "task",
                id: task.id.clone(),
            });
        }
        for tag_id in &task.tag_ids {
            if !tag_ids.contains(tag_id.as_str()) {
                return Err(OperationValidationError::UnknownReference {
                    field: "task tags",
                    id: tag_id.clone(),
                });
            }
        }
        for person_id in &task.assignee_ids {
            if !person_ids.contains(person_id.as_str()) {
                return Err(OperationValidationError::UnknownReference {
                    field: "task assignees",
                    id: person_id.clone(),
                });
            }
        }
        let Some(source) = &task.source else {
            continue;
        };
        if !sources.insert((source.note_id.as_str(), source.block_id.as_str())) {
            return Err(OperationValidationError::Duplicate {
                field: "task source",
                id: source.block_id.clone(),
            });
        }
        let document = note_documents.get(source.note_id.as_str()).ok_or_else(|| {
            OperationValidationError::UnknownReference {
                field: "task source note",
                id: source.note_id.clone(),
            }
        })?;
        let links = document_task_links(document);
        let link = unique_document_task_link(&links, &task.id).ok_or_else(|| {
            OperationValidationError::UnlinkedTaskSource {
                id: task.id.clone(),
            }
        })?;
        if link.block_id != source.block_id {
            return Err(OperationValidationError::UnlinkedTaskSource {
                id: task.id.clone(),
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        DocumentTaskLink, TaskStatus, WorkspaceTask, document_task_links, unique_document_task_link,
    };

    fn check_item(
        task_id: Option<&str>,
        block_id: Option<&str>,
        checked: bool,
    ) -> serde_json::Value {
        json!({
            "type": "check_item",
            "attrs": { "checked": checked, "taskId": task_id, "blockId": block_id },
            "content": [{
                "type": "paragraph",
                "content": [{ "type": "text", "text": "  Ship the release  " }],
            }],
        })
    }

    #[test]
    fn collects_only_fully_linked_checklist_items() {
        let document = json!({
            "type": "doc",
            "content": [{
                "type": "check_list",
                "content": [
                    check_item(Some("task-1"), Some("block-1"), true),
                    check_item(None, None, false),
                    check_item(Some("task-2"), None, false),
                ],
            }],
        });
        assert_eq!(
            document_task_links(&document),
            vec![DocumentTaskLink {
                task_id: "task-1".into(),
                block_id: "block-1".into(),
                title: "Ship the release".into(),
                checked: true,
            }]
        );
    }

    #[test]
    fn duplicate_links_are_never_authoritative() {
        let links = vec![
            DocumentTaskLink {
                task_id: "task-1".into(),
                block_id: "block-1".into(),
                title: "One".into(),
                checked: false,
            },
            DocumentTaskLink {
                task_id: "task-1".into(),
                block_id: "block-2".into(),
                title: "Two".into(),
                checked: true,
            },
        ];
        assert!(unique_document_task_link(&links, "task-1").is_none());
        assert!(unique_document_task_link(&links[..1], "task-1").is_some());
    }

    #[test]
    fn checkbox_owns_completion() {
        assert_eq!(
            WorkspaceTask::reconciled_status(TaskStatus::InProgress, true),
            TaskStatus::Done
        );
        assert_eq!(
            WorkspaceTask::reconciled_status(TaskStatus::Done, false),
            TaskStatus::Todo
        );
        assert_eq!(
            WorkspaceTask::reconciled_status(TaskStatus::InProgress, false),
            TaskStatus::InProgress
        );
    }
}
