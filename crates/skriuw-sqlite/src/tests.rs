use std::{path::PathBuf, time::Instant};

use rusqlite::Connection;
use serde_json::json;
use skriuw_domain::{
    AnnotationComment, AnnotationStatus, ClientSyncOperation, HistoryHeader,
    NOTE_LOCK_CONFIGURE_ENTROPY_BYTES, NodeKind, NodePlacement, NoteLockKind, NoteProperty,
    NotePropertyColor, NotePropertyField, NotePropertyOption, NotePropertyTemplate,
    NotePropertyValue, OpenedFileState, ProviderImportReceipt, ReplicatedWorkspaceOperation,
    SyncAcceptedOperation, SyncConflictReason, SyncOperationPayload, TaskPriority, TaskSource,
    TaskSourceDocument, TaskStatus, VersionedNotePropertyValue, WorkspaceAnnotation,
    WorkspaceCheckpoint, WorkspaceImage, WorkspaceOperation, WorkspaceOperationEnvelope,
    WorkspacePerson, WorkspacePrompt, WorkspaceSettings, WorkspaceTag, WorkspaceTask,
};
use skriuw_storage::{
    ConfigureNoteLockRequest, Diagnostic, DiagnosticCategory, DiagnosticContext, HistoryCache,
    HistoryProvenance, HistoryQueue, MAX_DIAGNOSTIC_MESSAGE_BYTES, NewSyncConnection,
    NoteLockAccess, RemoteSyncApplyOutcome, SearchIndexMaintenance, StorageError, SyncRecovery,
    WorkspaceMaintenance, WorkspaceStorage, WorkspaceSyncQueue,
};
use tempfile::tempdir;

use super::{HISTORY_COALESCE_WINDOW_MS, SqliteWorkspace};
use crate::migration::{MIGRATIONS, checksum, table_columns};
use crate::queries::read_settings;

mod annotations;
mod backup;
mod documents;
mod maintenance;
mod media;
mod placement;
mod prompts;
mod properties;
mod search;
mod settings;
mod storage;
mod sync_apply;
mod sync_convergence;
mod sync_hydration;
mod sync_outbox;
mod sync_recovery;
mod tasks;
mod trash;

fn op(operation: WorkspaceOperation) -> WorkspaceOperationEnvelope {
    WorkspaceOperationEnvelope::v1(operation)
}

fn create_note(id: &str) -> WorkspaceOperationEnvelope {
    create_placed_note(id, NodePlacement::last(None), 1)
}

fn create_placed_note(id: &str, placement: NodePlacement, at: i64) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::CreateNote {
        id: id.into(),
        title: "Fast notes".into(),
        placement,
        document_json: json!({"type": "doc", "content": []}),
        markdown: "# Fast notes\n\nSQLite search".into(),
        at,
    })
}

fn save_document(
    note_id: &str,
    expected_revision: i64,
    markdown: &str,
    at: i64,
) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::SaveDocument {
        note_id: note_id.into(),
        document_json: json!({"type": "doc", "revision": expected_revision + 1}),
        markdown: markdown.into(),
        word_count: markdown.split_whitespace().count() as i64,
        expected_revision,
        at,
    })
}

fn custom_settings() -> WorkspaceSettings {
    let mut extensions = std::collections::BTreeMap::new();
    extensions.insert("futureFlag".into(), json!(true));
    WorkspaceSettings {
        theme: "paper".into(),
        compact_sidebar: true,
        extensions,
        ..WorkspaceSettings::default()
    }
}

fn connect(storage: &SqliteWorkspace) {
    connect_at_cursor(storage, 7);
}

fn connect_at_cursor(storage: &SqliteWorkspace, observed_server_sequence: u64) {
    storage
        .connect_sync(&NewSyncConnection {
            workspace_id: "workspace-1".into(),
            device_id: "device-1".into(),
            connected_at: 10,
            observed_server_sequence,
        })
        .expect("connect sync");
}

fn remote(
    operation_id: &str,
    device_id: &str,
    client_sequence: u64,
    server_sequence: u64,
    operation: WorkspaceOperation,
) -> ReplicatedWorkspaceOperation {
    ReplicatedWorkspaceOperation {
        operation_id: operation_id.into(),
        device_id: device_id.into(),
        client_sequence,
        base_server_sequence: 0,
        server_sequence,
        payload: SyncOperationPayload::inline(op(operation)),
    }
}

