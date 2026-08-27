use std::collections::BTreeMap;

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use skriuw_domain::{
    AnnotationComment, EntityRevision, NodePlacement, NodePosition, NodeRankChange,
    NotePropertyField, NotePropertyValue, OperationAck, TaskSourceDocument, WorkspaceOperation,
    WorkspaceOperationEnvelope, WorkspacePrompt, WorkspaceTask,
};
use skriuw_storage::StorageError;
use uuid::Uuid;

use crate::error::{backend, json_backend, validation};
use crate::queries::{read_stored_active_note, read_task, read_tasks_where};

pub(crate) const NODE_RANK_GAP: i64 = 1024;

pub(crate) fn validate_operations(
    operations: &[WorkspaceOperationEnvelope],
) -> Result<(), StorageError> {
    skriuw_domain::validate_operation_group(operations).map_err(validation)
}

pub(crate) fn replace_references(
    transaction: &Transaction<'_>,
    note_id: &str,
    document: &serde_json::Value,
) -> Result<(), StorageError> {
    transaction
        .execute(
            "DELETE FROM document_references WHERE source_note_id = ?1",
            [note_id],
        )
        .map_err(backend)?;
    for reference in skriuw_domain::document_references(document) {
        let exists = match reference.kind {
            skriuw_domain::ReferenceKind::Tag => transaction
                .query_row(
                    "SELECT 1 FROM workspace_tags WHERE id = ?1",
                    [&reference.target_id],
                    |_| Ok(()),
                )
                .optional()
                .map_err(backend)?
                .is_some(),
            skriuw_domain::ReferenceKind::Person => transaction
                .query_row(
                    "SELECT 1 FROM workspace_people WHERE id = ?1",
                    [&reference.target_id],
                    |_| Ok(()),
                )
                .optional()
                .map_err(backend)?
                .is_some(),
            skriuw_domain::ReferenceKind::Note => transaction
                .query_row(
                    "SELECT 1 FROM workspace_nodes WHERE id = ?1 AND kind = 'note'",
                    [&reference.target_id],
                    |_| Ok(()),
                )
                .optional()
                .map_err(backend)?
                .is_some(),
        };
        if !exists {
            return Err(StorageError::InvalidOperation(format!(
                "dangling reference {}",
                reference.target_id
            )));
        }
        let kind = match reference.kind {
            skriuw_domain::ReferenceKind::Tag => "tag",
            skriuw_domain::ReferenceKind::Person => "person",
            skriuw_domain::ReferenceKind::Note => "note",
        };
        transaction.execute("INSERT INTO document_references (source_note_id, kind, target_id) VALUES (?1, ?2, ?3)", params![note_id, kind, reference.target_id]).map_err(backend)?;
    }
    Ok(())
}

pub(crate) fn apply_operations_in_transaction(
    transaction: &Transaction<'_>,
    operations: &[WorkspaceOperationEnvelope],
) -> Result<OperationAck, StorageError> {
    let mut revisions = Vec::new();
    let mut rank_changes = BTreeMap::new();
    for envelope in operations {
        apply_operation(
            transaction,
            &envelope.operation,
            &mut revisions,
            &mut rank_changes,
        )?;
    }
    Ok(OperationAck {
        applied: operations.len(),
        revisions,
        rank_changes: rank_changes.into_values().collect(),
    })
}

