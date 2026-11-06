use std::collections::{BTreeMap, BTreeSet};

use thiserror::Error;

use crate::{
    AnnotationStatus, NodeKind, NodePlacement, WorkspaceAnnotation, WorkspaceOperation,
    WorkspaceOperationEnvelope, WorkspaceSnapshot,
};

#[derive(Debug, Error)]
pub enum InitialSyncError {
    #[error("note {0} has no document for initial sync")]
    MissingDocument(String),
    #[error("workspace hierarchy could not be ordered for initial sync")]
    UnorderedHierarchy,
    #[error(transparent)]
    InvalidMathMacros(#[from] serde_json::Error),
}

/// The operations that replay a whole local workspace into an empty sync log
/// when a device first connects. Parents precede their children, documents
/// travel with their notes, an already-resolved annotation replays as its
/// create followed by its resolve, and trash is replayed last, once per
/// outermost trashed node.
pub fn initial_sync_operations(
    snapshot: WorkspaceSnapshot,
) -> Result<Vec<WorkspaceOperationEnvelope>, InitialSyncError> {
    let mut operations = Vec::new();

    operations.extend(
        snapshot
            .tags
            .into_iter()
            .map(|tag| WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateTag { tag })),
    );
    operations.extend(
        snapshot.people.into_iter().map(|person| {
            WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreatePerson { person })
        }),
    );

    let documents = snapshot
        .documents
        .into_iter()
        .map(|document| (document.note_id.clone(), document))
        .collect::<BTreeMap<_, _>>();
    let deleted_ids = snapshot
        .nodes
        .iter()
        .filter(|node| node.deleted_at.is_some())
        .map(|node| node.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut pending = snapshot.nodes.iter().collect::<Vec<_>>();
    let mut emitted = BTreeSet::new();
    while !pending.is_empty() {
        let before = pending.len();
        let mut next = Vec::new();
        for node in pending {
            if node
                .parent_id
                .as_ref()
                .is_some_and(|parent_id| !emitted.contains(parent_id))
            {
                next.push(node);
                continue;
            }
            let placement = NodePlacement::last(node.parent_id.clone());
            let operation = match node.kind {
                NodeKind::Folder => WorkspaceOperation::CreateFolder {
                    id: node.id.clone(),
                    title: node.title.clone(),
                    placement,
                    at: node.created_at,
                },
                NodeKind::Note => {
                    let document = documents
                        .get(&node.id)
                        .ok_or_else(|| InitialSyncError::MissingDocument(node.id.clone()))?;
                    WorkspaceOperation::CreateNote {
                        id: node.id.clone(),
                        title: node.title.clone(),
                        placement,
                        document_json: document.document_json.clone(),
                        markdown: document.markdown.clone(),
                        at: node.created_at,
                    }
                }
            };
            operations.push(WorkspaceOperationEnvelope::v1(operation));
            if let Some(pinned_at) = node.pinned_at {
                operations.push(WorkspaceOperationEnvelope::v1(
                    WorkspaceOperation::SetNodePinned {
                        id: node.id.clone(),
                        pinned: true,
                        at: pinned_at,
                    },
                ));
            }
            emitted.insert(node.id.clone());
        }
        if next.len() == before {
            return Err(InitialSyncError::UnorderedHierarchy);
        }
        pending = next;
    }

    operations.extend(
        snapshot
            .images
            .into_iter()
            .map(|image| WorkspaceOperationEnvelope::v1(WorkspaceOperation::AttachImage { image })),
    );
    operations.extend(snapshot.media_metadata.into_iter().map(|metadata| {
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::SetMediaMetadata { metadata })
    }));
    operations.extend(snapshot.nodes.iter().flat_map(|node| {
        let mut cover: Vec<WorkspaceOperation> = Vec::new();
        if let Some(image_id) = node.cover_image_id.clone() {
            cover.push(WorkspaceOperation::SetNoteCover {
                note_id: node.id.clone(),
                image_id: Some(image_id),
                at: node.updated_at,
            });
            cover.push(WorkspaceOperation::SetNoteCoverTransform {
                note_id: node.id.clone(),
                position_x: node.cover_position_x,
                position_y: node.cover_position_y,
                zoom: node.cover_zoom,
                at: node.updated_at,
            });
        } else if let Some(gradient) = node.cover_gradient.clone() {
            cover.push(WorkspaceOperation::SetNoteCoverGradient {
                note_id: node.id.clone(),
                gradient: Some(gradient),
                at: node.updated_at,
            });
        }
        if !cover.is_empty() {
            cover.push(WorkspaceOperation::SetNoteCoverFullWidth {
                note_id: node.id.clone(),
                full_width: node.cover_full_width,
                at: node.updated_at,
            });
        }
        cover.into_iter().map(WorkspaceOperationEnvelope::v1)
    }));

    operations.extend(snapshot.properties.into_iter().map(|property| {
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::SetNoteProperty {
            at: snapshot
                .nodes
                .iter()
                .find(|node| node.id == property.note_id)
                .map_or(0, |node| node.updated_at),
            property,
        })
    }));
    operations.extend(snapshot.property_templates.into_iter().map(|template| {
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::SetNotePropertyTemplate { template })
    }));
    operations.extend(snapshot.tasks.into_iter().map(|task| {
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateTask {
            task: Box::new(task),
        })
    }));
    if let Some(value) = snapshot.settings.extensions.get("mathMacros") {
        let macros = serde_json::from_value(value.clone())?;
        operations.push(WorkspaceOperationEnvelope::v1(
            WorkspaceOperation::SetMathMacros { macros },
        ));
    }
    operations.extend(snapshot.prompts.into_iter().map(|prompt| {
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::SetPrompt {
            prompt: Box::new(prompt),
        })
    }));
    operations.extend(snapshot.annotations.into_iter().flat_map(|annotation| {
        let resolved = annotation
            .resolved_at
            .map(|at| (annotation.id.clone(), at))
            .filter(|_| annotation.status == AnnotationStatus::Resolved);
        let created = WorkspaceAnnotation {
            status: AnnotationStatus::Open,
            resolved_at: None,
            ..annotation
        };
        std::iter::once(WorkspaceOperationEnvelope::v1(
            WorkspaceOperation::CreateAnnotation {
                annotation: Box::new(created),
            },
        ))
        .chain(resolved.map(|(id, at)| {
            WorkspaceOperationEnvelope::v1(WorkspaceOperation::ResolveAnnotation { id, at })
        }))
    }));
    operations.extend(snapshot.nodes.iter().filter_map(|node| {
        let deleted_at = node.deleted_at?;
        if node
            .parent_id
            .as_deref()
            .is_some_and(|parent_id| deleted_ids.contains(parent_id))
        {
            return None;
        }
        Some(WorkspaceOperationEnvelope::v1(
            WorkspaceOperation::TrashSubtree {
                root_id: node.id.clone(),
                at: deleted_at,
            },
        ))
    }));
    Ok(operations)
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::{InitialSyncError, initial_sync_operations};
    use crate::{WorkspaceOperation, WorkspaceSnapshot};

    fn node(id: &str, kind: &str, parent_id: Option<&str>, deleted_at: Option<i64>) -> Value {
        json!({
            "id": id,
            "kind": kind,
            "parentId": parent_id,
            "rank": 0,
            "title": id,
            "icon": null,
            "createdAt": 1,
            "updatedAt": 2,
            "deletedAt": deleted_at,
        })
    }

    fn document(note_id: &str) -> Value {
        json!({
            "noteId": note_id,
            "documentJson": { "type": "doc" },
            "markdown": note_id,
            "revision": 1,
            "wordCount": 1,
        })
    }

    fn snapshot(
        nodes: Vec<Value>,
        documents: Vec<Value>,
        annotations: Vec<Value>,
    ) -> WorkspaceSnapshot {
        serde_json::from_value(json!({
            "protocolVersion": 1,
            "activeNoteId": null,
            "nodes": nodes,
            "documents": documents,
            "historyHeaders": [],
            "settings": {},
            "annotations": annotations,
        }))
        .unwrap()
    }

    fn kinds(
        operations: &[crate::WorkspaceOperationEnvelope],
    ) -> Vec<(&'static str, Option<&str>)> {
        operations
            .iter()
            .map(|envelope| {
                (
                    envelope.operation.sync_policy().operation_type,
                    envelope.operation.target_entity_id(),
                )
            })
            .collect()
    }

    #[test]
    fn parents_replay_before_children_whatever_the_stored_order() {
        let operations = initial_sync_operations(snapshot(
            vec![
                node("child", "note", Some("folder"), None),
                node("folder", "folder", None, None),
            ],
            vec![document("child")],
            vec![],
        ))
        .unwrap();
        assert_eq!(
            kinds(&operations),
            vec![
                ("create_folder", Some("folder")),
                ("create_note", Some("child"))
            ]
        );
    }

    #[test]
    fn trash_replays_last_and_once_per_outermost_node() {
        let operations = initial_sync_operations(snapshot(
            vec![
                node("folder", "folder", None, Some(5)),
                node("inside", "note", Some("folder"), Some(5)),
            ],
            vec![document("inside")],
            vec![],
        ))
        .unwrap();
        let last = operations.last().map(|envelope| &envelope.operation);
        assert_eq!(
            last,
            Some(&WorkspaceOperation::TrashSubtree {
                root_id: "folder".into(),
                at: 5,
            })
        );
        let trashes = operations
            .iter()
            .filter(|envelope| {
                matches!(envelope.operation, WorkspaceOperation::TrashSubtree { .. })
            })
            .count();
        assert_eq!(trashes, 1);
    }

    #[test]
    fn a_resolved_annotation_replays_as_create_then_resolve() {
        let operations = initial_sync_operations(snapshot(
            vec![node("note", "note", None, None)],
            vec![document("note")],
            vec![json!({
                "id": "thread",
                "noteId": "note",
                "status": "resolved",
                "anchorText": "anchor",
                "createdAt": 1,
                "resolvedAt": 4,
            })],
        ))
        .unwrap();
        let tail = &operations[operations.len() - 2..];
        let WorkspaceOperation::CreateAnnotation { annotation } = &tail[0].operation else {
            panic!("expected the annotation create first");
        };
        assert_eq!(annotation.status, crate::AnnotationStatus::Open);
        assert_eq!(annotation.resolved_at, None);
        assert_eq!(
            tail[1].operation,
            WorkspaceOperation::ResolveAnnotation {
                id: "thread".into(),
                at: 4,
            }
        );
    }

    #[test]
    fn a_note_without_a_document_is_refused() {
        let error = initial_sync_operations(snapshot(
            vec![node("note", "note", None, None)],
            vec![],
            vec![],
        ))
        .unwrap_err();
        assert!(matches!(error, InitialSyncError::MissingDocument(id) if id == "note"));
    }

    #[test]
    fn an_orphaned_hierarchy_is_refused() {
        let error = initial_sync_operations(snapshot(
            vec![node("child", "folder", Some("missing"), None)],
            vec![],
            vec![],
        ))
        .unwrap_err();
        assert!(matches!(error, InitialSyncError::UnorderedHierarchy));
    }
}