fn envelope_of(operation: &ClientSyncOperation) -> &WorkspaceOperationEnvelope {
    operation
        .payload
        .inline_operation()
        .expect("locally queued operations are inline")
}

fn accepted(batch: &skriuw_storage::PendingSyncBatch) -> Vec<SyncAcceptedOperation> {
    batch
        .request
        .operations
        .iter()
        .enumerate()
        .map(|(index, operation)| SyncAcceptedOperation {
            operation_id: operation.operation_id.clone(),
            client_sequence: operation.client_sequence,
            server_sequence: index as u64 + 8,
        })
        .collect()
}

#[derive(Debug, PartialEq, Eq)]
struct ReceivedRow {
    operation_id: String,
    server_sequence: i64,
    outcome: String,
    reason: Option<String>,
}

fn received_rows(storage: &SqliteWorkspace) -> Vec<ReceivedRow> {
    let connection = storage.lock().expect("database lock");
    let mut statement = connection
        .prepare(
            "SELECT operation_id, server_sequence, outcome, reason \
             FROM sync_received_operations ORDER BY server_sequence",
        )
        .expect("prepare received query");
    statement
        .query_map([], |row| {
            Ok(ReceivedRow {
                operation_id: row.get(0)?,
                server_sequence: row.get(1)?,
                outcome: row.get(2)?,
                reason: row.get(3)?,
            })
        })
        .expect("query received rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect received rows")
}

fn superseded_rows(storage: &SqliteWorkspace) -> Vec<(String, String)> {
    received_rows(storage)
        .into_iter()
        .filter(|row| row.outcome == "superseded")
        .map(|row| (row.operation_id, row.reason.expect("superseded reason")))
        .collect()
}

fn history_rows(storage: &SqliteWorkspace, note_id: &str) -> Vec<(i64, String, String)> {
    let connection = storage.lock().expect("database lock");
    let mut statement = connection
        .prepare(
            "SELECT revision, markdown, provenance FROM history_outbox \
             WHERE note_id = ?1 ORDER BY created_at, revision, provenance",
        )
        .expect("prepare history query");
    statement
        .query_map([note_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .expect("query history rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect history rows")
}

fn document_of(storage: &SqliteWorkspace, note_id: &str) -> skriuw_domain::WorkspaceDocument {
    storage
        .bootstrap()
        .expect("bootstrap")
        .documents
        .into_iter()
        .find(|document| document.note_id == note_id)
        .expect("document exists")
}

fn superseded(reason: SyncConflictReason) -> RemoteSyncApplyOutcome {
    RemoteSyncApplyOutcome::Superseded { reason }
}

/// Push every pending outbox row as if the server accepted it, assigning
/// server sequences from `first_server_sequence`. Returns the last assigned
/// sequence, or `first_server_sequence - 1` when nothing was pending.
fn push_all(storage: &SqliteWorkspace, first_server_sequence: u64) -> u64 {
    let mut next = first_server_sequence;
    while let Some(batch) = storage
        .claim_sync_operations("push-all", 1_000, 50, 64)
        .expect("claim pending batch")
    {
        let accepted = batch
            .request
            .operations
            .iter()
            .map(|operation| {
                let item = SyncAcceptedOperation {
                    operation_id: operation.operation_id.clone(),
                    client_sequence: operation.client_sequence,
                    server_sequence: next,
                };
                next += 1;
                item
            })
            .collect::<Vec<_>>();
        storage
            .acknowledge_sync_operations("push-all", &accepted)
            .expect("acknowledge pushed batch");
    }
    next - 1
}

fn text_property(note_id: &str, id: &str, position: i64) -> NoteProperty {
    NoteProperty {
        note_id: note_id.into(),
        field: NotePropertyField {
            id: id.into(),
            name: id.into(),
            value: VersionedNotePropertyValue::v1(NotePropertyValue::Text("value".into())),
            options: Vec::new(),
            position,
        },
    }
}

fn ordered_ids(storage: &SqliteWorkspace, parent_id: Option<&str>) -> Vec<String> {
    storage
        .bootstrap()
        .expect("bootstrap")
        .nodes
        .into_iter()
        .filter(|node| node.parent_id.as_deref() == parent_id && node.deleted_at.is_none())
        .map(|node| node.id)
        .collect()
}

fn seed_nested_workspace(storage: &SqliteWorkspace) {
    storage
        .apply_operations(&[
            op(WorkspaceOperation::CreateFolder {
                id: "folder-root".into(),
                title: "Root".into(),
                placement: NodePlacement::last(None),
                at: 1,
            }),
            op(WorkspaceOperation::CreateFolder {
                id: "folder-child".into(),
                title: "Child".into(),
                placement: NodePlacement::last(Some("folder-root".into())),
                at: 2,
            }),
            op(WorkspaceOperation::CreateNote {
                id: "note-nested".into(),
                title: "Nested".into(),
                placement: NodePlacement::last(Some("folder-child".into())),
                document_json: json!({"type": "doc", "content": []}),
                markdown: "nested search phrase".into(),
                at: 3,
            }),
            op(WorkspaceOperation::CreateNote {
                id: "note-outside".into(),
                title: "Outside".into(),
                placement: NodePlacement::last(None),
                document_json: json!({"type": "doc", "content": []}),
                markdown: "outside search phrase".into(),
                at: 4,
            }),
        ])
        .expect("seed nested workspace");
}

fn attach_image(id: &str, note_id: &str, hash_fill: char) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::AttachImage {
        image: skriuw_domain::WorkspaceImage {
            id: id.into(),
            note_id: note_id.into(),
            content_hash: hash_fill.to_string().repeat(64),
            mime_type: "image/png".into(),
            byte_size: 128,
            width: Some(16),
            height: Some(16),
            created_at: 2,
        },
    })
}