fn apply_operation(
    transaction: &Transaction<'_>,
    operation: &WorkspaceOperation,
    revisions: &mut Vec<EntityRevision>,
    rank_changes: &mut BTreeMap<String, NodeRankChange>,
) -> Result<(), StorageError> {
    match operation {
        WorkspaceOperation::CreateTag { tag } => {
            transaction
                .execute(
                    "INSERT INTO workspace_tags (id, name, color, created_at, updated_at, created_in) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        tag.id,
                        tag.name,
                        tag.color,
                        tag.created_at,
                        tag.updated_at,
                        tag.created_in
                    ],
                )
                .map_err(|error| StorageError::AlreadyExists(error.to_string()))?;
        }
        WorkspaceOperation::RenameTag { id, name } => {
            require_changed(
                transaction
                    .execute(
                        "UPDATE workspace_tags \
                         SET name = ?2, updated_at = unixepoch('subsec') * 1000 WHERE id = ?1",
                        params![id, name],
                    )
                    .map_err(backend)?,
                id,
            )?;
        }
        WorkspaceOperation::RecolorTag { id, color } => {
            require_changed(
                transaction
                    .execute(
                        "UPDATE workspace_tags \
                         SET color = ?2, updated_at = unixepoch('subsec') * 1000 WHERE id = ?1",
                        params![id, color],
                    )
                    .map_err(backend)?,
                id,
            )?;
        }
        WorkspaceOperation::DeleteTag { id } => {
            require_changed(
                transaction
                    .execute("DELETE FROM workspace_tags WHERE id = ?1", [id])
                    .map_err(backend)?,
                id,
            )?;
            transaction
                .execute(
                    "DELETE FROM document_references WHERE kind = 'tag' AND target_id = ?1",
                    [id],
                )
                .map_err(backend)?;
            insert_terminal_tombstone(transaction, "tag", id, "", None)?;
        }
        WorkspaceOperation::RecordProviderImport { receipt } => {
            transaction
                .execute(
                    "INSERT INTO provider_import_receipts \
                     (provider, source_key, source_path, note_id, imported_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5) \
                     ON CONFLICT(provider, source_key, source_path) DO UPDATE SET \
                     note_id = excluded.note_id, imported_at = excluded.imported_at",
                    params![
                        receipt.provider,
                        receipt.source_key,
                        receipt.source_path,
                        receipt.note_id,
                        receipt.imported_at
                    ],
                )
                .map_err(backend)?;
        }
        WorkspaceOperation::CreatePerson { person } => {
            transaction.execute("INSERT INTO workspace_people (id, name, initials, color, note, created_at, updated_at, created_in) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)", params![person.id, person.name, person.initials, person.color, person.note, person.created_at, person.updated_at, person.created_in]).map_err(|error| StorageError::AlreadyExists(error.to_string()))?;
        }
        WorkspaceOperation::RenamePerson { id, name } => {
            require_changed(
                transaction
                    .execute(
                        "UPDATE workspace_people \
                         SET name = ?2, updated_at = unixepoch('subsec') * 1000 WHERE id = ?1",
                        params![id, name],
                    )
                    .map_err(backend)?,
                id,
            )?;
        }
        WorkspaceOperation::RecolorPerson { id, color } => {
            require_changed(
                transaction
                    .execute(
                        "UPDATE workspace_people \
                         SET color = ?2, updated_at = unixepoch('subsec') * 1000 WHERE id = ?1",
                        params![id, color],
                    )
                    .map_err(backend)?,
                id,
            )?;
        }
        WorkspaceOperation::DeletePerson { id } => {
            let referenced = transaction
                .query_row(
                    "SELECT EXISTS(\
                         SELECT 1 FROM note_properties property, \
                         json_each(json_extract(property.value_json, '$.value')) value \
                         WHERE json_extract(property.value_json, '$.type') = 'person' \
                         AND value.value = ?1 \
                         UNION ALL \
                         SELECT 1 FROM note_property_template_fields field, \
                         json_each(json_extract(field.value_json, '$.value')) value \
                         WHERE json_extract(field.value_json, '$.type') = 'person' \
                         AND value.value = ?1\
                     )",
                    [id],
                    |row| row.get::<_, bool>(0),
                )
                .map_err(backend)?;
            if referenced {
                return Err(StorageError::InvalidOperation(format!(
                    "person {id} is referenced by a note property or template"
                )));
            }
            require_changed(
                transaction
                    .execute("DELETE FROM workspace_people WHERE id = ?1", [id])
                    .map_err(backend)?,
                id,
            )?;
            transaction
                .execute(
                    "DELETE FROM document_references WHERE kind = 'person' AND target_id = ?1",
                    [id],
                )
                .map_err(backend)?;
            insert_terminal_tombstone(transaction, "person", id, "", None)?;
        }
        WorkspaceOperation::CreateFolder {
            id,
            title,
            placement,
            at,
        } => {
            require_parent_folder(transaction, placement.parent_id.as_deref())?;
            let rank = allocate_rank(transaction, id, placement, rank_changes)?;
            transaction
                .execute(
                    "INSERT INTO workspace_nodes \
                     (id, kind, parent_id, rank, title, created_at, updated_at) \
                     VALUES (?1, 'folder', ?2, ?3, ?4, ?5, ?5)",
                    params![id, placement.parent_id, rank, title, at],
                )
                .map_err(backend)?;
            record_rank_change(rank_changes, id, &placement.parent_id, rank);
        }
        WorkspaceOperation::CreateNote {
            id,
            title,
            placement,
            document_json,
            markdown,
            at,
        } => {
            require_parent_folder(transaction, placement.parent_id.as_deref())?;
            let rank = allocate_rank(transaction, id, placement, rank_changes)?;
            transaction
                .execute(
                    "INSERT INTO workspace_nodes \
                     (id, kind, parent_id, rank, title, created_at, updated_at) \
                     VALUES (?1, 'note', ?2, ?3, ?4, ?5, ?5)",
                    params![id, placement.parent_id, rank, title, at],
                )
                .map_err(backend)?;
            transaction
                .execute(
                    "INSERT INTO documents \
                     (note_id, document_json, markdown, revision, word_count) \
                     VALUES (?1, ?2, ?3, 1, ?4)",
                    params![
                        id,
                        document_json.to_string(),
                        markdown,
                        count_words(markdown)
                    ],
                )
                .map_err(backend)?;
            replace_fts(transaction, id, title, markdown)?;
            replace_references(transaction, id, document_json)?;
            enqueue_history(transaction, id, 1, markdown, *at)?;
            revisions.push(EntityRevision {
                id: id.clone(),
                revision: 1,
            });
            record_rank_change(rank_changes, id, &placement.parent_id, rank);
        }
        WorkspaceOperation::RenameNode { id, title, at } => {
            require_available_node(transaction, id)?;
            let changed = transaction
                .execute(
                    "UPDATE workspace_nodes SET title = ?2, updated_at = ?3 WHERE id = ?1",
                    params![id, title, at],
                )
                .map_err(backend)?;
            require_changed(changed, id)?;
            transaction
                .execute(
                    "UPDATE documents_fts SET title = ?2 WHERE note_id = ?1",
                    params![id, title],
                )
                .map_err(backend)?;
        }
        WorkspaceOperation::SetNoteCover {
            note_id,
            image_id,
            at,
        } => {
            require_note(transaction, note_id)?;
            let previous_image_id = transaction
                .query_row(
                    "SELECT cover_image_id FROM workspace_nodes WHERE id = ?1",
                    [note_id],
                    |row| row.get::<_, Option<String>>(0),
                )
                .map_err(backend)?;
            if let Some(image_id) = image_id {
                let owned = transaction
                    .query_row(
                        "SELECT 1 FROM note_images WHERE id = ?1 AND note_id = ?2",
                        params![image_id, note_id],
                        |_| Ok(()),
                    )
                    .optional()
                    .map_err(backend)?;
                if owned.is_none() {
                    return Err(StorageError::InvalidOperation(
                        "cover image must belong to the note".into(),
                    ));
                }
            }
            transaction
                .execute(
                    "UPDATE workspace_nodes \
                     SET cover_image_id = ?2, \
                         cover_full_width = CASE WHEN ?2 IS NULL THEN 0 ELSE cover_full_width END, \
                         cover_position_x = CASE WHEN cover_image_id IS NOT ?2 THEN 50 ELSE cover_position_x END, \
                         cover_position_y = CASE WHEN cover_image_id IS NOT ?2 THEN 50 ELSE cover_position_y END, \
                         cover_zoom = CASE WHEN cover_image_id IS NOT ?2 THEN 1 ELSE cover_zoom END, \
                         updated_at = ?3 \
                     WHERE id = ?1",
                    params![note_id, image_id, at],
                )
                .map_err(backend)?;
            if previous_image_id.as_ref() != image_id.as_ref()
                && let Some(previous_image_id) = previous_image_id
            {
                let document_json = transaction
                    .query_row(
                        "SELECT document_json FROM documents WHERE note_id = ?1",
                        [note_id],
                        |row| row.get::<_, String>(0),
                    )
                    .map_err(backend)?;
                let document = serde_json::from_str(&document_json).map_err(json_backend)?;
                if !skriuw_domain::document_image_ids(&document).contains(&previous_image_id) {
                    transaction
                        .execute(
                            "DELETE FROM note_images WHERE id = ?1",
                            [&previous_image_id],
                        )
                        .map_err(backend)?;
                }
            }
        }
        WorkspaceOperation::SetNoteCoverFullWidth {
            note_id,
            full_width,
            at,
        } => {
            require_note(transaction, note_id)?;
            if *full_width {
                let has_cover = transaction
                    .query_row(
                        "SELECT cover_image_id IS NOT NULL FROM workspace_nodes WHERE id = ?1",
                        [note_id],
                        |row| row.get::<_, bool>(0),
                    )
                    .map_err(backend)?;
                if !has_cover {
                    return Err(StorageError::InvalidOperation(
                        "full-width cover requires a cover image".into(),
                    ));
                }
            }
            transaction
                .execute(
                    "UPDATE workspace_nodes SET cover_full_width = ?2, updated_at = ?3 WHERE id = ?1",
                    params![note_id, full_width, at],
                )
                .map_err(backend)?;
        }
        WorkspaceOperation::SetNoteCoverTransform {
            note_id,
            position_x,
            position_y,
            zoom,
            at,
        } => {
            require_note(transaction, note_id)?;
            let has_cover = transaction
                .query_row(
                    "SELECT cover_image_id IS NOT NULL FROM workspace_nodes WHERE id = ?1",
                    [note_id],
                    |row| row.get::<_, bool>(0),
                )
                .map_err(backend)?;
            if !has_cover {
                return Err(StorageError::InvalidOperation(
                    "cover transform requires a cover image".into(),
                ));
            }
            transaction
                .execute(
                    "UPDATE workspace_nodes \
                     SET cover_position_x = ?2, cover_position_y = ?3, cover_zoom = ?4, \
                         updated_at = ?5 \
                     WHERE id = ?1",
                    params![note_id, position_x, position_y, zoom, at],
                )
                .map_err(backend)?;
        }
        WorkspaceOperation::SetNodePinned { id, pinned, at } => {
            require_available_node(transaction, id)?;
            let pinned_at = pinned.then_some(*at);
            let changed = transaction
                .execute(
                    "UPDATE workspace_nodes SET pinned_at = ?2, updated_at = ?3 WHERE id = ?1",
                    params![id, pinned_at, at],
                )
                .map_err(backend)?;
            require_changed(changed, id)?;
        }
        WorkspaceOperation::MoveNode { id, placement, at } => {
            require_available_node(transaction, id)?;
            require_parent_folder(transaction, placement.parent_id.as_deref())?;
            require_acyclic_parent(transaction, id, placement.parent_id.as_deref())?;
            let rank = allocate_rank(transaction, id, placement, rank_changes)?;
            let changed = transaction
                .execute(
                    "UPDATE workspace_nodes \
                     SET parent_id = ?2, rank = ?3, updated_at = ?4 \
                     WHERE id = ?1",
                    params![id, placement.parent_id, rank, at],
                )
                .map_err(backend)?;
            require_changed(changed, id)?;
            record_rank_change(rank_changes, id, &placement.parent_id, rank);
        }
        WorkspaceOperation::SaveDocument {
            note_id,
            document_json,
            markdown,
            word_count,
            expected_revision,
            at,
        } => {
            save_document(
                transaction,
                note_id,
                document_json,
                markdown,
                *word_count,
                *expected_revision,
                *at,
                revisions,
            )?;
        }
        WorkspaceOperation::TrashSubtree { root_id, at } => {
            require_available_node(transaction, root_id)?;
            clear_active_note_in_subtree(transaction, root_id)?;
            let changed = transaction
                .execute(
                    "UPDATE workspace_nodes SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1",
                    params![root_id, at],
                )
                .map_err(backend)?;
            require_changed(changed, root_id)?;
        }
        WorkspaceOperation::RestoreSubtree {
            root_id,
            placement,
            at,
        } => {
            require_directly_trashed(transaction, root_id)?;
            require_parent_folder(transaction, placement.parent_id.as_deref())?;
            require_acyclic_parent(transaction, root_id, placement.parent_id.as_deref())?;
            let rank = allocate_rank(transaction, root_id, placement, rank_changes)?;
            let changed = transaction
                .execute(
                    "UPDATE workspace_nodes \
                     SET deleted_at = NULL, parent_id = ?2, rank = ?3, updated_at = ?4 \
                     WHERE id = ?1",
                    params![root_id, placement.parent_id, rank, at],
                )
                .map_err(backend)?;
            require_changed(changed, root_id)?;
            record_rank_change(rank_changes, root_id, &placement.parent_id, rank);
        }
        WorkspaceOperation::PurgeSubtree {
            root_id,
            trashed_before,
        } => {
            require_directly_trashed(transaction, root_id)?;
            let newest_trash = transaction
                .query_row(
                    "WITH RECURSIVE subtree(id) AS (\
                         SELECT id FROM workspace_nodes WHERE id = ?1 \
                         UNION ALL \
                         SELECT child.id FROM workspace_nodes child \
                         JOIN subtree parent ON child.parent_id = parent.id\
                     ) \
                     SELECT MAX(deleted_at) FROM workspace_nodes \
                     WHERE id IN (SELECT id FROM subtree)",
                    [root_id],
                    |row| row.get::<_, Option<i64>>(0),
                )
                .map_err(backend)?
                .ok_or_else(|| StorageError::NotFound(root_id.clone()))?;
            if newest_trash > *trashed_before {
                return Err(StorageError::InvalidOperation(format!(
                    "subtree {root_id} contains trash newer than retention cutoff {trashed_before}"
                )));
            }
            clear_active_note_in_subtree(transaction, root_id)?;
            let subtree_ids = {
                let mut statement = transaction
                    .prepare(
                        "WITH RECURSIVE subtree(id) AS (\
                             SELECT id FROM workspace_nodes WHERE id = ?1 \
                             UNION ALL \
                             SELECT child.id FROM workspace_nodes child \
                             JOIN subtree parent ON child.parent_id = parent.id\
                         ) \
                         SELECT id FROM subtree ORDER BY id",
                    )
                    .map_err(backend)?;
                statement
                    .query_map([root_id], |row| row.get::<_, String>(0))
                    .map_err(backend)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(backend)?
            };
            for id in &subtree_ids {
                insert_terminal_tombstone(transaction, "node", id, "", Some(root_id))?;
            }
            detach_tasks(
                transaction,
                "source_note_id IN (\
                     WITH RECURSIVE subtree(id) AS (\
                         SELECT id FROM workspace_nodes WHERE id = ?1 \
                         UNION ALL \
                         SELECT child.id FROM workspace_nodes child \
                         JOIN subtree parent ON child.parent_id = parent.id\
                     ) SELECT id FROM subtree)",
                &[&root_id],
                *trashed_before,
            )?;
            purge_annotations_for_notes(transaction, &subtree_ids)?;
            transaction
                .execute(
                    "WITH RECURSIVE subtree(id) AS (\
                         SELECT id FROM workspace_nodes WHERE id = ?1 \
                         UNION ALL \
                         SELECT child.id FROM workspace_nodes child \
                         JOIN subtree parent ON child.parent_id = parent.id\
                     ) \
                     DELETE FROM documents_fts WHERE note_id IN (SELECT id FROM subtree)",
                    [root_id],
                )
                .map_err(backend)?;
            let changed = transaction
                .execute(
                    "WITH RECURSIVE subtree(id) AS (\
                         SELECT id FROM workspace_nodes WHERE id = ?1 \
                         UNION ALL \
                         SELECT child.id FROM workspace_nodes child \
                         JOIN subtree parent ON child.parent_id = parent.id\
                     ) \
                     DELETE FROM workspace_nodes WHERE id IN (SELECT id FROM subtree)",
                    [root_id],
                )
                .map_err(backend)?;
            require_changed(changed, root_id)?;
        }
        WorkspaceOperation::SetActiveNote { note_id } => {
            if let Some(id) = note_id {
                require_note(transaction, id)?;
            }
            transaction
                .execute(
                    "INSERT INTO app_state(key, value_json) VALUES ('active_note_id', ?1) \
                     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
                    [serde_json::to_string(note_id).map_err(json_backend)?],
                )
                .map_err(backend)?;
        }
        WorkspaceOperation::UpdateSettings { settings } => {
            transaction
                .execute(
                    "INSERT INTO app_state(key, value_json) VALUES ('settings', ?1) \
                     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
                    [serde_json::to_string(settings).map_err(json_backend)?],
                )
                .map_err(backend)?;
        }
        WorkspaceOperation::AttachImage { image } => {
            require_note(transaction, &image.note_id)?;
            transaction
                .execute(
                    "INSERT INTO note_images \
                     (id, note_id, content_hash, mime_type, byte_size, width, height, created_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        image.id,
                        image.note_id,
                        image.content_hash,
                        image.mime_type,
                        image.byte_size,
                        image.width,
                        image.height,
                        image.created_at
                    ],
                )
                .map_err(|error| StorageError::AlreadyExists(error.to_string()))?;
        }
        WorkspaceOperation::SetNoteProperty { property, at } => {
            require_note(transaction, &property.note_id)?;
            require_property_people(transaction, &property.field)?;
            let existing_position = transaction
                .query_row(
                    "SELECT position FROM note_properties WHERE note_id = ?1 AND id = ?2",
                    params![property.note_id, property.field.id],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(backend)?;
            let count = transaction
                .query_row(
                    "SELECT COUNT(*) FROM note_properties WHERE note_id = ?1",
                    [&property.note_id],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(backend)?;
            let expected_position = existing_position.unwrap_or(count);
            if property.field.position != expected_position {
                return Err(StorageError::InvalidOperation(format!(
                    "property {} requires position {expected_position}",
                    property.field.id
                )));
            }
            transaction
                .execute(
                    "INSERT INTO note_properties \
                     (note_id, id, name, value_json, options_json, position) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
                     ON CONFLICT(note_id, id) DO UPDATE SET \
                     name = excluded.name, value_json = excluded.value_json, \
                     options_json = excluded.options_json",
                    params![
                        property.note_id,
                        property.field.id,
                        property.field.name,
                        serde_json::to_string(&property.field.value).map_err(json_backend)?,
                        serde_json::to_string(&property.field.options).map_err(json_backend)?,
                        property.field.position
                    ],
                )
                .map_err(backend)?;
            touch_note(transaction, &property.note_id, *at)?;
        }
        WorkspaceOperation::RemoveNoteProperty {
            note_id,
            property_id,
            at,
        } => {
            require_note(transaction, note_id)?;
            let position = transaction
                .query_row(
                    "SELECT position FROM note_properties WHERE note_id = ?1 AND id = ?2",
                    params![note_id, property_id],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(backend)?
                .ok_or_else(|| StorageError::NotFound(property_id.clone()))?;
            transaction
                .execute(
                    "DELETE FROM note_properties WHERE note_id = ?1 AND id = ?2",
                    params![note_id, property_id],
                )
                .map_err(backend)?;
            transaction
                .execute(
                    "UPDATE note_properties SET position = position - 1 \
                     WHERE note_id = ?1 AND position > ?2",
                    params![note_id, position],
                )
                .map_err(backend)?;
            insert_terminal_tombstone(transaction, "note_property", property_id, note_id, None)?;
            touch_note(transaction, note_id, *at)?;
        }
        WorkspaceOperation::ReorderNoteProperties {
            note_id,
            ordered_property_ids,
            at,
        } => {
            require_note(transaction, note_id)?;
            require_exact_order(
                transaction,
                "note_properties",
                "note_id",
                Some(note_id),
                ordered_property_ids,
            )?;
            for (position, property_id) in ordered_property_ids.iter().enumerate() {
                transaction
                    .execute(
                        "UPDATE note_properties SET position = ?3 \
                         WHERE note_id = ?1 AND id = ?2",
                        params![note_id, property_id, position as i64],
                    )
                    .map_err(backend)?;
            }
            touch_note(transaction, note_id, *at)?;
        }
        WorkspaceOperation::SetNotePropertyTemplate { template } => {
            for field in &template.properties {
                require_property_people(transaction, field)?;
            }
            let existing_position = transaction
                .query_row(
                    "SELECT position FROM note_property_templates WHERE id = ?1",
                    [&template.id],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(backend)?;
            let count = transaction
                .query_row("SELECT COUNT(*) FROM note_property_templates", [], |row| {
                    row.get::<_, i64>(0)
                })
                .map_err(backend)?;
            let expected_position = existing_position.unwrap_or(count);
            if template.position != expected_position {
                return Err(StorageError::InvalidOperation(format!(
                    "property template {} requires position {expected_position}",
                    template.id
                )));
            }
            transaction
                .execute(
                    "INSERT INTO note_property_templates (id, name, position) \
                     VALUES (?1, ?2, ?3) \
                     ON CONFLICT(id) DO UPDATE SET name = excluded.name",
                    params![template.id, template.name, template.position],
                )
                .map_err(backend)?;
            transaction
                .execute(
                    "DELETE FROM note_property_template_fields WHERE template_id = ?1",
                    [&template.id],
                )
                .map_err(backend)?;
            insert_template_fields(transaction, &template.id, &template.properties)?;
        }
        WorkspaceOperation::DeleteNotePropertyTemplate { template_id } => {
            let position = transaction
                .query_row(
                    "SELECT position FROM note_property_templates WHERE id = ?1",
                    [template_id],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(backend)?
                .ok_or_else(|| StorageError::NotFound(template_id.clone()))?;
            transaction
                .execute(
                    "DELETE FROM note_property_templates WHERE id = ?1",
                    [template_id],
                )
                .map_err(backend)?;
            transaction
                .execute(
                    "UPDATE note_property_templates SET position = position - 1 \
                     WHERE position > ?1",
                    [position],
                )
                .map_err(backend)?;
            insert_terminal_tombstone(transaction, "property_template", template_id, "", None)?;
        }
        WorkspaceOperation::ReorderNotePropertyTemplates {
            ordered_template_ids,
        } => {
            require_exact_order(
                transaction,
                "note_property_templates",
                "",
                None,
                ordered_template_ids,
            )?;
            for (position, template_id) in ordered_template_ids.iter().enumerate() {
                transaction
                    .execute(
                        "UPDATE note_property_templates SET position = ?2 WHERE id = ?1",
                        params![template_id, position as i64],
                    )
                    .map_err(backend)?;
            }
        }
        WorkspaceOperation::CreateTask { task } => {
            insert_task(transaction, task)?;
        }
        WorkspaceOperation::PromoteChecklistTask { task, document } => {
            save_task_document(
                transaction,
                Some(document.as_ref()),
                task.updated_at,
                revisions,
            )?;
            insert_task(transaction, task)?;
        }
        WorkspaceOperation::UpdateTask { task, document } => {
            let stored = read_task(transaction, &task.id)?
                .ok_or_else(|| StorageError::NotFound(task.id.clone()))?;
            if stored.source != task.source || stored.detached_at != task.detached_at {
                return Err(StorageError::InvalidOperation(format!(
                    "task {} source link changes only through promotion or detachment",
                    task.id
                )));
            }
            require_task_references(transaction, task)?;
            transaction
                .execute(
                    "UPDATE workspace_tasks SET title = ?2, status = ?3, priority = ?4, \
                     due_date = ?5, description = ?6, tag_ids_json = ?7, assignee_ids_json = ?8, \
                     updated_at = ?9 WHERE id = ?1",
                    params![
                        task.id,
                        task.title,
                        task.status.as_str(),
                        task.priority.as_str(),
                        task.due_date,
                        task.description,
                        serde_json::to_string(&task.tag_ids).map_err(json_backend)?,
                        serde_json::to_string(&task.assignee_ids).map_err(json_backend)?,
                        task.updated_at
                    ],
                )
                .map_err(backend)?;
            save_task_document(transaction, document.as_deref(), task.updated_at, revisions)?;
        }
        WorkspaceOperation::DeleteTask { id, document, at } => {
            let changed = transaction
                .execute("DELETE FROM workspace_tasks WHERE id = ?1", [id])
                .map_err(backend)?;
            require_changed(changed, id)?;
            insert_terminal_tombstone(transaction, "task", id, "", None)?;
            save_task_document(transaction, document.as_deref(), *at, revisions)?;
        }
        WorkspaceOperation::DetachTask { id, document, at } => {
            let stored =
                read_task(transaction, id)?.ok_or_else(|| StorageError::NotFound(id.clone()))?;
            if stored.source.is_none() {
                return Err(StorageError::InvalidOperation(format!(
                    "task {id} is already detached"
                )));
            }
            detach_tasks(transaction, "id = ?1", &[&id], *at)?;
            save_task_document(transaction, document.as_deref(), *at, revisions)?;
        }
        WorkspaceOperation::CreateAnnotation { annotation } => {
            require_note(transaction, &annotation.note_id)?;
            transaction
                .execute(
                    "INSERT INTO note_annotations \
                     (id, note_id, status, anchor_text, created_at, resolved_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        annotation.id,
                        annotation.note_id,
                        annotation.status.as_str(),
                        annotation.anchor_text,
                        annotation.created_at,
                        annotation.resolved_at
                    ],
                )
                .map_err(|error| StorageError::AlreadyExists(error.to_string()))?;
            for comment in &annotation.comments {
                insert_annotation_comment(transaction, &annotation.id, comment)?;
            }
        }
        WorkspaceOperation::AddAnnotationComment {
            annotation_id,
            comment,
        } => {
            require_annotation(transaction, annotation_id)?;
            insert_annotation_comment(transaction, annotation_id, comment)?;
        }
        WorkspaceOperation::UpdateAnnotationComment {
            annotation_id,
            comment_id,
            body_markdown,
            updated_at,
        } => {
            require_annotation(transaction, annotation_id)?;
            let changed = transaction
                .execute(
                    "UPDATE note_annotation_comments SET body_markdown = ?3, updated_at = ?4 \
                     WHERE id = ?1 AND annotation_id = ?2",
                    params![comment_id, annotation_id, body_markdown, updated_at],
                )
                .map_err(backend)?;
            require_changed(changed, comment_id)?;
        }
        WorkspaceOperation::DeleteAnnotationComment {
            annotation_id,
            comment_id,
        } => {
            let changed = transaction
                .execute(
                    "DELETE FROM note_annotation_comments WHERE id = ?1 AND annotation_id = ?2",
                    params![comment_id, annotation_id],
                )
                .map_err(backend)?;
            require_changed(changed, comment_id)?;
        }
        WorkspaceOperation::ResolveAnnotation { id, at } => {
            let changed = transaction
                .execute(
                    "UPDATE note_annotations SET status = 'resolved', resolved_at = ?2 \
                     WHERE id = ?1",
                    params![id, at],
                )
                .map_err(backend)?;
            require_changed(changed, id)?;
        }
        WorkspaceOperation::ReopenAnnotation { id } => {
            let changed = transaction
                .execute(
                    "UPDATE note_annotations SET status = 'open', resolved_at = NULL \
                     WHERE id = ?1",
                    [id],
                )
                .map_err(backend)?;
            require_changed(changed, id)?;
        }
        WorkspaceOperation::DeleteAnnotation { id } => {
            transaction
                .execute(
                    "DELETE FROM note_annotation_comments WHERE annotation_id = ?1",
                    [id],
                )
                .map_err(backend)?;
            let changed = transaction
                .execute("DELETE FROM note_annotations WHERE id = ?1", [id])
                .map_err(backend)?;
            require_changed(changed, id)?;
            insert_terminal_tombstone(transaction, "annotation", id, "", None)?;
        }
        WorkspaceOperation::SetPrompt { prompt } => {
            upsert_prompt(transaction, prompt)?;
        }
        WorkspaceOperation::DeletePrompt { id } => {
            require_changed(
                transaction
                    .execute("DELETE FROM workspace_prompts WHERE id = ?1", [id])
                    .map_err(backend)?,
                id,
            )?;
            insert_terminal_tombstone(transaction, "prompt", id, "", None)?;
        }
    }
    Ok(())
}

/// A prompt shadowing a built-in claims that built-in exclusively. The unique
/// index enforces it, but the collision is reported here so the caller learns
/// which built-in is already customised instead of a bare constraint failure.
fn upsert_prompt(
    transaction: &Transaction<'_>,
    prompt: &WorkspacePrompt,
) -> Result<(), StorageError> {
    if let Some(built_in_id) = &prompt.built_in_id {
        let conflicting = transaction
            .query_row(
                "SELECT id FROM workspace_prompts WHERE built_in_id = ?1 AND id <> ?2",
                params![built_in_id, prompt.id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(backend)?;
        if let Some(conflicting) = conflicting {
            return Err(StorageError::InvalidOperation(format!(
                "built-in prompt {built_in_id} is already customised by prompt {conflicting}"
            )));
        }
    }
    let existing_built_in = transaction
        .query_row(
            "SELECT built_in_id FROM workspace_prompts WHERE id = ?1",
            [&prompt.id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(backend)?;
    if let Some(existing_built_in) = existing_built_in
        && existing_built_in != prompt.built_in_id
    {
        return Err(StorageError::InvalidOperation(format!(
            "prompt {} cannot change which built-in it shadows",
            prompt.id
        )));
    }
    transaction
        .execute(
            "INSERT INTO workspace_prompts \
             (id, name, system_prompt, input_shape, temperature_millis, max_output_bytes, \
              built_in_id, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
             ON CONFLICT(id) DO UPDATE SET \
                name = excluded.name, \
                system_prompt = excluded.system_prompt, \
                input_shape = excluded.input_shape, \
                temperature_millis = excluded.temperature_millis, \
                max_output_bytes = excluded.max_output_bytes, \
                updated_at = excluded.updated_at",
            params![
                prompt.id,
                prompt.name,
                prompt.system_prompt,
                prompt.input_shape.as_str(),
                prompt.parameters.temperature_millis,
                prompt.parameters.max_output_bytes,
                prompt.built_in_id,
                prompt.created_at,
                prompt.updated_at
            ],
        )
        .map_err(backend)?;
    Ok(())
}

/// A thread outlives its anchor text but not its note. Tasks detach and
/// survive a purge because they carry their own title and status; a thread is
/// only ever a comment on words that no longer exist, so it is tombstoned with
/// the note rather than left pointing at nothing.
fn purge_annotations_for_notes(
    transaction: &Transaction<'_>,
    note_ids: &[String],
) -> Result<(), StorageError> {
    for note_id in note_ids {
        let annotation_ids = {
            let mut statement = transaction
                .prepare("SELECT id FROM note_annotations WHERE note_id = ?1 ORDER BY id")
                .map_err(backend)?;
            statement
                .query_map([note_id], |row| row.get::<_, String>(0))
                .map_err(backend)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(backend)?
        };
        for annotation_id in &annotation_ids {
            transaction
                .execute(
                    "DELETE FROM note_annotation_comments WHERE annotation_id = ?1",
                    [annotation_id],
                )
                .map_err(backend)?;
            insert_terminal_tombstone(transaction, "annotation", annotation_id, "", None)?;
        }
        transaction
            .execute("DELETE FROM note_annotations WHERE note_id = ?1", [note_id])
            .map_err(backend)?;
    }
    Ok(())
}

fn require_annotation(transaction: &Transaction<'_>, id: &str) -> Result<(), StorageError> {
    let exists: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM note_annotations WHERE id = ?1)",
            [id],
            |row| row.get(0),
        )
        .map_err(backend)?;
    if exists {
        return Ok(());
    }
    Err(StorageError::NotFound(id.to_string()))
}

fn insert_annotation_comment(
    transaction: &Transaction<'_>,
    annotation_id: &str,
    comment: &AnnotationComment,
) -> Result<(), StorageError> {
    transaction
        .execute(
            "INSERT INTO note_annotation_comments \
             (id, annotation_id, body_markdown, author_id, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                comment.id,
                annotation_id,
                comment.body_markdown,
                comment.author_id,
                comment.created_at,
                comment.updated_at
            ],
        )
        .map_err(|error| StorageError::AlreadyExists(error.to_string()))?;
    Ok(())
}

fn insert_task(transaction: &Transaction<'_>, task: &WorkspaceTask) -> Result<(), StorageError> {
    require_task_references(transaction, task)?;
    if let Some(source) = &task.source {
        require_note(transaction, &source.note_id)?;
        require_document_task_link(transaction, task)?;
    }
    transaction
        .execute(
            "INSERT INTO workspace_tasks \
             (id, title, status, priority, due_date, description, tag_ids_json, \
              assignee_ids_json, source_note_id, source_block_id, detached_at, \
              created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                task.id,
                task.title,
                task.status.as_str(),
                task.priority.as_str(),
                task.due_date,
                task.description,
                serde_json::to_string(&task.tag_ids).map_err(json_backend)?,
                serde_json::to_string(&task.assignee_ids).map_err(json_backend)?,
                task.source.as_ref().map(|source| &source.note_id),
                task.source.as_ref().map(|source| &source.block_id),
                task.detached_at,
                task.created_at,
                task.updated_at
            ],
        )
        .map_err(|error| StorageError::AlreadyExists(error.to_string()))?;
    Ok(())
}

fn require_task_references(
    transaction: &Transaction<'_>,
    task: &WorkspaceTask,
) -> Result<(), StorageError> {
    for tag_id in &task.tag_ids {
        transaction
            .query_row(
                "SELECT 1 FROM workspace_tags WHERE id = ?1",
                [tag_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(backend)?
            .ok_or_else(|| StorageError::NotFound(tag_id.clone()))?;
    }
    for person_id in &task.assignee_ids {
        transaction
            .query_row(
                "SELECT 1 FROM workspace_people WHERE id = ?1",
                [person_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(backend)?
            .ok_or_else(|| StorageError::NotFound(person_id.clone()))?;
    }
    Ok(())
}

/// A linked task is only durable once the stored document actually carries its
/// link, so a promotion that did not reach the document fails instead of
/// creating a task nothing points at.
fn require_document_task_link(
    transaction: &Transaction<'_>,
    task: &WorkspaceTask,
) -> Result<(), StorageError> {
    let Some(source) = &task.source else {
        return Ok(());
    };
    let stored = transaction
        .query_row(
            "SELECT document_json FROM documents WHERE note_id = ?1",
            [&source.note_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(backend)?
        .ok_or_else(|| StorageError::NotFound(source.note_id.clone()))?;
    let document = serde_json::from_str::<serde_json::Value>(&stored).map_err(json_backend)?;
    let links = skriuw_domain::document_task_links(&document);
    let link = skriuw_domain::unique_document_task_link(&links, &task.id).ok_or_else(|| {
        StorageError::InvalidOperation(format!(
            "task {} is not linked from note {}",
            task.id, source.note_id
        ))
    })?;
    if link.block_id != source.block_id {
        return Err(StorageError::InvalidOperation(format!(
            "task {} links block {} but the document links block {}",
            task.id, source.block_id, link.block_id
        )));
    }
    Ok(())
}

fn save_task_document(
    transaction: &Transaction<'_>,
    document: Option<&TaskSourceDocument>,
    at: i64,
    revisions: &mut Vec<EntityRevision>,
) -> Result<(), StorageError> {
    let Some(document) = document else {
        return Ok(());
    };
    save_document(
        transaction,
        &document.note_id,
        &document.document_json,
        &document.markdown,
        document.word_count,
        document.expected_revision,
        at,
        revisions,
    )
}

#[allow(clippy::too_many_arguments)]
fn save_document(
    transaction: &Transaction<'_>,
    note_id: &str,
    document_json: &serde_json::Value,
    markdown: &str,
    word_count: i64,
    expected_revision: i64,
    at: i64,
    revisions: &mut Vec<EntityRevision>,
) -> Result<(), StorageError> {
    require_note(transaction, note_id)?;
    let next_revision = expected_revision.saturating_add(1);
    let changed = transaction
        .execute(
            "UPDATE documents \
             SET document_json = ?2, markdown = ?3, revision = ?4, word_count = ?5 \
             WHERE note_id = ?1 AND revision = ?6",
            params![
                note_id,
                document_json.to_string(),
                markdown,
                next_revision,
                word_count,
                expected_revision
            ],
        )
        .map_err(backend)?;
    if changed == 0 {
        let current = current_revision(transaction, note_id)?;
        return Err(StorageError::RevisionConflict {
            id: note_id.to_string(),
            expected: expected_revision,
            current,
        });
    }
    transaction
        .execute(
            "UPDATE workspace_nodes SET updated_at = ?2 WHERE id = ?1",
            params![note_id, at],
        )
        .map_err(backend)?;
    let title = node_title(transaction, note_id)?;
    replace_fts(transaction, note_id, &title, markdown)?;
    replace_references(transaction, note_id, document_json)?;
    prune_detached_images(transaction, note_id, document_json)?;
    reconcile_note_tasks(transaction, note_id, document_json, at)?;
    enqueue_history(transaction, note_id, next_revision, markdown, at)?;
    revisions.push(EntityRevision {
        id: note_id.to_string(),
        revision: next_revision,
    });
    Ok(())
}

/// Bring every task linked to this note back in step with the document that
/// just landed. The document owns the checklist item, so its text and checkbox
/// win, and a link the document no longer carries detaches its task instead of
/// deleting it.
fn reconcile_note_tasks(
    transaction: &Transaction<'_>,
    note_id: &str,
    document_json: &serde_json::Value,
    at: i64,
) -> Result<(), StorageError> {
    let linked = read_tasks_where(transaction, "source_note_id = ?1", &[&note_id])?;
    if linked.is_empty() {
        return Ok(());
    }
    let links = skriuw_domain::document_task_links(document_json);
    for task in linked {
        let Some(link) = skriuw_domain::unique_document_task_link(&links, &task.id) else {
            detach_tasks(transaction, "id = ?1", &[&task.id.as_str()], at)?;
            continue;
        };
        let status = WorkspaceTask::reconciled_status(task.status, link.checked);
        let source_block_id = link.block_id.as_str();
        let stored_block_id = task
            .source
            .as_ref()
            .map(|source| source.block_id.as_str())
            .unwrap_or_default();
        if status == task.status && link.title == task.title && source_block_id == stored_block_id {
            continue;
        }
        transaction
            .execute(
                "UPDATE workspace_tasks \
                 SET title = ?2, status = ?3, source_block_id = ?4, updated_at = ?5 \
                 WHERE id = ?1",
                params![task.id, link.title, status.as_str(), source_block_id, at],
            )
            .map_err(backend)?;
    }
    Ok(())
}

/// Clears the source link of the matching tasks while keeping the records
/// themselves. A task whose checklist item disappeared stays visible as
/// detached work rather than vanishing with its source.
pub(crate) fn detach_tasks(
    transaction: &Transaction<'_>,
    predicate: &str,
    parameters: &[&dyn rusqlite::ToSql],
    at: i64,
) -> Result<usize, StorageError> {
    let mut bound = parameters.to_vec();
    let at_index = bound.len() + 1;
    bound.push(&at);
    transaction
        .execute(
            &format!(
                "UPDATE workspace_tasks \
                 SET source_note_id = NULL, source_block_id = NULL, \
                     detached_at = ?{at_index}, updated_at = ?{at_index} \
                 WHERE source_note_id IS NOT NULL AND ({predicate})"
            ),
            bound.as_slice(),
        )
        .map_err(backend)
}

/// Records terminal identity intent for a deleted entity so a delayed remote
/// operation cannot resurrect it. First deletion provenance wins; replays are
/// idempotent.
pub(crate) fn insert_terminal_tombstone(
    transaction: &Transaction<'_>,
    entity_kind: &str,
    entity_id: &str,
    scope_id: &str,
    root_id: Option<&str>,
) -> Result<(), StorageError> {
    transaction
        .execute(
            "INSERT OR IGNORE INTO sync_tombstones(\
                entity_kind, entity_id, scope_id, root_id, created_at\
             ) VALUES (?1, ?2, ?3, ?4, CAST(unixepoch('subsec') * 1000 AS INTEGER))",
            params![entity_kind, entity_id, scope_id, root_id],
        )
        .map_err(backend)?;
    Ok(())
}

fn touch_note(transaction: &Transaction<'_>, note_id: &str, at: i64) -> Result<(), StorageError> {
    require_changed(
        transaction
            .execute(
                "UPDATE workspace_nodes SET updated_at = ?2 WHERE id = ?1",
                params![note_id, at],
            )
            .map_err(backend)?,
        note_id,
    )
}

fn require_property_people(
    transaction: &Transaction<'_>,
    field: &NotePropertyField,
) -> Result<(), StorageError> {
    let NotePropertyValue::Person(ids) = &field.value.value else {
        return Ok(());
    };
    for id in ids {
        let exists = transaction
            .query_row("SELECT 1 FROM workspace_people WHERE id = ?1", [id], |_| {
                Ok(())
            })
            .optional()
            .map_err(backend)?
            .is_some();
        if !exists {
            return Err(StorageError::InvalidOperation(format!(
                "dangling property person {id}"
            )));
        }
    }
    Ok(())
}

fn insert_template_fields(
    transaction: &Transaction<'_>,
    template_id: &str,
    fields: &[NotePropertyField],
) -> Result<(), StorageError> {
    for field in fields {
        transaction
            .execute(
                "INSERT INTO note_property_template_fields \
                 (template_id, id, name, value_json, options_json, position) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    template_id,
                    field.id,
                    field.name,
                    serde_json::to_string(&field.value).map_err(json_backend)?,
                    serde_json::to_string(&field.options).map_err(json_backend)?,
                    field.position
                ],
            )
            .map_err(backend)?;
    }
    Ok(())
}

fn require_exact_order(
    transaction: &Transaction<'_>,
    table: &str,
    owner_column: &str,
    owner_id: Option<&str>,
    ordered_ids: &[String],
) -> Result<(), StorageError> {
    let query = if owner_id.is_some() {
        format!("SELECT id FROM {table} WHERE {owner_column} = ?1 ORDER BY id")
    } else {
        format!("SELECT id FROM {table} ORDER BY id")
    };
    let mut statement = transaction.prepare(&query).map_err(backend)?;
    let stored = if let Some(owner_id) = owner_id {
        statement
            .query_map([owner_id], |row| row.get::<_, String>(0))
            .map_err(backend)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(backend)?
    } else {
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(backend)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(backend)?
    };
    let mut expected = ordered_ids.to_vec();
    expected.sort();
    if expected != stored {
        return Err(StorageError::InvalidOperation(
            "reorder must contain every stored id exactly once".into(),
        ));
    }
    Ok(())
}

fn prune_detached_images(
    transaction: &Transaction<'_>,
    note_id: &str,
    document: &serde_json::Value,
) -> Result<(), StorageError> {
    let live = skriuw_domain::document_image_ids(document);
    let cover_image_id = transaction
        .query_row(
            "SELECT cover_image_id FROM workspace_nodes WHERE id = ?1",
            [note_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .map_err(backend)?;
    let stored = {
        let mut statement = transaction
            .prepare_cached("SELECT id FROM note_images WHERE note_id = ?1")
            .map_err(backend)?;
        statement
            .query_map([note_id], |row| row.get::<_, String>(0))
            .map_err(backend)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(backend)?
    };
    for id in stored {
        if !live.contains(&id) && cover_image_id.as_deref() != Some(id.as_str()) {
            transaction
                .execute("DELETE FROM note_images WHERE id = ?1", [&id])
                .map_err(backend)?;
        }
    }
    Ok(())
}

struct RankedSibling {
    id: String,
    rank: i64,
}

fn allocate_rank(
    transaction: &Transaction<'_>,
    node_id: &str,
    placement: &NodePlacement,
    rank_changes: &mut BTreeMap<String, NodeRankChange>,
) -> Result<i64, StorageError> {
    let (left, right) = placement_neighbors(transaction, node_id, placement)?;
    if let Some(rank) = rank_between(left, right) {
        return Ok(rank);
    }

    let siblings = load_active_siblings(transaction, node_id, &placement.parent_id)?;
    let insertion_index = match &placement.position {
        NodePosition::First => 0,
        NodePosition::Last => siblings.len(),
        NodePosition::Before { anchor_id } => siblings
            .iter()
            .position(|sibling| sibling.id == *anchor_id)
            .ok_or_else(|| StorageError::NotFound(anchor_id.clone()))?,
        NodePosition::After { anchor_id } => {
            siblings
                .iter()
                .position(|sibling| sibling.id == *anchor_id)
                .ok_or_else(|| StorageError::NotFound(anchor_id.clone()))?
                + 1
        }
    };

    let mut target_rank = None;
    for final_index in 0..=siblings.len() {
        let rank = i64::try_from(final_index + 1)
            .ok()
            .and_then(|position| position.checked_mul(NODE_RANK_GAP))
            .ok_or_else(|| StorageError::InvalidOperation("sibling rank range exhausted".into()))?;
        if final_index == insertion_index {
            target_rank = Some(rank);
            continue;
        }
        let sibling_index = if final_index < insertion_index {
            final_index
        } else {
            final_index - 1
        };
        let sibling = &siblings[sibling_index];
        if sibling.rank == rank {
            continue;
        }
        transaction
            .execute(
                "UPDATE workspace_nodes SET rank = ?2 WHERE id = ?1",
                params![sibling.id, rank],
            )
            .map_err(backend)?;
        record_rank_change(rank_changes, &sibling.id, &placement.parent_id, rank);
    }
    target_rank
        .ok_or_else(|| StorageError::InvalidOperation("node placement could not be ranked".into()))
}

fn placement_neighbors(
    transaction: &Transaction<'_>,
    node_id: &str,
    placement: &NodePlacement,
) -> Result<(Option<i64>, Option<i64>), StorageError> {
    match &placement.position {
        NodePosition::First => {
            let right = transaction
                .query_row(
                    "SELECT rank FROM workspace_nodes \
                     WHERE parent_id IS ?1 AND deleted_at IS NULL AND id <> ?2 \
                     ORDER BY rank, id LIMIT 1",
                    params![placement.parent_id, node_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(backend)?;
            Ok((None, right))
        }
        NodePosition::Last => {
            let left = transaction
                .query_row(
                    "SELECT rank FROM workspace_nodes \
                     WHERE parent_id IS ?1 AND deleted_at IS NULL AND id <> ?2 \
                     ORDER BY rank DESC, id DESC LIMIT 1",
                    params![placement.parent_id, node_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(backend)?;
            Ok((left, None))
        }
        NodePosition::Before { anchor_id } => {
            let anchor = require_placement_anchor(transaction, placement, anchor_id)?;
            let left = transaction
                .query_row(
                    "SELECT rank FROM workspace_nodes \
                     WHERE parent_id IS ?1 AND deleted_at IS NULL AND id <> ?2 \
                     AND (rank < ?3 OR (rank = ?3 AND id < ?4)) \
                     ORDER BY rank DESC, id DESC LIMIT 1",
                    params![placement.parent_id, node_id, anchor.rank, anchor.id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(backend)?;
            Ok((left, Some(anchor.rank)))
        }
        NodePosition::After { anchor_id } => {
            let anchor = require_placement_anchor(transaction, placement, anchor_id)?;
            let right = transaction
                .query_row(
                    "SELECT rank FROM workspace_nodes \
                     WHERE parent_id IS ?1 AND deleted_at IS NULL AND id <> ?2 \
                     AND (rank > ?3 OR (rank = ?3 AND id > ?4)) \
                     ORDER BY rank, id LIMIT 1",
                    params![placement.parent_id, node_id, anchor.rank, anchor.id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(backend)?;
            Ok((Some(anchor.rank), right))
        }
    }
}

fn require_placement_anchor(
    transaction: &Transaction<'_>,
    placement: &NodePlacement,
    anchor_id: &str,
) -> Result<RankedSibling, StorageError> {
    require_available_node(transaction, anchor_id)?;
    let (parent_id, rank) = transaction
        .query_row(
            "SELECT parent_id, rank FROM workspace_nodes WHERE id = ?1",
            [anchor_id],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, i64>(1)?)),
        )
        .map_err(backend)?;
    if parent_id != placement.parent_id {
        return Err(StorageError::InvalidOperation(format!(
            "anchor {anchor_id} is not a child of the requested parent"
        )));
    }
    Ok(RankedSibling {
        id: anchor_id.into(),
        rank,
    })
}

fn load_active_siblings(
    transaction: &Transaction<'_>,
    node_id: &str,
    parent_id: &Option<String>,
) -> Result<Vec<RankedSibling>, StorageError> {
    let mut statement = transaction
        .prepare_cached(
            "SELECT id, rank FROM workspace_nodes \
             WHERE parent_id IS ?1 AND deleted_at IS NULL AND id <> ?2 \
             ORDER BY rank, id",
        )
        .map_err(backend)?;
    statement
        .query_map(params![parent_id, node_id], |row| {
            Ok(RankedSibling {
                id: row.get(0)?,
                rank: row.get(1)?,
            })
        })
        .map_err(backend)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(backend)
}

fn rank_between(left: Option<i64>, right: Option<i64>) -> Option<i64> {
    match (left, right) {
        (None, None) => Some(NODE_RANK_GAP),
        (None, Some(right)) => right.checked_sub(NODE_RANK_GAP),
        (Some(left), None) => left.checked_add(NODE_RANK_GAP),
        (Some(left), Some(right)) => {
            let distance = i128::from(right) - i128::from(left);
            (distance > 1).then(|| {
                i64::try_from(i128::from(left) + distance / 2)
                    .expect("midpoint of two i64 ranks must fit i64")
            })
        }
    }
}

fn record_rank_change(
    rank_changes: &mut BTreeMap<String, NodeRankChange>,
    id: &str,
    parent_id: &Option<String>,
    rank: i64,
) {
    rank_changes.insert(
        id.into(),
        NodeRankChange {
            id: id.into(),
            parent_id: parent_id.clone(),
            rank,
        },
    );
}

fn require_parent_folder(
    transaction: &Transaction<'_>,
    parent_id: Option<&str>,
) -> Result<(), StorageError> {
    let Some(parent_id) = parent_id else {
        return Ok(());
    };
    let kind = transaction
        .query_row(
            "SELECT kind FROM workspace_nodes WHERE id = ?1",
            [parent_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(backend)?;
    match kind.as_deref() {
        Some("folder") if node_is_available(transaction, parent_id)? => Ok(()),
        Some("folder") => Err(StorageError::InvalidOperation(format!(
            "parent {parent_id} is unavailable"
        ))),
        Some(_) => Err(StorageError::InvalidOperation(format!(
            "parent {parent_id} is not a folder"
        ))),
        None => Err(StorageError::NotFound(parent_id.into())),
    }
}

fn require_acyclic_parent(
    transaction: &Transaction<'_>,
    id: &str,
    parent_id: Option<&str>,
) -> Result<(), StorageError> {
    let Some(parent_id) = parent_id else {
        return Ok(());
    };
    let creates_cycle = transaction
        .query_row(
            "WITH RECURSIVE descendants(id) AS (\
                 SELECT id FROM workspace_nodes WHERE parent_id = ?1 \
                 UNION ALL \
                 SELECT child.id FROM workspace_nodes child \
                 JOIN descendants parent ON child.parent_id = parent.id\
             ) \
             SELECT EXISTS(SELECT 1 FROM descendants WHERE id = ?2)",
            params![id, parent_id],
            |row| row.get::<_, bool>(0),
        )
        .map_err(backend)?;
    if creates_cycle {
        return Err(StorageError::InvalidOperation(format!(
            "moving {id} below {parent_id} would create a cycle"
        )));
    }
    Ok(())
}

fn require_note(transaction: &Transaction<'_>, id: &str) -> Result<(), StorageError> {
    match require_available_node(transaction, id)?.as_str() {
        "note" => Ok(()),
        _ => Err(StorageError::InvalidOperation(format!(
            "active entity {id} is not a note"
        ))),
    }
}

fn require_available_node(transaction: &Transaction<'_>, id: &str) -> Result<String, StorageError> {
    let kind = transaction
        .query_row(
            "SELECT kind FROM workspace_nodes WHERE id = ?1",
            [id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(backend)?;
    let kind = kind.ok_or_else(|| StorageError::NotFound(id.into()))?;
    if !node_is_available(transaction, id)? {
        return Err(StorageError::InvalidOperation(format!(
            "node {id} is unavailable"
        )));
    }
    Ok(kind)
}

pub(crate) fn node_is_available(connection: &Connection, id: &str) -> Result<bool, StorageError> {
    connection
        .query_row(
            "WITH RECURSIVE ancestors(id, parent_id, deleted_at) AS (\
                 SELECT id, parent_id, deleted_at FROM workspace_nodes WHERE id = ?1 \
                 UNION ALL \
                 SELECT parent.id, parent.parent_id, parent.deleted_at \
                 FROM workspace_nodes parent \
                 JOIN ancestors ON parent.id = ancestors.parent_id\
             ) \
             SELECT COUNT(*) > 0 AND COALESCE(MAX(deleted_at IS NOT NULL), 0) = 0 \
             FROM ancestors",
            [id],
            |row| row.get(0),
        )
        .map_err(backend)
}

pub(crate) fn node_kind(connection: &Connection, id: &str) -> Result<Option<String>, StorageError> {
    connection
        .query_row(
            "SELECT kind FROM workspace_nodes WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(backend)
}

fn require_directly_trashed(transaction: &Transaction<'_>, id: &str) -> Result<i64, StorageError> {
    transaction
        .query_row(
            "SELECT deleted_at FROM workspace_nodes WHERE id = ?1",
            [id],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(backend)?
        .ok_or_else(|| StorageError::NotFound(id.into()))?
        .ok_or_else(|| StorageError::InvalidOperation(format!("node {id} is not trashed")))
}

fn subtree_contains(
    connection: &Connection,
    root_id: &str,
    node_id: &str,
) -> Result<bool, StorageError> {
    connection
        .query_row(
            "WITH RECURSIVE subtree(id) AS (\
                 SELECT id FROM workspace_nodes WHERE id = ?1 \
                 UNION ALL \
                 SELECT child.id FROM workspace_nodes child \
                 JOIN subtree parent ON child.parent_id = parent.id\
             ) \
             SELECT EXISTS(SELECT 1 FROM subtree WHERE id = ?2)",
            params![root_id, node_id],
            |row| row.get(0),
        )
        .map_err(backend)
}

fn clear_active_note_in_subtree(
    transaction: &Transaction<'_>,
    root_id: &str,
) -> Result<(), StorageError> {
    let Some(active_note_id) = read_stored_active_note(transaction)? else {
        return Ok(());
    };
    if subtree_contains(transaction, root_id, &active_note_id)? {
        transaction
            .execute("DELETE FROM app_state WHERE key = 'active_note_id'", [])
            .map_err(backend)?;
    }
    Ok(())
}

pub(crate) fn require_changed(changed: usize, id: &str) -> Result<(), StorageError> {
    if changed == 0 {
        Err(StorageError::NotFound(id.into()))
    } else {
        Ok(())
    }
}

pub(crate) fn require_worker(worker_id: &str) -> Result<(), StorageError> {
    if worker_id.trim().is_empty() || worker_id.len() > 128 {
        Err(StorageError::InvalidOperation(
            "history worker id must contain 1 to 128 bytes".into(),
        ))
    } else {
        Ok(())
    }
}

fn current_revision(transaction: &Transaction<'_>, id: &str) -> Result<i64, StorageError> {
    transaction
        .query_row(
            "SELECT revision FROM documents WHERE note_id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(backend)?
        .ok_or_else(|| StorageError::NotFound(id.into()))
}

fn node_title(transaction: &Transaction<'_>, id: &str) -> Result<String, StorageError> {
    transaction
        .query_row(
            "SELECT title FROM workspace_nodes WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(backend)?
        .ok_or_else(|| StorageError::NotFound(id.into()))
}

pub(crate) fn replace_fts(
    transaction: &Transaction<'_>,
    note_id: &str,
    title: &str,
    markdown: &str,
) -> Result<(), StorageError> {
    transaction
        .execute("DELETE FROM documents_fts WHERE note_id = ?1", [note_id])
        .map_err(backend)?;
    insert_fts(transaction, note_id, title, markdown)
}

pub(crate) fn insert_fts(
    transaction: &Transaction<'_>,
    note_id: &str,
    title: &str,
    markdown: &str,
) -> Result<(), StorageError> {
    transaction
        .execute(
            "INSERT INTO documents_fts(note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params![note_id, title, markdown],
        )
        .map_err(backend)?;
    Ok(())
}

/// One history revision per editing burst: a save landing within this window
/// of a pending revision's first save updates that revision in place instead
/// of appending, and a pending revision only becomes claimable once the
/// window has elapsed. The document itself is still saved on every operation;
/// this only bounds how many restore points a burst of typing produces.
pub const HISTORY_COALESCE_WINDOW_MS: i64 = 120_000;

pub(crate) fn enqueue_history(
    transaction: &Transaction<'_>,
    note_id: &str,
    revision: i64,
    markdown: &str,
    created_at: i64,
) -> Result<(), StorageError> {
    let coalesced = transaction
        .execute(
            "UPDATE history_outbox SET revision = ?2, markdown = ?3 \
             WHERE id = (\
                 SELECT id FROM history_outbox \
                 WHERE note_id = ?1 AND claimed_by IS NULL AND created_at > ?4 \
                 ORDER BY created_at DESC, id DESC LIMIT 1\
             )",
            params![
                note_id,
                revision,
                markdown,
                created_at.saturating_sub(HISTORY_COALESCE_WINDOW_MS)
            ],
        )
        .map_err(backend)?;
    if coalesced > 0 {
        return Ok(());
    }
    transaction
        .execute(
            "INSERT INTO history_outbox(id, note_id, revision, markdown, created_at, next_attempt_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                Uuid::new_v4().to_string(),
                note_id,
                revision,
                markdown,
                created_at,
                created_at.saturating_add(HISTORY_COALESCE_WINDOW_MS)
            ],
        )
        .map_err(backend)?;
    Ok(())
}

pub(crate) use skriuw_domain::count_words;

pub(crate) fn fts_query(input: &str) -> String {
    input
        .split_whitespace()
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{}\"*", token.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}
