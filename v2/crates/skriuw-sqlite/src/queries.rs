use std::collections::{BTreeMap, BTreeSet};

use rusqlite::{Connection, OptionalExtension, Transaction};
use skriuw_domain::{
    HistoryHeader, NodeKind, WORKSPACE_PROTOCOL_VERSION, WorkspaceArchive, WorkspaceDocument,
    WorkspaceNode, WorkspacePerson, WorkspaceSettings, WorkspaceSnapshot, WorkspaceTag,
};
use skriuw_storage::StorageError;

use crate::error::{backend, json_backend, validation};
use crate::operations::{node_is_available, node_kind};

pub(crate) fn read_snapshot(connection: &Connection) -> Result<WorkspaceSnapshot, StorageError> {
    Ok(WorkspaceSnapshot {
        protocol_version: WORKSPACE_PROTOCOL_VERSION,
        active_note_id: read_active_note(connection)?,
        nodes: read_nodes(connection)?,
        documents: read_documents(connection)?,
        history_headers: read_history_headers(connection)?,
        settings: read_settings(connection)?,
        tags: read_tags(connection)?,
        people: read_people(connection)?,
        references: read_references(connection)?,
    })
}

pub(crate) fn read_tags(connection: &Connection) -> Result<Vec<WorkspaceTag>, StorageError> {
    let mut statement = connection
        .prepare(
            "SELECT id, name, color, created_at, updated_at, created_in \
             FROM workspace_tags ORDER BY name, id",
        )
        .map_err(backend)?;
    statement
        .query_map([], |row| {
            Ok(WorkspaceTag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                created_in: row.get(5)?,
            })
        })
        .map_err(backend)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(backend)
}

pub(crate) fn read_people(connection: &Connection) -> Result<Vec<WorkspacePerson>, StorageError> {
    let mut statement = connection
        .prepare(
            "SELECT id, name, initials, color, note, created_at, updated_at, created_in \
             FROM workspace_people ORDER BY name, id",
        )
        .map_err(backend)?;
    statement
        .query_map([], |row| {
            Ok(WorkspacePerson {
                id: row.get(0)?,
                name: row.get(1)?,
                initials: row.get(2)?,
                color: row.get(3)?,
                note: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                created_in: row.get(7)?,
            })
        })
        .map_err(backend)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(backend)
}

pub(crate) fn read_references(
    connection: &Connection,
) -> Result<Vec<skriuw_domain::NoteReferences>, StorageError> {
    let mut statement = connection.prepare("SELECT source_note_id, kind, target_id FROM document_references ORDER BY source_note_id, kind, target_id").map_err(backend)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(backend)?;
    let mut grouped = BTreeMap::<String, Vec<skriuw_domain::DocumentReference>>::new();
    for row in rows {
        let (note_id, kind, target_id) = row.map_err(backend)?;
        let kind = match kind.as_str() {
            "tag" => skriuw_domain::ReferenceKind::Tag,
            "person" => skriuw_domain::ReferenceKind::Person,
            "note" => skriuw_domain::ReferenceKind::Note,
            _ => return Err(StorageError::Backend("invalid reference kind".into())),
        };
        grouped
            .entry(note_id)
            .or_default()
            .push(skriuw_domain::DocumentReference { kind, target_id });
    }
    Ok(grouped
        .into_iter()
        .map(|(note_id, targets)| skriuw_domain::NoteReferences { note_id, targets })
        .collect())
}