fn remote_folder(
    operation_id: &str,
    sequence: u64,
    id: &str,
    parent: Option<&str>,
) -> ReplicatedWorkspaceOperation {
    remote(
        operation_id,
        "device-remote",
        sequence,
        sequence,
        WorkspaceOperation::CreateFolder {
            id: id.into(),
            title: id.into(),
            placement: NodePlacement::last(parent.map(str::to_owned)),
            at: sequence as i64,
        },
    )
}

fn remote_note(
    operation_id: &str,
    sequence: u64,
    id: &str,
    parent: Option<&str>,
    markdown: &str,
) -> ReplicatedWorkspaceOperation {
    remote(
        operation_id,
        "device-remote",
        sequence,
        sequence,
        WorkspaceOperation::CreateNote {
            id: id.into(),
            title: id.into(),
            placement: NodePlacement::last(parent.map(str::to_owned)),
            document_json: json!({"type": "doc", "content": [markdown]}),
            markdown: markdown.into(),
            at: sequence as i64,
        },
    )
}

fn remote_move(
    operation_id: &str,
    sequence: u64,
    id: &str,
    parent: Option<&str>,
) -> ReplicatedWorkspaceOperation {
    remote(
        operation_id,
        "device-remote",
        sequence,
        sequence,
        WorkspaceOperation::MoveNode {
            id: id.into(),
            placement: NodePlacement::last(parent.map(str::to_owned)),
            at: sequence as i64,
        },
    )
}

fn remote_trash(operation_id: &str, sequence: u64, root_id: &str) -> ReplicatedWorkspaceOperation {
    remote(
        operation_id,
        "device-remote",
        sequence,
        sequence,
        WorkspaceOperation::TrashSubtree {
            root_id: root_id.into(),
            at: sequence as i64,
        },
    )
}

fn parent_of(storage: &SqliteWorkspace, id: &str) -> Option<String> {
    storage
        .bootstrap()
        .expect("bootstrap")
        .nodes
        .into_iter()
        .find(|node| node.id == id)
        .expect("node exists")
        .parent_id
}

fn connected_fresh() -> SqliteWorkspace {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect_at_cursor(&storage, 0);
    storage
}

fn folder(id: &str, title: &str, at: i64) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::CreateFolder {
        id: id.into(),
        title: title.into(),
        placement: NodePlacement::last(None),
        at,
    })
}

fn block_middle_of_three(storage: &SqliteWorkspace) -> String {
    storage
        .apply_operations(&[
            folder("folder-1", "First", 11),
            folder("folder-2", "Second", 12),
            folder("folder-3", "Third", 13),
        ])
        .expect("queue three operations");
    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending batch");
    let middle_id = batch.request.operations[1].operation_id.clone();
    storage
        .block_claimed_sync_operations("sync-worker", &[middle_id], "asset_content_missing")
        .expect("block the middle operation");
    let view = storage.sync_recovery_view().expect("recovery view");
    assert_eq!(view.blocked.len(), 1);
    view.blocked[0].blocked_id.clone()
}