pub(crate) fn read_sidebar_expansion(
    connection: &Connection,
) -> Result<Option<Vec<String>>, StorageError> {
    let raw = connection
        .query_row(
            "SELECT value_json FROM app_state WHERE key = 'sidebar_expanded_folder_ids'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(backend)?;
    let Some(raw) = raw else {
        return Ok(None);
    };
    let stored = serde_json::from_str::<Vec<String>>(&raw).map_err(json_backend)?;
    let mut retained = BTreeSet::new();
    let mut statement = connection
        .prepare_cached("SELECT kind FROM workspace_nodes WHERE id = ?1")
        .map_err(backend)?;
    for id in stored {
        let kind = statement
            .query_row([&id], |row| row.get::<_, String>(0))
            .optional()
            .map_err(backend)?;
        if kind.as_deref() == Some("folder") {
            retained.insert(id);
        }
    }
    Ok(Some(retained.into_iter().collect()))
}

pub(crate) fn write_sidebar_expansion(
    transaction: &Transaction<'_>,
    folder_ids: &[String],
) -> Result<(), StorageError> {
    let mut retained = BTreeSet::new();
    let mut statement = transaction
        .prepare_cached("SELECT kind FROM workspace_nodes WHERE id = ?1")
        .map_err(backend)?;
    for id in folder_ids {
        let kind = statement
            .query_row([id], |row| row.get::<_, String>(0))
            .optional()
            .map_err(backend)?;
        if kind.as_deref() == Some("folder") {
            retained.insert(id);
        }
    }
    transaction
        .execute(
            "INSERT INTO app_state(key, value_json) \
             VALUES ('sidebar_expanded_folder_ids', ?1) \
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
            [
                serde_json::to_string(&retained.into_iter().collect::<Vec<_>>())
                    .map_err(json_backend)?,
            ],
        )
        .map_err(backend)?;
    Ok(())
}

pub(crate) fn read_pane_layout(connection: &Connection) -> Result<Option<String>, StorageError> {
    connection
        .query_row(
            "SELECT value_json FROM app_state WHERE key = 'workspace_ui_panes'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(backend)
}

pub(crate) fn write_pane_layout(
    transaction: &Transaction<'_>,
    layout_json: &str,
) -> Result<(), StorageError> {
    serde_json::from_str::<serde_json::Value>(layout_json).map_err(|error| {
        StorageError::InvalidOperation(format!("pane layout is not valid JSON: {error}"))
    })?;
    transaction
        .execute(
            "INSERT INTO app_state(key, value_json) VALUES ('workspace_ui_panes', ?1) \
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
            [layout_json],
        )
        .map_err(backend)?;
    Ok(())
}

pub(crate) fn read_nodes(connection: &Connection) -> Result<Vec<WorkspaceNode>, StorageError> {
    let mut statement = connection
        .prepare_cached(
            "SELECT id, kind, parent_id, rank, title, icon, created_at, updated_at, deleted_at, \
             pinned_at \
             FROM workspace_nodes ORDER BY parent_id, rank, id",
        )
        .map_err(backend)?;
    let rows = statement
        .query_map([], |row| {
            let kind = match row.get::<_, String>(1)?.as_str() {
                "note" => NodeKind::Note,
                "folder" => NodeKind::Folder,
                other => {
                    return Err(rusqlite::Error::FromSqlConversionFailure(
                        1,
                        rusqlite::types::Type::Text,
                        format!("unknown node kind {other}").into(),
                    ));
                }
            };
            Ok(WorkspaceNode {
                id: row.get(0)?,
                kind,
                parent_id: row.get(2)?,
                rank: row.get(3)?,
                title: row.get(4)?,
                icon: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                deleted_at: row.get(8)?,
                pinned_at: row.get(9)?,
            })
        })
        .map_err(backend)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(backend)
}

pub(crate) fn read_documents(
    connection: &Connection,
) -> Result<Vec<WorkspaceDocument>, StorageError> {
    let mut statement = connection
        .prepare_cached(
            "SELECT note_id, document_json, markdown, revision, word_count \
             FROM documents ORDER BY note_id",
        )
        .map_err(backend)?;
    let rows = statement
        .query_map([], |row| {
            let raw = row.get::<_, String>(1)?;
            let document_json = serde_json::from_str(&raw).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    1,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(WorkspaceDocument {
                note_id: row.get(0)?,
                document_json,
                markdown: row.get(2)?,
                revision: row.get(3)?,
                word_count: row.get(4)?,
            })
        })
        .map_err(backend)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(backend)
}

pub(crate) fn read_history_headers(
    connection: &Connection,
) -> Result<Vec<HistoryHeader>, StorageError> {
    let mut statement = connection
        .prepare_cached(
            "SELECT history_cache.note_id, version_id, created_at, summary \
             FROM history_cache \
             WHERE NOT EXISTS (\
                 WITH RECURSIVE ancestors(id, parent_id, deleted_at) AS (\
                     SELECT id, parent_id, deleted_at FROM workspace_nodes \
                     WHERE id = history_cache.note_id \
                     UNION ALL \
                     SELECT parent.id, parent.parent_id, parent.deleted_at \
                     FROM workspace_nodes parent \
                     JOIN ancestors ON parent.id = ancestors.parent_id\
                 ) \
                 SELECT 1 FROM ancestors WHERE deleted_at IS NOT NULL\
             ) \
             ORDER BY history_cache.note_id, created_at DESC",
        )
        .map_err(backend)?;
    let rows = statement
        .query_map([], |row| {
            Ok(HistoryHeader {
                note_id: row.get(0)?,
                version_id: row.get(1)?,
                created_at: row.get(2)?,
                summary: row.get(3)?,
            })
        })
        .map_err(backend)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(backend)
}

pub(crate) fn read_settings(connection: &Connection) -> Result<WorkspaceSettings, StorageError> {
    let raw = connection
        .query_row(
            "SELECT value_json FROM app_state WHERE key = 'settings'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(backend)?;
    let settings = match raw {
        Some(raw) => serde_json::from_str::<WorkspaceSettings>(&raw).map_err(json_backend)?,
        None => WorkspaceSettings::default(),
    };
    settings.validate().map_err(validation)?;
    Ok(settings)
}

pub(crate) fn read_active_note(connection: &Connection) -> Result<Option<String>, StorageError> {
    let active_note_id = read_stored_active_note(connection)?;
    match active_note_id {
        Some(note_id)
            if node_is_available(connection, &note_id)?
                && node_kind(connection, &note_id)?.as_deref() == Some("note") =>
        {
            Ok(Some(note_id))
        }
        _ => Ok(None),
    }
}

pub(crate) fn read_stored_active_note(
    connection: &Connection,
) -> Result<Option<String>, StorageError> {
    connection
        .query_row(
            "SELECT value_json FROM app_state WHERE key = 'active_note_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(backend)?
        .map(|raw| serde_json::from_str::<Option<String>>(&raw).map_err(json_backend))
        .transpose()
        .map(Option::flatten)
}

pub(crate) fn read_archive(
    connection: &Connection,
    exported_at: i64,
) -> Result<WorkspaceArchive, StorageError> {
    Ok(WorkspaceArchive {
        archive_version: skriuw_domain::WORKSPACE_ARCHIVE_VERSION,
        protocol_version: WORKSPACE_PROTOCOL_VERSION,
        exported_at,
        active_note_id: read_active_note(connection)?,
        nodes: read_nodes(connection)?,
        documents: read_documents(connection)?,
        settings: read_settings(connection)?,
        tags: read_tags(connection)?,
        people: read_people(connection)?,
    })
}
