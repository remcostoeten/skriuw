use std::{path::PathBuf, time::Instant};

use rusqlite::Connection;
use serde_json::json;
use skriuw_domain::{
    ClientSyncOperation, HistoryHeader, NodePlacement, NoteProperty, NotePropertyColor,
    NotePropertyField, NotePropertyOption, NotePropertyTemplate, NotePropertyValue,
    ProviderImportReceipt, ReplicatedWorkspaceOperation, SyncAcceptedOperation,
    SyncOperationPayload, TaskPriority, TaskSource, TaskSourceDocument, TaskStatus,
    VersionedNotePropertyValue, WorkspaceCheckpoint, WorkspaceImage, WorkspaceOperation,
    WorkspaceOperationEnvelope, WorkspacePerson, WorkspacePrompt, WorkspaceSettings, WorkspaceTag,
    WorkspaceTask,
};
use skriuw_storage::{
    Diagnostic, DiagnosticCategory, DiagnosticContext, HistoryCache, HistoryQueue,
    MAX_DIAGNOSTIC_MESSAGE_BYTES, NewSyncConnection, RemoteSyncApplyOutcome, StorageError,
    SyncRecovery, WorkspaceMaintenance, WorkspaceStorage, WorkspaceSyncQueue,
};
use tempfile::tempdir;

use super::{HISTORY_COALESCE_WINDOW_MS, SqliteWorkspace};
use crate::migration::{MIGRATIONS, checksum, table_columns};
use crate::queries::read_settings;

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

#[test]
fn creates_bootstraps_and_searches() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.nodes.len(), 1);
    assert_eq!(snapshot.documents[0].revision, 1);
    assert_eq!(snapshot.documents[0].word_count, 4);

    let hits = storage.search("SQLite", 10).expect("search");
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].note_id, "note-1");
}

#[test]
fn local_only_operations_never_create_sync_work() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-local")])
        .expect("local create");

    assert_eq!(storage.sync_connection().expect("connection"), None);
    assert_eq!(
        storage
            .claim_sync_operations("sync-worker", 100, 50, 64)
            .expect("claim"),
        None
    );
    assert!(
        storage
            .blocked_sync_operations()
            .expect("blocked")
            .is_empty()
    );
}

#[test]
fn first_connection_queues_the_existing_workspace_for_initial_upload() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-before-sync")])
        .expect("create local note");

    connect_at_cursor(&storage, 0);

    let batch = storage
        .claim_sync_operations("initial-upload", 100, 50, 64)
        .expect("claim initial upload")
        .expect("existing note was queued");
    assert_eq!(batch.request.operations.len(), 1);
    assert_eq!(
        envelope_of(&batch.request.operations[0])
            .operation
            .sync_policy()
            .operation_type,
        "create_note"
    );
    assert_eq!(batch.request.operations[0].client_sequence, 1);
}

#[test]
fn first_connection_seeds_pre_existing_images_after_their_notes() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_note("note-illustrated"),
            create_note("note-plain"),
            attach_image("image-1", "note-illustrated", 'a'),
        ])
        .expect("create local notes with an image");

    connect_at_cursor(&storage, 0);

    let batch = storage
        .claim_sync_operations("initial-upload", 100, 50, 64)
        .expect("claim initial upload")
        .expect("existing workspace was queued");
    let operation_types = batch
        .request
        .operations
        .iter()
        .map(|operation| {
            envelope_of(operation)
                .operation
                .sync_policy()
                .operation_type
        })
        .collect::<Vec<_>>();
    assert_eq!(
        operation_types,
        vec!["create_note", "create_note", "attach_image"],
        "image attachments must be queued after the notes they depend on"
    );
    let attach = envelope_of(&batch.request.operations[2]);
    match &attach.operation {
        WorkspaceOperation::AttachImage { image } => {
            assert_eq!(image.id, "image-1");
            assert_eq!(image.note_id, "note-illustrated");
        }
        other => panic!("expected attach_image, found {other:?}"),
    }
    assert!(
        batch.request.operations[2].payload.assets().is_empty(),
        "queued image operations stay asset-less until push time"
    );
}

#[test]
fn blocking_claimed_operations_keeps_the_queue_contiguous() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect(&storage);
    storage
        .apply_operations(&[
            op(WorkspaceOperation::CreateFolder {
                id: "folder-1".into(),
                title: "First".into(),
                placement: NodePlacement::last(None),
                at: 11,
            }),
            op(WorkspaceOperation::CreateFolder {
                id: "folder-2".into(),
                title: "Second".into(),
                placement: NodePlacement::last(None),
                at: 12,
            }),
            op(WorkspaceOperation::RenameNode {
                id: "folder-1".into(),
                title: "Renamed".into(),
                at: 13,
            }),
        ])
        .expect("queue three operations");
    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending batch");
    assert_eq!(batch.request.operations.len(), 3);
    let middle_id = batch.request.operations[1].operation_id.clone();

    storage
        .block_claimed_sync_operations("sync-worker", &[middle_id], "asset_content_missing")
        .expect("block the middle operation");

    let blocked = storage.blocked_sync_operations().expect("blocked");
    assert_eq!(blocked.len(), 1);
    assert_eq!(blocked[0].reason_code, "asset_content_missing");
    assert_eq!(blocked[0].operation_type, "create_folder");
    let connection = storage
        .sync_connection()
        .expect("connection")
        .expect("active connection");
    assert_eq!(connection.next_client_sequence, 3);
    let batch = storage
        .claim_sync_operations("sync-worker", 200, 50, 64)
        .expect("reclaim")
        .expect("remaining operations stay claimable");
    assert_eq!(
        batch
            .request
            .operations
            .iter()
            .map(|operation| operation.client_sequence)
            .collect::<Vec<_>>(),
        vec![1, 2],
        "remaining operations must be renumbered contiguously"
    );
    assert_eq!(
        batch
            .request
            .operations
            .iter()
            .map(|operation| {
                envelope_of(operation)
                    .operation
                    .sync_policy()
                    .operation_type
            })
            .collect::<Vec<_>>(),
        vec!["create_folder", "rename_node"]
    );
    storage
        .acknowledge_sync_operations(
            "sync-worker",
            &[
                SyncAcceptedOperation {
                    operation_id: batch.request.operations[0].operation_id.clone(),
                    client_sequence: 1,
                    server_sequence: 8,
                },
                SyncAcceptedOperation {
                    operation_id: batch.request.operations[1].operation_id.clone(),
                    client_sequence: 2,
                    server_sequence: 9,
                },
            ],
        )
        .expect("renumbered batch acknowledges cleanly");
}

#[test]
fn blocking_rejects_operations_outside_the_claimed_batch() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect(&storage);
    storage
        .apply_operations(&[op(WorkspaceOperation::CreateFolder {
            id: "folder-1".into(),
            title: "First".into(),
            placement: NodePlacement::last(None),
            at: 11,
        })])
        .expect("queue one operation");

    storage
        .block_claimed_sync_operations(
            "sync-worker",
            &["unclaimed-operation".into()],
            "asset_content_missing",
        )
        .expect_err("blocking requires a claimed operation");
    storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending batch");
    storage
        .block_claimed_sync_operations("sync-worker", &["still-unclaimed".into()], "made_up_reason")
        .expect_err("unknown reasons are rejected");
}

#[test]
fn connected_transaction_enqueues_only_replicated_operations_in_order() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect(&storage);
    storage
        .apply_operations(&[
            op(WorkspaceOperation::CreateFolder {
                id: "folder-1".into(),
                title: "Folder".into(),
                placement: NodePlacement::last(None),
                at: 11,
            }),
            op(WorkspaceOperation::UpdateSettings {
                settings: custom_settings(),
            }),
            op(WorkspaceOperation::RenameNode {
                id: "folder-1".into(),
                title: "Renamed".into(),
                at: 12,
            }),
        ])
        .expect("connected operation group");

    let connection = storage
        .sync_connection()
        .expect("connection")
        .expect("active connection");
    assert_eq!(connection.next_client_sequence, 3);
    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending batch");
    assert_eq!(batch.workspace_id, "workspace-1");
    assert_eq!(batch.request.device_id, "device-1");
    assert_eq!(
        batch
            .request
            .operations
            .iter()
            .map(|operation| operation.client_sequence)
            .collect::<Vec<_>>(),
        vec![1, 2]
    );
    assert!(
        batch
            .request
            .operations
            .iter()
            .all(|operation| operation.base_server_sequence == 7)
    );
    assert_eq!(
        envelope_of(&batch.request.operations[0])
            .operation
            .sync_policy()
            .operation_type,
        "create_folder"
    );
    assert_eq!(
        envelope_of(&batch.request.operations[1])
            .operation
            .sync_policy()
            .operation_type,
        "rename_node"
    );
}

#[test]
fn sync_outbox_survives_restart_and_acknowledgement_loss() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("sync-restart.db");
    let first_operation_id = {
        let storage = SqliteWorkspace::open(&path).expect("open database");
        connect(&storage);
        storage
            .apply_operations(&[op(WorkspaceOperation::CreateFolder {
                id: "folder-restart".into(),
                title: "Restart".into(),
                placement: NodePlacement::last(None),
                at: 11,
            })])
            .expect("commit local operation");
        storage
            .claim_sync_operations("worker-before-crash", 100, 50, 64)
            .expect("claim before crash")
            .expect("pending before crash")
            .request
            .operations[0]
            .operation_id
            .clone()
    };

    let storage = SqliteWorkspace::open(&path).expect("reopen database");
    assert_eq!(
        storage
            .claim_sync_operations("worker-after-crash", 120, 50, 64)
            .expect("unexpired claim"),
        None
    );
    let retry = storage
        .claim_sync_operations("worker-after-crash", 151, 50, 64)
        .expect("retry claim")
        .expect("expired lease is retryable");
    assert_eq!(retry.request.operations[0].operation_id, first_operation_id);
    let acknowledgement = accepted(&retry);
    storage
        .acknowledge_sync_operations("worker-after-crash", &acknowledgement)
        .expect("acknowledge retry");
    assert_eq!(
        storage
            .claim_sync_operations("worker-after-ack", 1_000, 50, 64)
            .expect("empty after ack"),
        None
    );
}

#[test]
fn retry_and_partial_acknowledgement_failures_are_atomic() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect(&storage);
    storage
        .apply_operations(&[
            op(WorkspaceOperation::CreateFolder {
                id: "folder-a".into(),
                title: "A".into(),
                placement: NodePlacement::last(None),
                at: 11,
            }),
            op(WorkspaceOperation::CreateFolder {
                id: "folder-b".into(),
                title: "B".into(),
                placement: NodePlacement::last(None),
                at: 12,
            }),
        ])
        .expect("create folders");
    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("batch");
    let ids = batch
        .request
        .operations
        .iter()
        .map(|operation| operation.operation_id.clone())
        .collect::<Vec<_>>();
    let diagnostic = Diagnostic::new(
        DiagnosticContext::Sync,
        DiagnosticCategory::Unavailable,
        "cloud unavailable",
    );
    storage
        .release_sync_operations("sync-worker", &ids, 200, &diagnostic)
        .expect("release for retry");
    assert_eq!(
        storage
            .claim_sync_operations("retry-worker", 199, 50, 64)
            .expect("before retry"),
        None
    );
    let retry = storage
        .claim_sync_operations("retry-worker", 200, 50, 64)
        .expect("retry")
        .expect("retry batch");
    assert_eq!(
        retry
            .request
            .operations
            .iter()
            .map(|operation| operation.operation_id.clone())
            .collect::<Vec<_>>(),
        ids
    );

    let mut acknowledgement = accepted(&retry);
    assert!(matches!(
        storage.acknowledge_sync_operations("retry-worker", &acknowledgement[..1]),
        Err(StorageError::InvalidOperation(_))
    ));
    acknowledgement[1].operation_id = "wrong-operation".into();
    assert!(matches!(
        storage.acknowledge_sync_operations("retry-worker", &acknowledgement),
        Err(StorageError::InvalidOperation(_))
    ));
    let reclaimed = storage
        .claim_sync_operations("reclaim-worker", 251, 50, 64)
        .expect("reclaim")
        .expect("atomic ack rollback preserved both rows");
    assert_eq!(reclaimed.request.operations.len(), 2);
}

#[test]
fn failed_operation_batch_rolls_back_its_sync_rows() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect(&storage);
    let results = storage
        .apply_operation_batches(&[
            vec![op(WorkspaceOperation::CreateFolder {
                id: "folder-valid".into(),
                title: "Valid".into(),
                placement: NodePlacement::last(None),
                at: 11,
            })],
            vec![op(WorkspaceOperation::RenameNode {
                id: "missing".into(),
                title: "Missing".into(),
                at: 12,
            })],
        ])
        .expect("batch transaction");
    assert!(results[0].is_ok());
    assert!(results[1].is_err());

    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("one queued operation");
    assert_eq!(batch.request.operations.len(), 1);
    assert_eq!(batch.request.operations[0].client_sequence, 1);
    assert_eq!(
        storage
            .sync_connection()
            .expect("connection")
            .expect("active")
            .next_client_sequence,
        2
    );
}

#[test]
fn connected_workspace_rejects_archive_replacement_without_mutation() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-before-connect")])
        .expect("seed workspace");
    let archive = storage.export_archive(20).expect("export archive");
    connect(&storage);
    storage
        .apply_operations(&[op(WorkspaceOperation::RenameNode {
            id: "note-before-connect".into(),
            title: "Pending rename".into(),
            at: 21,
        })])
        .expect("create pending sync work");

    assert!(matches!(
        storage.replace_from_archive(&archive),
        Err(StorageError::InvalidOperation(_))
    ));
    assert_eq!(
        storage.bootstrap().expect("bootstrap").nodes[0].id,
        "note-before-connect"
    );
    assert!(storage.sync_connection().expect("connection").is_some());

    storage.disconnect_sync(30).expect("disconnect");
    storage
        .replace_from_archive(&archive)
        .expect("disconnected replacement resets sync state");
    assert_eq!(storage.sync_connection().expect("connection"), None);
    assert_eq!(
        storage
            .claim_sync_operations("sync-worker", 100, 50, 64)
            .expect("claim after replacement"),
        None
    );
}

#[test]
fn disconnect_preserves_pending_work_and_media_enqueues_for_replication() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect(&storage);
    storage
        .apply_operations(&[create_note("note-media")])
        .expect("create note");
    storage
        .apply_operations(&[op(WorkspaceOperation::AttachImage {
            image: WorkspaceImage {
                id: "image-1".into(),
                note_id: "note-media".into(),
                content_hash: "a".repeat(64),
                mime_type: "image/png".into(),
                byte_size: 1,
                width: Some(1),
                height: Some(1),
                created_at: 12,
            },
        })])
        .expect("local image metadata remains valid");
    assert_eq!(
        storage
            .blocked_sync_operations()
            .expect("blocked operations")
            .len(),
        0,
        "attach_image replicates through the asset transport instead of blocking"
    );

    storage.disconnect_sync(20).expect("disconnect");
    assert_eq!(storage.sync_connection().expect("connection"), None);
    assert_eq!(
        storage
            .claim_sync_operations("sync-worker", 100, 50, 64)
            .expect("claim while disconnected"),
        None
    );
    storage
        .connect_sync(&NewSyncConnection {
            workspace_id: "workspace-1".into(),
            device_id: "device-1".into(),
            connected_at: 30,
            observed_server_sequence: 7,
        })
        .expect("reconnect");
    let pending = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim after reconnect")
        .expect("pending work survived disconnect");
    assert_eq!(pending.request.operations.len(), 2);
    assert_eq!(
        envelope_of(&pending.request.operations[0])
            .operation
            .sync_policy()
            .operation_type,
        "create_note"
    );
    assert_eq!(
        envelope_of(&pending.request.operations[1])
            .operation
            .sync_policy()
            .operation_type,
        "attach_image"
    );
}

#[test]
fn oversized_replicated_edit_queues_for_chunked_transport_without_a_sequence_gap() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect(&storage);
    storage
        .apply_operations(&[create_note("note-large")])
        .expect("create note");
    let large_markdown = "x".repeat(skriuw_domain::MAX_INLINE_SYNC_OPERATION_BYTES);
    storage
        .apply_operations(&[save_document("note-large", 1, &large_markdown, 12)])
        .expect("oversized edit remains locally durable");
    storage
        .apply_operations(&[op(WorkspaceOperation::RenameNode {
            id: "note-large".into(),
            title: "Still local".into(),
            at: 13,
        })])
        .expect("later replicated operation");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.documents[0].revision, 2);
    assert_eq!(snapshot.documents[0].markdown.len(), large_markdown.len());
    assert_eq!(
        storage
            .blocked_sync_operations()
            .expect("blocked operations")
            .len(),
        0
    );

    let mut claimed = Vec::new();
    for server_sequence in 1..=3u64 {
        let batch = storage
            .claim_sync_operations("sync-worker", 100, 50, 64)
            .expect("claim")
            .expect("uploadable operations");
        assert_eq!(batch.request.operations.len(), 1);
        let operation = &batch.request.operations[0];
        claimed.push((
            operation.client_sequence,
            envelope_of(operation)
                .operation
                .sync_policy()
                .operation_type,
            operation.exceeds_inline_ceiling(),
        ));
        storage
            .acknowledge_sync_operations(
                "sync-worker",
                &[SyncAcceptedOperation {
                    operation_id: operation.operation_id.clone(),
                    client_sequence: operation.client_sequence,
                    server_sequence,
                }],
            )
            .expect("acknowledge");
    }

    assert_eq!(
        claimed,
        vec![
            (1, "create_note", false),
            (2, "save_document", true),
            (3, "rename_node", false),
        ],
        "the oversized edit is claimed alone so the transport can externalize it"
    );
}

#[test]
fn applies_remote_operations_in_server_order_without_reenqueueing() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect_at_cursor(&storage, 0);
    let operations = vec![
        remote(
            "remote-1",
            "device-remote",
            1,
            1,
            WorkspaceOperation::CreateFolder {
                id: "folder-remote".into(),
                title: "Remote".into(),
                placement: NodePlacement::last(None),
                at: 11,
            },
        ),
        remote(
            "remote-2",
            "device-remote",
            2,
            2,
            WorkspaceOperation::RenameNode {
                id: "folder-remote".into(),
                title: "Remote renamed".into(),
                at: 12,
            },
        ),
    ];

    let outcomes = storage
        .apply_remote_operations(&operations, 20)
        .expect("apply remote operations");
    assert!(
        outcomes
            .iter()
            .all(|outcome| matches!(outcome, RemoteSyncApplyOutcome::Applied(_)))
    );
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.nodes[0].title, "Remote renamed");
    assert_eq!(
        storage
            .sync_connection()
            .expect("connection")
            .expect("active")
            .observed_server_sequence,
        2
    );
    assert_eq!(
        storage
            .claim_sync_operations("sync-worker", 100, 50, 64)
            .expect("claim"),
        None
    );
}

#[test]
fn duplicate_remote_delivery_is_idempotent_across_restart() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("remote-idempotency.db");
    let operation = remote(
        "remote-restart",
        "device-remote",
        1,
        1,
        WorkspaceOperation::CreateFolder {
            id: "folder-restart-remote".into(),
            title: "Remote".into(),
            placement: NodePlacement::last(None),
            at: 11,
        },
    );
    {
        let storage = SqliteWorkspace::open(&path).expect("open database");
        connect_at_cursor(&storage, 0);
        assert!(matches!(
            storage
                .apply_remote_operations(std::slice::from_ref(&operation), 20)
                .expect("first apply")[0],
            RemoteSyncApplyOutcome::Applied(_)
        ));
    }

    let storage = SqliteWorkspace::open(&path).expect("reopen database");
    assert_eq!(
        storage
            .apply_remote_operations(std::slice::from_ref(&operation), 30)
            .expect("duplicate apply"),
        vec![RemoteSyncApplyOutcome::Duplicate]
    );
    assert_eq!(storage.bootstrap().expect("bootstrap").nodes.len(), 1);

    let mut conflicting_duplicate = operation;
    if let SyncOperationPayload::Inline {
        operation:
            WorkspaceOperationEnvelope {
                operation: WorkspaceOperation::CreateFolder { title, .. },
                ..
            },
        ..
    } = &mut conflicting_duplicate.payload
    {
        *title = "Conflicting".into();
    }
    assert!(matches!(
        storage.apply_remote_operations(&[conflicting_duplicate], 31),
        Err(StorageError::InvalidOperation(_))
    ));
    assert!(storage.sync_conflicts().expect("conflicts").is_empty());
}

#[test]
fn remote_sequence_gap_rolls_back_the_complete_pull_batch() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect_at_cursor(&storage, 0);
    let first = remote(
        "remote-gap-1",
        "device-remote",
        1,
        1,
        WorkspaceOperation::CreateFolder {
            id: "folder-gap-1".into(),
            title: "One".into(),
            placement: NodePlacement::last(None),
            at: 11,
        },
    );
    let third = remote(
        "remote-gap-3",
        "device-remote",
        3,
        3,
        WorkspaceOperation::CreateFolder {
            id: "folder-gap-3".into(),
            title: "Three".into(),
            placement: NodePlacement::last(None),
            at: 13,
        },
    );

    assert!(matches!(
        storage.apply_remote_operations(&[first.clone(), third], 20),
        Err(StorageError::InvalidOperation(_))
    ));
    assert!(storage.bootstrap().expect("bootstrap").nodes.is_empty());
    assert_eq!(
        storage
            .sync_connection()
            .expect("connection")
            .expect("active")
            .observed_server_sequence,
        0
    );
    storage
        .apply_remote_operations(&[first], 21)
        .expect("retry contiguous operation");
}

#[test]
fn semantic_remote_conflict_is_durable_and_does_not_block_later_operations() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-conflict")])
        .expect("local note");
    connect_at_cursor(&storage, 0);
    let conflicting_save = remote(
        "remote-conflict",
        "device-remote",
        1,
        1,
        WorkspaceOperation::SaveDocument {
            note_id: "note-conflict".into(),
            document_json: json!({"type": "doc", "content": []}),
            markdown: "remote conflicting body".into(),
            word_count: 3,
            expected_revision: 9,
            at: 20,
        },
    );
    let later_create = remote(
        "remote-after-conflict",
        "device-remote",
        2,
        2,
        WorkspaceOperation::CreateFolder {
            id: "folder-after-conflict".into(),
            title: "After".into(),
            placement: NodePlacement::last(None),
            at: 21,
        },
    );

    let outcomes = storage
        .apply_remote_operations(&[conflicting_save.clone(), later_create], 30)
        .expect("record conflict and continue");
    let RemoteSyncApplyOutcome::Conflict(conflict) = &outcomes[0] else {
        panic!("expected conflict outcome");
    };
    assert_eq!(conflict.operation_id, "remote-conflict");
    assert_eq!(conflict.reason_code, "revision_conflict");
    assert!(matches!(outcomes[1], RemoteSyncApplyOutcome::Applied(_)));
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.documents[0].revision, 1);
    assert!(
        snapshot
            .nodes
            .iter()
            .any(|node| node.id == "folder-after-conflict")
    );
    assert_eq!(
        storage
            .sync_connection()
            .expect("connection")
            .expect("active")
            .observed_server_sequence,
        2
    );
    assert_eq!(
        storage.sync_conflicts().expect("conflicts"),
        vec![conflict.clone()]
    );
    assert_eq!(
        storage
            .apply_remote_operations(&[conflicting_save], 31)
            .expect("duplicate conflict"),
        vec![RemoteSyncApplyOutcome::Duplicate]
    );
    assert_eq!(storage.sync_conflicts().expect("conflicts").len(), 1);
}

#[test]
fn local_echo_is_idempotent_whether_pull_or_acknowledgement_wins() {
    let pull_first = SqliteWorkspace::open_in_memory().expect("open pull-first database");
    connect_at_cursor(&pull_first, 0);
    pull_first
        .apply_operations(&[op(WorkspaceOperation::CreateFolder {
            id: "folder-pull-first".into(),
            title: "Pull first".into(),
            placement: NodePlacement::last(None),
            at: 11,
        })])
        .expect("local operation");
    let claimed = pull_first
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("batch");
    let client = &claimed.request.operations[0];
    let echo = ReplicatedWorkspaceOperation {
        operation_id: client.operation_id.clone(),
        device_id: claimed.request.device_id.clone(),
        client_sequence: client.client_sequence,
        base_server_sequence: client.base_server_sequence,
        server_sequence: 1,
        payload: client.payload.clone(),
    };
    assert_eq!(
        pull_first
            .apply_remote_operations(std::slice::from_ref(&echo), 110)
            .expect("pull echo"),
        vec![RemoteSyncApplyOutcome::LocalEcho]
    );
    pull_first
        .acknowledge_sync_operations(
            "sync-worker",
            &[SyncAcceptedOperation {
                operation_id: echo.operation_id.clone(),
                client_sequence: echo.client_sequence,
                server_sequence: echo.server_sequence,
            }],
        )
        .expect("late acknowledgement is idempotent");
    assert_eq!(pull_first.bootstrap().expect("bootstrap").nodes.len(), 1);

    let ack_first = SqliteWorkspace::open_in_memory().expect("open ack-first database");
    connect_at_cursor(&ack_first, 0);
    ack_first
        .apply_operations(&[op(WorkspaceOperation::CreateFolder {
            id: "folder-ack-first".into(),
            title: "Ack first".into(),
            placement: NodePlacement::last(None),
            at: 11,
        })])
        .expect("local operation");
    let claimed = ack_first
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("batch");
    let client = &claimed.request.operations[0];
    let echo = ReplicatedWorkspaceOperation {
        operation_id: client.operation_id.clone(),
        device_id: claimed.request.device_id.clone(),
        client_sequence: client.client_sequence,
        base_server_sequence: client.base_server_sequence,
        server_sequence: 1,
        payload: client.payload.clone(),
    };
    ack_first
        .acknowledge_sync_operations(
            "sync-worker",
            &[SyncAcceptedOperation {
                operation_id: echo.operation_id.clone(),
                client_sequence: echo.client_sequence,
                server_sequence: echo.server_sequence,
            }],
        )
        .expect("acknowledge");
    assert_eq!(
        ack_first
            .apply_remote_operations(&[echo], 110)
            .expect("later pull"),
        vec![RemoteSyncApplyOutcome::Duplicate]
    );
    assert_eq!(ack_first.bootstrap().expect("bootstrap").nodes.len(), 1);
}

#[test]
fn disconnected_workspace_rejects_remote_application() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect_at_cursor(&storage, 0);
    storage.disconnect_sync(20).expect("disconnect");
    let operation = remote(
        "remote-disconnected",
        "device-remote",
        1,
        1,
        WorkspaceOperation::CreateFolder {
            id: "folder-disconnected".into(),
            title: "Disconnected".into(),
            placement: NodePlacement::last(None),
            at: 21,
        },
    );
    assert!(matches!(
        storage.apply_remote_operations(&[operation], 30),
        Err(StorageError::InvalidOperation(_))
    ));
    assert!(storage.bootstrap().expect("bootstrap").nodes.is_empty());
}

#[test]
fn pins_and_unpins_nodes_across_trash_and_purge() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1"), create_note("note-2")])
        .expect("create notes");

    storage
        .apply_operations(&[op(WorkspaceOperation::SetNodePinned {
            id: "note-1".into(),
            pinned: true,
            at: 10,
        })])
        .expect("pin note");
    let pinned = |storage: &SqliteWorkspace, id: &str| {
        storage
            .bootstrap()
            .expect("bootstrap")
            .nodes
            .into_iter()
            .find(|node| node.id == id)
            .and_then(|node| node.pinned_at)
    };
    assert_eq!(pinned(&storage, "note-1"), Some(10));
    assert_eq!(pinned(&storage, "note-2"), None);

    storage
        .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
            root_id: "note-1".into(),
            at: 20,
        })])
        .expect("trash pinned note");
    assert_eq!(pinned(&storage, "note-1"), Some(10));

    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::SetNodePinned {
            id: "note-1".into(),
            pinned: true,
            at: 21,
        })]),
        Err(StorageError::InvalidOperation(_))
    ));

    storage
        .apply_operations(&[op(WorkspaceOperation::RestoreSubtree {
            root_id: "note-1".into(),
            placement: NodePlacement::last(None),
            at: 30,
        })])
        .expect("restore pinned note");
    assert_eq!(pinned(&storage, "note-1"), Some(10));

    storage
        .apply_operations(&[op(WorkspaceOperation::SetNodePinned {
            id: "note-1".into(),
            pinned: false,
            at: 40,
        })])
        .expect("unpin note");
    assert_eq!(pinned(&storage, "note-1"), None);

    storage
        .apply_operations(&[
            op(WorkspaceOperation::SetNodePinned {
                id: "note-2".into(),
                pinned: true,
                at: 50,
            }),
            op(WorkspaceOperation::TrashSubtree {
                root_id: "note-2".into(),
                at: 60,
            }),
            op(WorkspaceOperation::PurgeSubtree {
                root_id: "note-2".into(),
                trashed_before: 60,
            }),
        ])
        .expect("purge pinned note");
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert!(snapshot.nodes.iter().all(|node| node.id != "note-2"));
}

#[test]
fn allocates_semantic_placements_and_reports_rank_changes() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    let first_ack = storage
        .apply_operations(&[create_placed_note("a", NodePlacement::last(None), 1)])
        .expect("create first note");
    assert_eq!(first_ack.rank_changes.len(), 1);
    assert_eq!(first_ack.rank_changes[0].id, "a");
    assert_eq!(first_ack.rank_changes[0].rank, 1024);

    storage
        .apply_operations(&[create_placed_note("b", NodePlacement::last(None), 2)])
        .expect("create last note");
    storage
        .apply_operations(&[create_placed_note("c", NodePlacement::first(None), 3)])
        .expect("create first note");
    storage
        .apply_operations(&[create_placed_note("d", NodePlacement::after(None, "a"), 4)])
        .expect("create after note");
    storage
        .apply_operations(&[create_placed_note("e", NodePlacement::before(None, "a"), 5)])
        .expect("create before note");
    assert_eq!(ordered_ids(&storage, None), ["c", "e", "a", "d", "b"]);

    storage
        .apply_operations(&[op(WorkspaceOperation::CreateFolder {
            id: "folder".into(),
            title: "Folder".into(),
            placement: NodePlacement::last(None),
            at: 6,
        })])
        .expect("create folder");
    storage
        .apply_operations(&[
            create_placed_note("nested-a", NodePlacement::last(Some("folder".into())), 7),
            create_placed_note("nested-b", NodePlacement::first(Some("folder".into())), 8),
        ])
        .expect("create nested notes");
    let move_ack = storage
        .apply_operations(&[op(WorkspaceOperation::MoveNode {
            id: "d".into(),
            placement: NodePlacement::last(Some("folder".into())),
            at: 9,
        })])
        .expect("move into folder");

    assert_eq!(
        ordered_ids(&storage, Some("folder")),
        ["nested-b", "nested-a", "d"]
    );
    assert_eq!(move_ack.rank_changes.len(), 1);
    assert_eq!(move_ack.rank_changes[0].id, "d");
    assert_eq!(
        move_ack.rank_changes[0].parent_id.as_deref(),
        Some("folder")
    );
    assert_eq!(move_ack.rank_changes[0].rank, 2048);
}

#[test]
fn rejects_anchor_outside_requested_active_siblings() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            op(WorkspaceOperation::CreateFolder {
                id: "folder".into(),
                title: "Folder".into(),
                placement: NodePlacement::last(None),
                at: 1,
            }),
            create_placed_note("nested", NodePlacement::last(Some("folder".into())), 2),
        ])
        .expect("seed nodes");

    assert!(matches!(
        storage.apply_operations(&[create_placed_note(
            "wrong-parent",
            NodePlacement::before(None, "nested"),
            3,
        )]),
        Err(StorageError::InvalidOperation(_))
    ));
    storage
        .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
            root_id: "nested".into(),
            at: 3,
        })])
        .expect("trash anchor");
    assert!(matches!(
        storage.apply_operations(&[create_placed_note(
            "trashed-anchor",
            NodePlacement::before(Some("folder".into()), "nested"),
            4,
        )]),
        Err(StorageError::InvalidOperation(_))
    ));
}

#[test]
fn repeated_insertion_compacts_only_destination_siblings() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_placed_note("a", NodePlacement::last(None), 1),
            create_placed_note("b", NodePlacement::last(None), 2),
            op(WorkspaceOperation::CreateFolder {
                id: "folder".into(),
                title: "Folder".into(),
                placement: NodePlacement::last(None),
                at: 3,
            }),
            create_placed_note("nested", NodePlacement::last(Some("folder".into())), 4),
        ])
        .expect("seed sibling sets");

    let mut compaction_ack = None;
    for index in 0..11 {
        let id = format!("x{index:02}");
        let ack = storage
            .apply_operations(&[create_placed_note(
                &id,
                NodePlacement::after(None, "a"),
                10 + index,
            )])
            .expect("insert after anchor");
        if ack.rank_changes.len() > 1 {
            compaction_ack = Some(ack);
        }
    }

    let ack = compaction_ack.expect("rank compaction acknowledgement");
    assert!(ack.rank_changes.iter().any(|change| change.id == "x10"));
    assert!(!ack.rank_changes.iter().any(|change| change.id == "nested"));
    let snapshot = storage.bootstrap().expect("bootstrap");
    let root_ranks = snapshot
        .nodes
        .iter()
        .filter(|node| node.parent_id.is_none())
        .map(|node| node.rank)
        .collect::<Vec<_>>();
    assert_eq!(
        root_ranks,
        (1..=root_ranks.len())
            .map(|position| i64::try_from(position).expect("rank position") * 1024)
            .collect::<Vec<_>>()
    );
    let nested = snapshot
        .nodes
        .iter()
        .find(|node| node.id == "nested")
        .expect("nested note");
    assert_eq!(nested.rank, 1024);
    assert_eq!(
        ordered_ids(&storage, None),
        [
            "a", "x10", "x09", "x08", "x07", "x06", "x05", "x04", "x03", "x02", "x01", "x00", "b",
            "folder",
        ]
    );
}

#[test]
fn compaction_uses_id_ties_deterministically() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_placed_note("b", NodePlacement::last(None), 1),
            create_placed_note("a", NodePlacement::last(None), 2),
        ])
        .expect("seed notes");
    {
        let connection = storage.lock().expect("database lock");
        connection
            .execute("UPDATE workspace_nodes SET rank = 100", [])
            .expect("create deterministic tie");
    }

    let ack = storage
        .apply_operations(&[create_placed_note(
            "between",
            NodePlacement::after(None, "a"),
            3,
        )])
        .expect("compact tied ranks");

    assert_eq!(ordered_ids(&storage, None), ["a", "between", "b"]);
    assert_eq!(ack.rank_changes.len(), 3);
    assert_eq!(
        ack.rank_changes
            .iter()
            .map(|change| change.id.as_str())
            .collect::<Vec<_>>(),
        ["a", "b", "between"]
    );
}

#[test]
fn compaction_rolls_back_with_failed_operation_batch() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_placed_note("a", NodePlacement::last(None), 1),
            create_placed_note("b", NodePlacement::last(None), 2),
        ])
        .expect("seed notes");
    for index in 0..10 {
        let id = format!("x{index:02}");
        storage
            .apply_operations(&[create_placed_note(
                &id,
                NodePlacement::after(None, "a"),
                10 + index,
            )])
            .expect("consume midpoint gap");
    }
    let before = storage
        .bootstrap()
        .expect("bootstrap before rollback")
        .nodes
        .into_iter()
        .map(|node| (node.id, node.rank))
        .collect::<Vec<_>>();

    storage
        .apply_operations(&[
            create_placed_note("x10", NodePlacement::after(None, "a"), 30),
            op(WorkspaceOperation::RenameNode {
                id: "missing".into(),
                title: "Missing".into(),
                at: 30,
            }),
        ])
        .expect_err("rollback compaction batch");
    let after = storage
        .bootstrap()
        .expect("bootstrap after rollback")
        .nodes
        .into_iter()
        .map(|node| (node.id, node.rank))
        .collect::<Vec<_>>();

    assert_eq!(after, before);
    assert!(!after.iter().any(|(id, _)| id == "x10"));
}

#[test]
fn batched_rank_changes_coalesce_to_final_state() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_placed_note("a", NodePlacement::last(None), 1),
            create_placed_note("b", NodePlacement::last(None), 2),
        ])
        .expect("seed notes");

    let ack = storage
        .apply_operations(&[
            op(WorkspaceOperation::MoveNode {
                id: "a".into(),
                placement: NodePlacement::last(None),
                at: 3,
            }),
            op(WorkspaceOperation::MoveNode {
                id: "a".into(),
                placement: NodePlacement::first(None),
                at: 4,
            }),
        ])
        .expect("move note twice");

    assert_eq!(ack.rank_changes.len(), 1);
    assert_eq!(ack.rank_changes[0].id, "a");
    assert_eq!(ack.rank_changes[0].rank, 1024);
    assert_eq!(ordered_ids(&storage, None), ["a", "b"]);
}

#[test]
#[ignore = "manual backend performance measurement"]
fn benchmarks_5000_sibling_placements() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    let operations = (0..5000)
        .map(|index| {
            create_placed_note(
                &format!("note-{index:04}"),
                NodePlacement::last(None),
                i64::from(index),
            )
        })
        .collect::<Vec<_>>();
    let started = Instant::now();
    let ack = storage
        .apply_operations(&operations)
        .expect("place 5000 siblings");
    let elapsed = started.elapsed();

    assert_eq!(ack.applied, 5000);
    assert_eq!(ack.rank_changes.len(), 5000);
    assert_eq!(storage.bootstrap().expect("bootstrap").nodes.len(), 5000);
    eprintln!("5000 sibling placements: {elapsed:?}");
}

#[test]
fn rejects_stale_document_revision() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    let error = storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: json!({"type": "doc"}),
            markdown: "changed".into(),
            word_count: 1,
            expected_revision: 9,
            at: 2,
        })])
        .expect_err("revision conflict");

    assert!(matches!(
        error,
        StorageError::RevisionConflict {
            expected: 9,
            current: 1,
            ..
        }
    ));
}

#[test]
fn batches_saves_without_losing_conflicts_or_history() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    let batches = vec![
        vec![save_document("note-1", 1, "revision two", 2)],
        vec![save_document("note-1", 1, "stale revision", 3)],
        vec![save_document("note-1", 2, "revision three", 4)],
    ];

    let results = storage
        .apply_operation_batches(&batches)
        .expect("apply save batches");

    assert_eq!(results.len(), 3);
    assert_eq!(
        results[0].as_ref().expect("first save").revisions[0].revision,
        2
    );
    assert!(matches!(
        results[1],
        Err(StorageError::RevisionConflict {
            expected: 1,
            current: 2,
            ..
        })
    ));
    assert_eq!(
        results[2].as_ref().expect("third save").revisions[0].revision,
        3
    );
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.documents[0].revision, 3);
    assert_eq!(snapshot.documents[0].markdown, "revision three");
    let connection = storage.lock().expect("database lock");
    let revisions = connection
        .prepare("SELECT revision, markdown FROM history_outbox WHERE note_id = 'note-1'")
        .expect("prepare history query")
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .expect("query history")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect history revisions");
    assert_eq!(revisions, [(3, "revision three".into())]);
}

#[test]
fn coalesces_history_saves_into_one_pending_revision_per_burst() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    storage
        .apply_operations(&[save_document("note-1", 1, "first burst edit", 2)])
        .expect("save within window");
    storage
        .apply_operations(&[save_document("note-1", 2, "second burst edit", 3)])
        .expect("second save within window");

    let burst_end = 1 + HISTORY_COALESCE_WINDOW_MS;
    storage
        .apply_operations(&[save_document("note-1", 3, "next burst", burst_end + 1)])
        .expect("save after window");

    let connection = storage.lock().expect("database lock");
    let pending = connection
        .prepare(
            "SELECT revision, markdown, created_at, next_attempt_at \
             FROM history_outbox WHERE note_id = 'note-1' ORDER BY created_at",
        )
        .expect("prepare history query")
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .expect("query history")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect pending revisions");
    assert_eq!(
        pending,
        [
            (3, "second burst edit".into(), 1, burst_end),
            (
                4,
                "next burst".into(),
                burst_end + 1,
                burst_end + 1 + HISTORY_COALESCE_WINDOW_MS
            ),
        ]
    );
}

#[test]
fn pending_history_becomes_claimable_after_the_coalesce_window() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    let claimable_at = 1 + HISTORY_COALESCE_WINDOW_MS;
    assert!(
        storage
            .claim_history_revision("worker-1", claimable_at - 1, 1_000)
            .expect("claim inside window")
            .is_none()
    );
    let claimed = storage
        .claim_history_revision("worker-1", claimable_at, 1_000)
        .expect("claim after window")
        .expect("pending revision");
    assert_eq!(claimed.revision, 1);
}

#[test]
fn claimed_history_revisions_are_not_coalesced() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    let claim_time = 1 + HISTORY_COALESCE_WINDOW_MS;
    let claimed = storage
        .claim_history_revision("worker-1", claim_time, 1_000)
        .expect("claim history")
        .expect("pending revision");

    storage
        .apply_operations(&[save_document(
            "note-1",
            1,
            "post-claim edit",
            claim_time + 1,
        )])
        .expect("save while claimed");

    let connection = storage.lock().expect("database lock");
    let pending = connection
        .prepare(
            "SELECT id, revision, markdown FROM history_outbox \
             WHERE note_id = 'note-1' ORDER BY created_at",
        )
        .expect("prepare history query")
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .expect("query history")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect pending revisions");
    assert_eq!(pending.len(), 2);
    assert_eq!(pending[0].0, claimed.id);
    assert_eq!(pending[0].1, claimed.revision);
    assert_eq!(pending[1].1, 2);
    assert_eq!(pending[1].2, "post-claim edit");
}

#[test]
fn savepoint_rolls_back_only_the_failed_request_group() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    let batches = vec![
        vec![
            save_document("note-1", 1, "rolled back", 2),
            op(WorkspaceOperation::RenameNode {
                id: "missing".into(),
                title: "Missing".into(),
                at: 2,
            }),
        ],
        vec![save_document("note-1", 1, "committed", 3)],
    ];

    let results = storage
        .apply_operation_batches(&batches)
        .expect("apply grouped operations");

    assert!(matches!(results[0], Err(StorageError::NotFound(_))));
    assert_eq!(
        results[1].as_ref().expect("second group").revisions[0].revision,
        2
    );
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.documents[0].revision, 2);
    assert_eq!(snapshot.documents[0].markdown, "committed");
}

#[test]
#[ignore = "manual backend performance measurement"]
fn benchmarks_1000_lossless_save_requests() {
    let directory = tempdir().expect("temporary directory");
    let grouped = SqliteWorkspace::open(directory.path().join("grouped.sqlite"))
        .expect("open grouped database");
    let sequential = SqliteWorkspace::open(directory.path().join("sequential.sqlite"))
        .expect("open sequential database");
    grouped
        .apply_operations(&[create_note("note-1")])
        .expect("seed grouped database");
    sequential
        .apply_operations(&[create_note("note-1")])
        .expect("seed sequential database");
    let batches = (1..=1000)
        .map(|expected_revision| {
            vec![save_document(
                "note-1",
                expected_revision,
                &format!("revision {}", expected_revision + 1),
                expected_revision + 1,
            )]
        })
        .collect::<Vec<_>>();

    let grouped_started = Instant::now();
    let mut grouped_results = Vec::with_capacity(batches.len());
    for batch_group in batches.chunks(64) {
        grouped_results.extend(
            grouped
                .apply_operation_batches(batch_group)
                .expect("apply grouped saves"),
        );
    }
    let grouped_elapsed = grouped_started.elapsed();

    let sequential_started = Instant::now();
    for operations in &batches {
        sequential
            .apply_operations(operations)
            .expect("apply sequential save");
    }
    let sequential_elapsed = sequential_started.elapsed();

    assert_eq!(grouped_results.len(), 1000);
    assert!(grouped_results.iter().all(Result::is_ok));
    assert_eq!(
        grouped.bootstrap().expect("grouped snapshot").documents[0].revision,
        1001
    );
    assert_eq!(
        sequential
            .bootstrap()
            .expect("sequential snapshot")
            .documents[0]
            .revision,
        1001
    );
    eprintln!(
        "1000 lossless saves: grouped {grouped_elapsed:?}; sequential {sequential_elapsed:?}"
    );
}

#[test]
fn rolls_back_complete_operation_batch() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    let operations = [
        create_note("note-1"),
        op(WorkspaceOperation::RenameNode {
            id: "missing".into(),
            title: "Nope".into(),
            at: 2,
        }),
    ];

    storage
        .apply_operations(&operations)
        .expect_err("batch must fail");
    assert!(storage.bootstrap().expect("bootstrap").nodes.is_empty());
}

#[test]
fn rejects_folder_cycles() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            op(WorkspaceOperation::CreateFolder {
                id: "parent".into(),
                title: "Parent".into(),
                placement: NodePlacement::last(None),
                at: 1,
            }),
            op(WorkspaceOperation::CreateFolder {
                id: "child".into(),
                title: "Child".into(),
                placement: NodePlacement::last(Some("parent".into())),
                at: 2,
            }),
        ])
        .expect("create folders");

    let error = storage
        .apply_operations(&[op(WorkspaceOperation::MoveNode {
            id: "parent".into(),
            placement: NodePlacement::last(Some("child".into())),
            at: 3,
        })])
        .expect_err("cycle must fail");
    assert!(matches!(error, StorageError::InvalidOperation(_)));
}

#[test]
fn records_immutable_migration_checksum() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    let connection = storage.lock().expect("database lock");
    let mut statement = connection
        .prepare("SELECT version, name, checksum FROM schema_migrations ORDER BY version")
        .expect("prepare migration query");
    let recorded = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .expect("migration rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect migration rows");

    assert_eq!(recorded.len(), MIGRATIONS.len());
    for (record, migration) in recorded.iter().zip(MIGRATIONS) {
        assert_eq!(record.0, migration.version);
        assert_eq!(record.1, migration.name);
        assert_eq!(record.2.len(), 64);
        assert_eq!(record.2, checksum(migration.sql));
    }
}

#[test]
fn rejects_migration_checksum_drift() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    {
        let connection = storage.lock().expect("database lock");
        connection
            .execute(
                "UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 1",
                [],
            )
            .expect("tamper checksum");
    }

    let error = {
        let mut connection = storage.lock().expect("database lock");
        SqliteWorkspace::migrate(&mut connection).expect_err("checksum drift")
    };
    assert!(error.to_string().contains("checksum drift"));
}

#[test]
fn upgrades_legacy_pre_release_database_without_data_loss() {
    let mut connection = Connection::open_in_memory().expect("open database");
    SqliteWorkspace::configure(&connection).expect("configure database");
    connection
        .execute_batch(include_str!("../tests/fixtures/legacy_0001.sql"))
        .expect("create legacy database");
    connection
        .execute(
            "INSERT INTO workspace_nodes \
                 (id, kind, rank, title, created_at, updated_at) \
                 VALUES ('note-1', 'note', 1024, 'Legacy', 1, 1)",
            [],
        )
        .expect("create legacy node");
    connection
        .execute(
            "INSERT INTO git_outbox(id, note_id, revision, markdown, created_at) \
                 VALUES ('item-1', 'note-1', 1, '# Legacy', 1)",
            [],
        )
        .expect("create legacy history item");
    connection
        .execute_batch(
            "INSERT INTO app_state(key, value_json) VALUES ('setting:theme', '\"dark\"');\
                 INSERT INTO app_state(key, value_json) VALUES ('setting:custom_flag', 'true');",
        )
        .expect("create legacy setting rows");

    SqliteWorkspace::migrate(&mut connection).expect("upgrade database");

    let pending = connection
        .query_row(
            "SELECT note_id, attempts FROM history_outbox WHERE id = 'item-1'",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .expect("upgraded history item");
    let checksum = connection
        .query_row(
            "SELECT checksum FROM schema_migrations WHERE version = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .expect("upgraded migration checksum");

    assert_eq!(pending, ("note-1".into(), 0));
    assert_eq!(checksum.len(), 64);
    assert!(
        table_columns(&connection, "history_cache")
            .expect("history columns")
            .iter()
            .any(|column| column == "version_id")
    );

    let settings = read_settings(&connection).expect("normalized settings");
    assert_eq!(settings.theme, "dark");
    assert_eq!(settings.extensions["custom_flag"], json!(true));
    let stray = connection
        .query_row(
            "SELECT count(*) FROM app_state WHERE key LIKE 'setting:%'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .expect("count stray rows");
    assert_eq!(stray, 0);
}

#[test]
fn persists_normalized_settings_document_and_defaults() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    assert_eq!(
        storage.bootstrap().expect("bootstrap defaults").settings,
        WorkspaceSettings::default()
    );

    let settings = custom_settings();
    storage
        .apply_operations(&[op(WorkspaceOperation::UpdateSettings {
            settings: settings.clone(),
        })])
        .expect("update settings");
    assert_eq!(storage.bootstrap().expect("bootstrap").settings, settings);

    let unsupported = WorkspaceSettings {
        settings_version: 2,
        ..WorkspaceSettings::default()
    };
    storage
        .apply_operations(&[op(WorkspaceOperation::UpdateSettings {
            settings: unsupported,
        })])
        .expect_err("reject unsupported settings version");
    assert_eq!(
        storage
            .bootstrap()
            .expect("bootstrap after rejection")
            .settings,
        settings
    );
}

#[test]
fn settings_update_rolls_back_with_failed_batch() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            op(WorkspaceOperation::UpdateSettings {
                settings: custom_settings(),
            }),
            op(WorkspaceOperation::RenameNode {
                id: "missing".into(),
                title: "Nope".into(),
                at: 1,
            }),
        ])
        .expect_err("failed batch");

    assert_eq!(
        storage.bootstrap().expect("bootstrap").settings,
        WorkspaceSettings::default()
    );
}

#[test]
fn rolls_back_invalid_history_cache_rebuild() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    storage
        .replace_history_headers(&[HistoryHeader {
            note_id: "note-1".into(),
            version_id: "version-old".into(),
            created_at: 1,
            summary: "Old".into(),
        }])
        .expect("seed history cache");

    storage
        .replace_history_headers(&[
            HistoryHeader {
                note_id: "note-1".into(),
                version_id: "version-new".into(),
                created_at: 2,
                summary: "New".into(),
            },
            HistoryHeader {
                note_id: "note-1".into(),
                version_id: "version-invalid".into(),
                created_at: -1,
                summary: "Invalid".into(),
            },
        ])
        .expect_err("invalid cache rebuild");
    let snapshot = storage.bootstrap().expect("bootstrap");

    assert_eq!(snapshot.history_headers.len(), 1);
    assert_eq!(snapshot.history_headers[0].version_id, "version-old");
}

#[test]
fn persists_bounded_history_diagnostic_records() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    let item = storage
        .claim_history_revision("worker-1", HISTORY_COALESCE_WINDOW_MS + 10, 1_000)
        .expect("claim history")
        .expect("history item");
    let diagnostic = Diagnostic::new(
        DiagnosticContext::History,
        DiagnosticCategory::Backend,
        format!("\n{}\t", "failure".repeat(300)),
    );

    storage
        .release_history_revision("worker-1", &item.id, 1_010, &diagnostic)
        .expect("release history");

    let (persisted, next_attempt_at) = storage
        .lock()
        .expect("database lock")
        .query_row(
            "SELECT last_error, next_attempt_at FROM history_outbox WHERE id = ?1",
            [&item.id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .expect("persisted diagnostic");
    assert_eq!(persisted, diagnostic.to_string());
    assert_eq!(next_attempt_at, 1_010);
    assert!(persisted.starts_with("history.backend: "));
    assert!(persisted.len() <= "history.backend: ".len() + MAX_DIAGNOSTIC_MESSAGE_BYTES);
    assert!(!persisted.contains(char::is_control));
}

#[test]
fn exports_and_replaces_workspace_from_portable_archive() {
    let source = SqliteWorkspace::open_in_memory().expect("open source database");
    source
        .apply_operations(&[
            op(WorkspaceOperation::CreateFolder {
                id: "folder-1".into(),
                title: "Folder".into(),
                placement: NodePlacement::last(None),
                at: 1,
            }),
            op(WorkspaceOperation::CreateNote {
                id: "note-1".into(),
                title: "Imported".into(),
                placement: NodePlacement::last(Some("folder-1".into())),
                document_json: json!({"type": "doc", "content": []}),
                markdown: "# Portable archive".into(),
                at: 2,
            }),
            op(WorkspaceOperation::UpdateSettings {
                settings: custom_settings(),
            }),
            op(WorkspaceOperation::SetActiveNote {
                note_id: Some("note-1".into()),
            }),
        ])
        .expect("seed source");
    let archive = source.export_archive(100).expect("export archive");
    let target = SqliteWorkspace::open_in_memory().expect("open target database");
    target
        .apply_operations(&[create_note("replaced-note")])
        .expect("seed target");

    let summary = target
        .replace_from_archive(&archive)
        .expect("replace from archive");
    let round_trip = target.export_archive(100).expect("export imported archive");

    assert_eq!(summary.nodes, 2);
    assert_eq!(summary.documents, 1);
    assert_eq!(summary.history_items, 1);
    assert_eq!(round_trip, archive);
    assert_eq!(target.search("Portable", 10).expect("search").len(), 1);
}

#[test]
fn invalid_archive_cannot_replace_existing_workspace() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    let before = storage.bootstrap().expect("bootstrap before import");
    let mut archive = storage.export_archive(100).expect("export archive");
    archive.documents.clear();

    storage
        .replace_from_archive(&archive)
        .expect_err("reject invalid archive");
    let after = storage.bootstrap().expect("bootstrap after import");

    assert_eq!(after, before);
}

#[test]
fn integrity_check_covers_sqlite_and_domain_state() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    let report = storage.integrity_check().expect("integrity check");

    assert!(report.healthy);
    assert!(report.issues.is_empty());
}

#[test]
fn search_excludes_deleted_notes() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    storage
        .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
            root_id: "note-1".into(),
            at: 2,
        })])
        .expect("delete note");

    assert!(storage.search("SQLite", 10).expect("search").is_empty());
}

#[test]
fn trash_hides_complete_subtree_and_clears_active_note() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    seed_nested_workspace(&storage);
    storage
        .replace_history_headers(&[
            HistoryHeader {
                note_id: "note-nested".into(),
                version_id: "nested-version".into(),
                created_at: 3,
                summary: "Nested".into(),
            },
            HistoryHeader {
                note_id: "note-outside".into(),
                version_id: "outside-version".into(),
                created_at: 4,
                summary: "Outside".into(),
            },
        ])
        .expect("seed history cache");
    storage
        .apply_operations(&[op(WorkspaceOperation::SetActiveNote {
            note_id: Some("note-nested".into()),
        })])
        .expect("activate nested note");

    storage
        .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
            root_id: "folder-root".into(),
            at: 10,
        })])
        .expect("trash subtree");

    let snapshot = storage.bootstrap().expect("bootstrap");
    let root = snapshot
        .nodes
        .iter()
        .find(|node| node.id == "folder-root")
        .expect("root node");
    let child = snapshot
        .nodes
        .iter()
        .find(|node| node.id == "folder-child")
        .expect("child node");
    assert_eq!(root.deleted_at, Some(10));
    assert_eq!(child.deleted_at, None);
    assert_eq!(snapshot.active_note_id, None);
    assert_eq!(
        snapshot.unavailable_node_ids(),
        ["folder-child", "folder-root", "note-nested"]
            .into_iter()
            .collect()
    );
    assert_eq!(snapshot.history_headers.len(), 1);
    assert_eq!(snapshot.history_headers[0].note_id, "note-outside");
    assert!(storage.search("nested", 10).expect("search").is_empty());
    assert_eq!(
        storage
            .claim_history_revision("worker", HISTORY_COALESCE_WINDOW_MS + 20, 10)
            .expect("claim history")
            .expect("available history item")
            .note_id,
        "note-outside"
    );
}

#[test]
fn commands_reject_descendants_of_trashed_folder() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    seed_nested_workspace(&storage);
    storage
        .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
            root_id: "folder-root".into(),
            at: 10,
        })])
        .expect("trash subtree");

    let operations = [
        WorkspaceOperation::RenameNode {
            id: "note-nested".into(),
            title: "Hidden rename".into(),
            at: 11,
        },
        WorkspaceOperation::MoveNode {
            id: "folder-child".into(),
            placement: NodePlacement::last(None),
            at: 11,
        },
        WorkspaceOperation::SaveDocument {
            note_id: "note-nested".into(),
            document_json: json!({"type": "doc"}),
            markdown: "hidden save".into(),
            word_count: 2,
            expected_revision: 1,
            at: 11,
        },
        WorkspaceOperation::SetActiveNote {
            note_id: Some("note-nested".into()),
        },
        WorkspaceOperation::CreateNote {
            id: "hidden-new-note".into(),
            title: "Hidden".into(),
            placement: NodePlacement::last(Some("folder-child".into())),
            document_json: json!({"type": "doc"}),
            markdown: String::new(),
            at: 11,
        },
    ];

    for operation in operations {
        assert!(matches!(
            storage.apply_operations(&[op(operation)]),
            Err(StorageError::InvalidOperation(_))
        ));
    }
}

#[test]
fn restore_requires_active_destination_and_preserves_independent_trash() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    seed_nested_workspace(&storage);
    storage
        .apply_operations(&[
            op(WorkspaceOperation::TrashSubtree {
                root_id: "note-nested".into(),
                at: 5,
            }),
            op(WorkspaceOperation::TrashSubtree {
                root_id: "folder-root".into(),
                at: 6,
            }),
        ])
        .expect("trash nested roots");

    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::RestoreSubtree {
            root_id: "note-nested".into(),
            placement: NodePlacement::last(Some("folder-child".into())),
            at: 7,
        })]),
        Err(StorageError::InvalidOperation(_))
    ));
    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::RestoreSubtree {
            root_id: "note-nested".into(),
            placement: NodePlacement::last(Some("missing-folder".into())),
            at: 7,
        })]),
        Err(StorageError::NotFound(_))
    ));

    storage
        .apply_operations(&[op(WorkspaceOperation::RestoreSubtree {
            root_id: "folder-root".into(),
            placement: NodePlacement::last(None),
            at: 8,
        })])
        .expect("restore parent subtree");
    let snapshot = storage.bootstrap().expect("bootstrap restored parent");
    assert_eq!(
        snapshot.unavailable_node_ids(),
        ["note-nested"].into_iter().collect()
    );
    assert!(storage.search("nested", 10).expect("search").is_empty());

    storage
        .apply_operations(&[op(WorkspaceOperation::RestoreSubtree {
            root_id: "note-nested".into(),
            placement: NodePlacement::last(Some("folder-child".into())),
            at: 9,
        })])
        .expect("restore independent note");
    assert_eq!(storage.search("nested", 10).expect("search").len(), 1);
}

#[test]
fn trash_rolls_back_active_note_and_visibility_with_failed_batch() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    seed_nested_workspace(&storage);
    storage
        .apply_operations(&[op(WorkspaceOperation::SetActiveNote {
            note_id: Some("note-nested".into()),
        })])
        .expect("activate nested note");

    storage
        .apply_operations(&[
            op(WorkspaceOperation::TrashSubtree {
                root_id: "folder-root".into(),
                at: 10,
            }),
            op(WorkspaceOperation::RenameNode {
                id: "missing".into(),
                title: "Missing".into(),
                at: 10,
            }),
        ])
        .expect_err("rollback trash batch");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.active_note_id.as_deref(), Some("note-nested"));
    assert!(snapshot.unavailable_node_ids().is_empty());
    assert_eq!(storage.search("nested", 10).expect("search").len(), 1);
}

#[test]
fn purge_removes_subtree_projections_and_history_atomically() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    seed_nested_workspace(&storage);
    storage
        .replace_history_headers(&[HistoryHeader {
            note_id: "note-nested".into(),
            version_id: "nested-version".into(),
            created_at: 3,
            summary: "Nested".into(),
        }])
        .expect("seed history cache");
    storage
        .apply_operations(&[
            op(WorkspaceOperation::TrashSubtree {
                root_id: "folder-root".into(),
                at: 10,
            }),
            op(WorkspaceOperation::PurgeSubtree {
                root_id: "folder-root".into(),
                trashed_before: 10,
            }),
        ])
        .expect("purge subtree");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.nodes.len(), 1);
    assert_eq!(snapshot.nodes[0].id, "note-outside");
    assert_eq!(snapshot.documents.len(), 1);
    assert!(snapshot.history_headers.is_empty());
    let connection = storage.lock().expect("database lock");
    for (table, expected) in [
        ("workspace_nodes", 1),
        ("documents", 1),
        ("documents_fts", 1),
        ("history_cache", 0),
        ("history_outbox", 1),
    ] {
        let count = connection
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("count rows");
        assert_eq!(count, expected, "unexpected surviving rows in {table}");
    }
}

#[test]
fn purge_enforces_retention_and_rolls_back_with_batch() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    seed_nested_workspace(&storage);
    storage
        .replace_history_headers(&[HistoryHeader {
            note_id: "note-nested".into(),
            version_id: "nested-version".into(),
            created_at: 3,
            summary: "Nested".into(),
        }])
        .expect("seed history cache");
    storage
        .apply_operations(&[
            op(WorkspaceOperation::TrashSubtree {
                root_id: "note-nested".into(),
                at: 11,
            }),
            op(WorkspaceOperation::TrashSubtree {
                root_id: "folder-root".into(),
                at: 10,
            }),
        ])
        .expect("trash subtree");

    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::PurgeSubtree {
            root_id: "folder-root".into(),
            trashed_before: 10,
        })]),
        Err(StorageError::InvalidOperation(_))
    ));
    storage
        .apply_operations(&[
            op(WorkspaceOperation::PurgeSubtree {
                root_id: "folder-root".into(),
                trashed_before: 11,
            }),
            op(WorkspaceOperation::RenameNode {
                id: "missing".into(),
                title: "Missing".into(),
                at: 11,
            }),
        ])
        .expect_err("rollback purge batch");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.nodes.len(), 4);
    assert_eq!(snapshot.documents.len(), 2);
    let connection = storage.lock().expect("database lock");
    let projection_counts = ["documents_fts", "history_cache", "history_outbox"].map(|table| {
        connection
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("count projection rows")
    });
    assert_eq!(projection_counts, [2, 1, 2]);
}

#[test]
fn sidebar_expansion_is_native_durable_state_and_drops_purged_ids() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            op(WorkspaceOperation::CreateFolder {
                id: "folder-a".into(),
                title: "A".into(),
                placement: NodePlacement::last(None),
                at: 1,
            }),
            op(WorkspaceOperation::CreateFolder {
                id: "folder-b".into(),
                title: "B".into(),
                placement: NodePlacement::last(Some("folder-a".into())),
                at: 2,
            }),
        ])
        .expect("create folders");
    storage
        .save_sidebar_expansion(&["folder-b".into(), "folder-a".into(), "missing".into()])
        .expect("save expansion");
    assert_eq!(
        storage.load_sidebar_expansion().expect("load expansion"),
        Some(vec!["folder-a".to_string(), "folder-b".to_string()])
    );

    storage
        .apply_operations(&[op(WorkspaceOperation::MoveNode {
            id: "folder-b".into(),
            placement: NodePlacement::last(None),
            at: 3,
        })])
        .expect("move folder");
    assert_eq!(
        storage.load_sidebar_expansion().expect("load after move"),
        Some(vec!["folder-a".to_string(), "folder-b".to_string()])
    );
    let archive = storage.export_archive(4).expect("export archive");
    let encoded = serde_json::to_string(&archive).expect("encode archive");
    assert!(!encoded.contains("sidebar_expanded_folder_ids"));

    storage
        .apply_operations(&[
            op(WorkspaceOperation::TrashSubtree {
                root_id: "folder-a".into(),
                at: 5,
            }),
            op(WorkspaceOperation::PurgeSubtree {
                root_id: "folder-a".into(),
                trashed_before: 5,
            }),
        ])
        .expect("purge folder");
    assert_eq!(
        storage.load_sidebar_expansion().expect("load after purge"),
        Some(vec!["folder-b".to_string()])
    );
}

#[test]
fn creates_verified_online_backup() {
    let directory = tempdir().expect("temporary directory");
    let backup_path = directory.path().join("workspace.backup.db");
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    storage.backup_to(&backup_path).expect("create backup");
    assert!(!PathBuf::from(format!("{}-wal", backup_path.display())).exists());
    assert!(!PathBuf::from(format!("{}-shm", backup_path.display())).exists());
    let backup = SqliteWorkspace::open(&backup_path).expect("open backup");

    assert_eq!(backup.bootstrap().expect("backup snapshot").nodes.len(), 1);
    assert_eq!(backup.quick_check().expect("backup check"), "ok");
}

#[test]
fn backup_refuses_existing_target() {
    let directory = tempdir().expect("temporary directory");
    let backup_path = directory.path().join("workspace.backup.db");
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage.backup_to(&backup_path).expect("create backup");

    let error = storage
        .backup_to(&backup_path)
        .expect_err("existing backup target");

    assert!(matches!(error, StorageError::AlreadyExists(_)));
}

#[test]
fn restores_verified_backup_to_new_database() {
    let directory = tempdir().expect("temporary directory");
    let backup_path = directory.path().join("workspace.backup.db");
    let restore_path = directory.path().join("restored.db");
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    storage.backup_to(&backup_path).expect("create backup");

    SqliteWorkspace::restore_backup_to(&backup_path, &restore_path).expect("restore backup");
    let restored = SqliteWorkspace::open(&restore_path).expect("open restored database");

    assert_eq!(
        restored.bootstrap().expect("restored snapshot").nodes[0].id,
        "note-1"
    );
}

#[test]
fn rejects_corrupt_backup_without_creating_target() {
    let directory = tempdir().expect("temporary directory");
    let backup_path = directory.path().join("corrupt.db");
    let restore_path = directory.path().join("restored.db");
    std::fs::write(&backup_path, b"not a SQLite database").expect("write corrupt backup");

    SqliteWorkspace::restore_backup_to(&backup_path, &restore_path)
        .expect_err("reject corrupt backup");

    assert!(!restore_path.exists());
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

#[test]
fn attaches_images_and_shares_blobs_between_notes() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            create_note("note-2"),
            attach_image("image-1", "note-1", 'a'),
            attach_image("image-2", "note-2", 'a'),
        ])
        .expect("attach images");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.images.len(), 2);
    let distinct_hashes = snapshot
        .images
        .iter()
        .map(|image| image.content_hash.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(distinct_hashes.len(), 1);

    let duplicate = storage.apply_operations(&[attach_image("image-1", "note-1", 'a')]);
    assert!(matches!(duplicate, Err(StorageError::AlreadyExists(_))));
    let dangling = storage.apply_operations(&[attach_image("image-3", "missing-note", 'b')]);
    assert!(matches!(dangling, Err(StorageError::NotFound(_))));
}

#[test]
fn save_document_prunes_detached_image_rows() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            attach_image("image-1", "note-1", 'a'),
            attach_image("image-2", "note-1", 'b'),
        ])
        .expect("attach images");

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: json!({"type": "doc", "content": [
                {"type": "paragraph", "content": [
                    {"type": "image_ref", "attrs": {"id": "image-1", "alt": ""}}
                ]}
            ]}),
            markdown: "![](images/image-1)".into(),
            word_count: 0,
            expected_revision: 1,
            at: 3,
        })])
        .expect("save with one image");

    let images = storage.bootstrap().expect("bootstrap").images;
    assert_eq!(images.len(), 1);
    assert_eq!(images[0].id, "image-1");
}

#[test]
fn note_cover_round_trips_and_survives_document_image_pruning() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            attach_image("cover-1", "note-1", 'a'),
            op(WorkspaceOperation::SetNoteCover {
                note_id: "note-1".into(),
                image_id: Some("cover-1".into()),
                at: 3,
            }),
            op(WorkspaceOperation::SetNoteCoverFullWidth {
                note_id: "note-1".into(),
                full_width: true,
                at: 3,
            }),
            op(WorkspaceOperation::SetNoteCoverTransform {
                note_id: "note-1".into(),
                position_x: 25.0,
                position_y: 70.0,
                zoom: 1.5,
                at: 3,
            }),
        ])
        .expect("set cover");

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: json!({"type": "doc", "content": []}),
            markdown: String::new(),
            word_count: 0,
            expected_revision: 1,
            at: 4,
        })])
        .expect("save without inline images");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.nodes[0].cover_image_id.as_deref(), Some("cover-1"));
    assert!(snapshot.nodes[0].cover_full_width);
    assert_eq!(snapshot.nodes[0].cover_position_x, 25.0);
    assert_eq!(snapshot.nodes[0].cover_position_y, 70.0);
    assert_eq!(snapshot.nodes[0].cover_zoom, 1.5);
    assert_eq!(snapshot.images[0].id, "cover-1");

    storage
        .apply_operations(&[op(WorkspaceOperation::SetNoteCover {
            note_id: "note-1".into(),
            image_id: None,
            at: 5,
        })])
        .expect("remove cover");
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.nodes[0].cover_image_id, None);
    assert!(!snapshot.nodes[0].cover_full_width);
    assert_eq!(snapshot.nodes[0].cover_position_x, 50.0);
    assert_eq!(snapshot.nodes[0].cover_position_y, 50.0);
    assert_eq!(snapshot.nodes[0].cover_zoom, 1.0);
    assert!(snapshot.images.is_empty());
}

#[test]
fn note_cover_rejects_foreign_or_missing_images() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            create_note("note-2"),
            attach_image("image-1", "note-1", 'a'),
        ])
        .expect("seed");

    let foreign = storage.apply_operations(&[op(WorkspaceOperation::SetNoteCover {
        note_id: "note-2".into(),
        image_id: Some("image-1".into()),
        at: 3,
    })]);
    assert!(matches!(foreign, Err(StorageError::InvalidOperation(_))));
}

#[test]
fn purge_cascades_image_rows_with_their_note() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            attach_image("image-1", "note-1", 'a'),
            op(WorkspaceOperation::TrashSubtree {
                root_id: "note-1".into(),
                at: 4,
            }),
            op(WorkspaceOperation::PurgeSubtree {
                root_id: "note-1".into(),
                trashed_before: 4,
            }),
        ])
        .expect("purge note");

    assert!(storage.bootstrap().expect("bootstrap").images.is_empty());
}

#[test]
fn typed_properties_and_templates_round_trip_in_order() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    let status = NoteProperty {
        note_id: "note-1".into(),
        field: NotePropertyField {
            id: "status".into(),
            name: "Status".into(),
            value: VersionedNotePropertyValue::v1(NotePropertyValue::Select(Some("active".into()))),
            options: vec![NotePropertyOption {
                id: "active".into(),
                label: "Active".into(),
                color: NotePropertyColor::Amber,
            }],
            position: 1,
        },
    };
    let template = NotePropertyTemplate {
        id: "project".into(),
        name: "Project".into(),
        position: 0,
        properties: vec![NotePropertyField {
            id: "owner".into(),
            name: "Owner".into(),
            value: VersionedNotePropertyValue::v1(NotePropertyValue::Person(vec![
                "person-1".into(),
            ])),
            options: Vec::new(),
            position: 0,
        }],
    };
    storage
        .apply_operations(&[
            create_note("note-1"),
            op(WorkspaceOperation::CreatePerson {
                person: WorkspacePerson {
                    id: "person-1".into(),
                    name: "Alice".into(),
                    initials: Some("A".into()),
                    color: None,
                    note: None,
                    created_at: 1,
                    updated_at: 1,
                    created_in: None,
                },
            }),
            op(WorkspaceOperation::SetNoteProperty {
                property: text_property("note-1", "summary", 0),
                at: 2,
            }),
            op(WorkspaceOperation::SetNoteProperty {
                property: status,
                at: 3,
            }),
            op(WorkspaceOperation::ReorderNoteProperties {
                note_id: "note-1".into(),
                ordered_property_ids: vec!["status".into(), "summary".into()],
                at: 4,
            }),
            op(WorkspaceOperation::SetNotePropertyTemplate { template }),
            op(WorkspaceOperation::SetNotePropertyTemplate {
                template: NotePropertyTemplate {
                    id: "blank".into(),
                    name: "Blank".into(),
                    position: 1,
                    properties: Vec::new(),
                },
            }),
            op(WorkspaceOperation::ReorderNotePropertyTemplates {
                ordered_template_ids: vec!["blank".into(), "project".into()],
            }),
            op(WorkspaceOperation::DeleteNotePropertyTemplate {
                template_id: "blank".into(),
            }),
        ])
        .expect("write properties");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(
        snapshot
            .properties
            .iter()
            .map(|property| property.field.id.as_str())
            .collect::<Vec<_>>(),
        vec!["status", "summary"]
    );
    assert_eq!(snapshot.property_templates[0].properties[0].id, "owner");
    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::DeletePerson {
            id: "person-1".into(),
        })]),
        Err(StorageError::InvalidOperation(_))
    ));

    let archive = storage.export_archive(5).expect("export");
    let restored = SqliteWorkspace::open_in_memory().expect("open restored");
    restored
        .replace_from_archive(&archive)
        .expect("import properties");
    let restored_snapshot = restored.bootstrap().expect("bootstrap restored");
    assert_eq!(restored_snapshot.properties, snapshot.properties);
    assert_eq!(
        restored_snapshot.property_templates,
        snapshot.property_templates
    );
}

#[test]
fn property_failures_are_atomic_and_references_are_enforced() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    let mut wrong_position = text_property("note-1", "late", 1);
    let missing_person = NoteProperty {
        note_id: "note-1".into(),
        field: NotePropertyField {
            id: "owner".into(),
            name: "Owner".into(),
            value: VersionedNotePropertyValue::v1(NotePropertyValue::Person(vec![
                "missing".into(),
            ])),
            options: Vec::new(),
            position: 0,
        },
    };
    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::SetNoteProperty {
            property: missing_person,
            at: 2,
        })]),
        Err(StorageError::InvalidOperation(_))
    ));
    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::SetNoteProperty {
            property: wrong_position.clone(),
            at: 2,
        })]),
        Err(StorageError::InvalidOperation(_))
    ));

    wrong_position.field.position = 0;
    let result = storage.apply_operations(&[
        op(WorkspaceOperation::SetNoteProperty {
            property: wrong_position,
            at: 2,
        }),
        op(WorkspaceOperation::ReorderNoteProperties {
            note_id: "note-1".into(),
            ordered_property_ids: vec!["missing".into()],
            at: 3,
        }),
    ]);
    assert!(matches!(result, Err(StorageError::InvalidOperation(_))));
    assert!(
        storage
            .bootstrap()
            .expect("bootstrap")
            .properties
            .is_empty()
    );
}

#[test]
fn bootstrap_rejects_semantically_corrupt_property_values() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            op(WorkspaceOperation::SetNoteProperty {
                property: text_property("note-1", "summary", 0),
                at: 2,
            }),
        ])
        .expect("seed property");
    storage
        .lock()
        .expect("database lock")
        .execute(
            "UPDATE note_properties SET value_json = ?1 WHERE note_id = 'note-1'",
            [r#"{"valueVersion":2,"type":"text","value":"future"}"#],
        )
        .expect("corrupt property");

    assert!(matches!(storage.bootstrap(), Err(StorageError::Backend(_))));
}

#[test]
fn property_remove_compacts_and_purge_cascades() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            op(WorkspaceOperation::SetNoteProperty {
                property: text_property("note-1", "first", 0),
                at: 2,
            }),
            op(WorkspaceOperation::SetNoteProperty {
                property: text_property("note-1", "second", 1),
                at: 3,
            }),
            op(WorkspaceOperation::RemoveNoteProperty {
                note_id: "note-1".into(),
                property_id: "first".into(),
                at: 4,
            }),
            op(WorkspaceOperation::TrashSubtree {
                root_id: "note-1".into(),
                at: 5,
            }),
        ])
        .expect("trash property note");

    let snapshot = storage.bootstrap().expect("bootstrap trashed");
    assert_eq!(snapshot.properties.len(), 1);
    assert_eq!(snapshot.properties[0].field.position, 0);

    storage
        .apply_operations(&[op(WorkspaceOperation::PurgeSubtree {
            root_id: "note-1".into(),
            trashed_before: 5,
        })])
        .expect("purge");
    assert!(
        storage
            .bootstrap()
            .expect("bootstrap purged")
            .properties
            .is_empty()
    );
}

#[test]
fn provider_import_receipts_commit_replace_and_cascade_atomically() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    let receipt = |note_id: &str, imported_at: i64| {
        op(WorkspaceOperation::RecordProviderImport {
            receipt: ProviderImportReceipt {
                provider: "obsidian".into(),
                source_key: "source-key".into(),
                source_path: "Folder/Note.md".into(),
                note_id: note_id.into(),
                imported_at,
            },
        })
    };
    storage
        .apply_operations(&[create_note("note-1"), receipt("note-1", 2)])
        .expect("record receipt");
    let snapshot = storage.bootstrap().expect("bootstrap receipt");
    assert_eq!(snapshot.import_receipts.len(), 1);
    assert_eq!(snapshot.import_receipts[0].note_id, "note-1");

    let failed = storage.apply_operations(&[
        receipt("missing-note", 3),
        op(WorkspaceOperation::CreateTag {
            tag: skriuw_domain::WorkspaceTag {
                id: "tag-rollback".into(),
                name: "rollback".into(),
                color: None,
                created_at: 3,
                updated_at: 3,
                created_in: None,
            },
        }),
    ]);
    assert!(failed.is_err());
    let snapshot = storage.bootstrap().expect("bootstrap rollback");
    assert_eq!(snapshot.import_receipts[0].note_id, "note-1");
    assert!(snapshot.tags.is_empty());

    storage
        .apply_operations(&[
            op(WorkspaceOperation::TrashSubtree {
                root_id: "note-1".into(),
                at: 4,
            }),
            op(WorkspaceOperation::PurgeSubtree {
                root_id: "note-1".into(),
                trashed_before: 4,
            }),
        ])
        .expect("purge imported note");
    assert!(
        storage
            .bootstrap()
            .expect("bootstrap purge")
            .import_receipts
            .is_empty()
    );
}

fn remote_save(
    operation_id: &str,
    server_sequence: u64,
    note_id: &str,
    expected_revision: i64,
    markdown: &str,
) -> ReplicatedWorkspaceOperation {
    remote(
        operation_id,
        "device-remote",
        server_sequence,
        server_sequence,
        WorkspaceOperation::SaveDocument {
            note_id: note_id.into(),
            document_json: json!({"type": "doc", "content": [markdown]}),
            markdown: markdown.into(),
            word_count: markdown.split_whitespace().count() as i64,
            expected_revision,
            at: 20,
        },
    )
}

#[test]
fn identical_remote_save_is_a_semantic_no_op() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-same")])
        .expect("local note");
    connect_at_cursor(&storage, 0);
    let identical = remote(
        "remote-identical",
        "device-remote",
        1,
        1,
        WorkspaceOperation::SaveDocument {
            note_id: "note-same".into(),
            document_json: json!({"type": "doc", "content": []}),
            markdown: "# Fast notes\n\nSQLite search".into(),
            word_count: 4,
            expected_revision: 1,
            at: 20,
        },
    );

    assert_eq!(
        storage
            .apply_remote_operations(std::slice::from_ref(&identical), 30)
            .expect("apply identical save"),
        vec![RemoteSyncApplyOutcome::NoOp]
    );
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.documents[0].revision, 1);
    assert!(storage.sync_conflicts().expect("conflicts").is_empty());
    assert_eq!(
        storage
            .sync_connection()
            .expect("connection")
            .expect("active")
            .observed_server_sequence,
        1
    );
    assert_eq!(
        storage
            .apply_remote_operations(&[identical], 31)
            .expect("replayed no-op"),
        vec![RemoteSyncApplyOutcome::Duplicate]
    );
}

#[test]
fn divergent_document_save_preserves_both_complete_versions() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("document-conflict.db");
    {
        let storage = SqliteWorkspace::open(&path).expect("open database");
        storage
            .apply_operations(&[create_note("note-fork")])
            .expect("local note");
        storage
            .apply_operations(&[save_document("note-fork", 1, "local offline body", 12)])
            .expect("local save");
        connect_at_cursor(&storage, 0);

        let outcomes = storage
            .apply_remote_operations(
                &[remote_save(
                    "remote-fork",
                    1,
                    "note-fork",
                    1,
                    "remote offline body",
                )],
                30,
            )
            .expect("apply divergent save");
        let RemoteSyncApplyOutcome::Conflict(conflict) = &outcomes[0] else {
            panic!("expected conflict outcome");
        };
        assert_eq!(conflict.reason_code, "revision_conflict");
        assert_eq!(
            conflict.subreason.as_deref(),
            Some("concurrent_document_version")
        );
    }

    let storage = SqliteWorkspace::open(&path).expect("reopen database");
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.documents[0].revision, 2);
    assert_eq!(snapshot.documents[0].markdown, "local offline body");

    let summaries = storage.document_conflicts().expect("summaries");
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0].note_id, "note-fork");
    assert!(summaries[0].local_version_available);
    assert_eq!(summaries[0].resolved_choice, None);

    let versions = storage
        .document_conflict_versions(&summaries[0].conflict_id)
        .expect("versions");
    assert_eq!(versions.remote.markdown, "remote offline body");
    let local = versions.local.expect("local version");
    assert_eq!(local.markdown, "local offline body");
    assert_eq!(local.revision, Some(2));
}

#[test]
fn keep_remote_resolution_updates_canonical_and_keeps_the_alternative() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-resolve")])
        .expect("local note");
    storage
        .apply_operations(&[save_document("note-resolve", 1, "local body", 12)])
        .expect("local save");
    connect_at_cursor(&storage, 0);
    storage
        .apply_remote_operations(
            &[remote_save(
                "remote-resolve",
                1,
                "note-resolve",
                1,
                "remote body",
            )],
            30,
        )
        .expect("divergent save");
    let conflict_id = storage.document_conflicts().expect("summaries")[0]
        .conflict_id
        .clone();

    let acknowledgement = storage
        .resolve_document_conflict(&skriuw_domain::ResolveDocumentConflict {
            conflict_id: conflict_id.clone(),
            choice: skriuw_domain::DocumentConflictResolutionChoice::KeepRemote,
            at: 100,
        })
        .expect("resolve");
    assert!(acknowledgement.is_some());

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.documents[0].markdown, "remote body");
    assert_eq!(snapshot.documents[0].revision, 3);
    assert!(storage.sync_conflicts().expect("unresolved").is_empty());

    let summary = &storage.document_conflicts().expect("summaries")[0];
    assert_eq!(summary.resolved_choice.as_deref(), Some("remote"));
    let versions = storage
        .document_conflict_versions(&conflict_id)
        .expect("versions");
    assert_eq!(
        versions.local.expect("preserved local").markdown,
        "local body"
    );

    let batch = storage
        .claim_sync_operations("sync-worker", 200, 50, 64)
        .expect("claim")
        .expect("resolution replicates");
    assert!(batch.request.operations.iter().any(|operation| {
        envelope_of(operation)
            .operation
            .sync_policy()
            .operation_type
            == "save_document"
    }));

    assert_eq!(
        storage
            .resolve_document_conflict(&skriuw_domain::ResolveDocumentConflict {
                conflict_id: conflict_id.clone(),
                choice: skriuw_domain::DocumentConflictResolutionChoice::KeepRemote,
                at: 120,
            })
            .expect("duplicate identical resolution"),
        None
    );
    assert!(matches!(
        storage.resolve_document_conflict(&skriuw_domain::ResolveDocumentConflict {
            conflict_id,
            choice: skriuw_domain::DocumentConflictResolutionChoice::KeepLocal,
            at: 130,
        }),
        Err(StorageError::InvalidOperation(_))
    ));
}

#[test]
fn keep_local_resolution_leaves_canonical_untouched() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-keep-local")])
        .expect("local note");
    storage
        .apply_operations(&[save_document("note-keep-local", 1, "local body", 12)])
        .expect("local save");
    connect_at_cursor(&storage, 0);
    storage
        .apply_remote_operations(
            &[remote_save(
                "remote-keep-local",
                1,
                "note-keep-local",
                1,
                "remote body",
            )],
            30,
        )
        .expect("divergent save");
    let conflict_id = storage.document_conflicts().expect("summaries")[0]
        .conflict_id
        .clone();

    assert_eq!(
        storage
            .resolve_document_conflict(&skriuw_domain::ResolveDocumentConflict {
                conflict_id: conflict_id.clone(),
                choice: skriuw_domain::DocumentConflictResolutionChoice::KeepLocal,
                at: 100,
            })
            .expect("resolve"),
        None
    );
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.documents[0].markdown, "local body");
    assert_eq!(snapshot.documents[0].revision, 2);
    assert!(storage.sync_conflicts().expect("unresolved").is_empty());
    let versions = storage
        .document_conflict_versions(&conflict_id)
        .expect("versions");
    assert_eq!(versions.remote.markdown, "remote body");
}

#[test]
fn purge_creates_terminal_tombstones_and_blocks_resurrection() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            op(WorkspaceOperation::CreateFolder {
                id: "folder-purged".into(),
                title: "Folder".into(),
                placement: NodePlacement::last(None),
                at: 1,
            }),
            create_placed_note(
                "note-purged",
                NodePlacement::last(Some("folder-purged".into())),
                2,
            ),
        ])
        .expect("seed subtree");
    storage
        .apply_operations(&[
            op(WorkspaceOperation::TrashSubtree {
                root_id: "folder-purged".into(),
                at: 5,
            }),
            op(WorkspaceOperation::PurgeSubtree {
                root_id: "folder-purged".into(),
                trashed_before: 10,
            }),
        ])
        .expect("trash and purge");

    let tombstones = storage.sync_tombstones().expect("tombstones");
    let node_ids = tombstones
        .iter()
        .filter(|tombstone| tombstone.entity_kind == "node")
        .map(|tombstone| tombstone.entity_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(node_ids, vec!["folder-purged", "note-purged"]);
    assert!(
        tombstones
            .iter()
            .filter(|tombstone| tombstone.entity_kind == "node")
            .all(|tombstone| tombstone.root_id.as_deref() == Some("folder-purged"))
    );

    connect_at_cursor(&storage, 0);
    let delayed_edit = remote_save("remote-delayed-edit", 1, "note-purged", 1, "delayed body");
    let stale_recreate = remote(
        "remote-stale-recreate",
        "device-remote",
        2,
        2,
        WorkspaceOperation::CreateNote {
            id: "note-purged".into(),
            title: "Resurrected".into(),
            placement: NodePlacement::last(None),
            document_json: json!({"type": "doc", "content": []}),
            markdown: "resurrected".into(),
            at: 30,
        },
    );
    let outcomes = storage
        .apply_remote_operations(&[delayed_edit, stale_recreate], 40)
        .expect("apply delayed operations");
    for outcome in &outcomes {
        let RemoteSyncApplyOutcome::Conflict(conflict) = outcome else {
            panic!("expected tombstone-blocked conflict");
        };
        assert_eq!(conflict.subreason.as_deref(), Some("tombstone_blocked"));
    }
    assert!(storage.bootstrap().expect("bootstrap").nodes.is_empty());

    let summaries = storage.document_conflicts().expect("summaries");
    assert_eq!(summaries.len(), 2);
    assert!(
        summaries
            .iter()
            .all(|summary| !summary.local_version_available)
    );
    let versions = storage
        .document_conflict_versions(&summaries[0].conflict_id)
        .expect("versions");
    assert_eq!(versions.remote.markdown, "delayed body");
    assert_eq!(versions.local, None);
}

#[test]
fn edit_of_trashed_note_becomes_a_preserved_conflict() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-trashed")])
        .expect("local note");
    storage
        .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
            root_id: "note-trashed".into(),
            at: 5,
        })])
        .expect("trash note");
    connect_at_cursor(&storage, 0);

    let outcomes = storage
        .apply_remote_operations(
            &[remote_save(
                "remote-trash-edit",
                1,
                "note-trashed",
                1,
                "edited while trashed",
            )],
            30,
        )
        .expect("apply edit");
    let RemoteSyncApplyOutcome::Conflict(conflict) = &outcomes[0] else {
        panic!("expected conflict outcome");
    };
    assert_eq!(conflict.subreason.as_deref(), Some("tombstone_blocked"));

    let summaries = storage.document_conflicts().expect("summaries");
    assert!(summaries[0].local_version_available);
    let versions = storage
        .document_conflict_versions(&summaries[0].conflict_id)
        .expect("versions");
    assert_eq!(versions.remote.markdown, "edited while trashed");
    assert_eq!(
        versions.local.expect("trashed local version").markdown,
        "# Fast notes\n\nSQLite search"
    );
}

#[test]
fn duplicate_remote_delete_with_matching_tombstone_is_a_no_op() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[op(WorkspaceOperation::CreateTag {
            tag: skriuw_domain::WorkspaceTag {
                id: "tag-deleted".into(),
                name: "Deleted".into(),
                color: None,
                created_at: 1,
                updated_at: 1,
                created_in: None,
            },
        })])
        .expect("create tag");
    storage
        .apply_operations(&[op(WorkspaceOperation::DeleteTag {
            id: "tag-deleted".into(),
        })])
        .expect("delete tag");
    connect_at_cursor(&storage, 0);

    assert_eq!(
        storage
            .apply_remote_operations(
                &[remote(
                    "remote-dup-delete",
                    "device-remote",
                    1,
                    1,
                    WorkspaceOperation::DeleteTag {
                        id: "tag-deleted".into(),
                    },
                )],
                30,
            )
            .expect("duplicate delete"),
        vec![RemoteSyncApplyOutcome::NoOp]
    );
    assert!(storage.sync_conflicts().expect("conflicts").is_empty());
}

#[test]
fn concurrent_create_identity_collision_preserves_divergent_records() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[op(WorkspaceOperation::CreateTag {
            tag: skriuw_domain::WorkspaceTag {
                id: "tag-collision".into(),
                name: "Local".into(),
                color: Some("#112233".into()),
                created_at: 1,
                updated_at: 1,
                created_in: None,
            },
        })])
        .expect("create tag");
    connect_at_cursor(&storage, 0);

    let equivalent = remote(
        "remote-equivalent-create",
        "device-remote",
        1,
        1,
        WorkspaceOperation::CreateTag {
            tag: skriuw_domain::WorkspaceTag {
                id: "tag-collision".into(),
                name: "Local".into(),
                color: Some("#112233".into()),
                created_at: 9,
                updated_at: 9,
                created_in: None,
            },
        },
    );
    let divergent = remote(
        "remote-divergent-create",
        "device-remote",
        2,
        2,
        WorkspaceOperation::CreateTag {
            tag: skriuw_domain::WorkspaceTag {
                id: "tag-collision".into(),
                name: "Remote".into(),
                color: None,
                created_at: 9,
                updated_at: 9,
                created_in: None,
            },
        },
    );
    let outcomes = storage
        .apply_remote_operations(&[equivalent, divergent], 30)
        .expect("apply creates");
    assert_eq!(outcomes[0], RemoteSyncApplyOutcome::NoOp);
    let RemoteSyncApplyOutcome::Conflict(conflict) = &outcomes[1] else {
        panic!("expected identity conflict");
    };
    assert_eq!(conflict.reason_code, "identity_conflict");
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.tags[0].name, "Local");
}

#[test]
fn property_reference_to_deleted_person_is_tombstone_blocked() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_note("note-person"),
            op(WorkspaceOperation::CreatePerson {
                person: WorkspacePerson {
                    id: "person-gone".into(),
                    name: "Gone".into(),
                    initials: None,
                    color: None,
                    note: None,
                    created_at: 1,
                    updated_at: 1,
                    created_in: None,
                },
            }),
        ])
        .expect("seed");
    storage
        .apply_operations(&[op(WorkspaceOperation::DeletePerson {
            id: "person-gone".into(),
        })])
        .expect("delete person");
    connect_at_cursor(&storage, 0);

    let outcomes = storage
        .apply_remote_operations(
            &[remote(
                "remote-person-property",
                "device-remote",
                1,
                1,
                WorkspaceOperation::SetNoteProperty {
                    property: NoteProperty {
                        note_id: "note-person".into(),
                        field: NotePropertyField {
                            id: "property-person".into(),
                            name: "Owner".into(),
                            value: VersionedNotePropertyValue::v1(NotePropertyValue::Person(vec![
                                "person-gone".into(),
                            ])),
                            options: Vec::new(),
                            position: 0,
                        },
                    },
                    at: 20,
                },
            )],
            30,
        )
        .expect("apply property");
    let RemoteSyncApplyOutcome::Conflict(conflict) = &outcomes[0] else {
        panic!("expected conflict outcome");
    };
    assert_eq!(conflict.subreason.as_deref(), Some("tombstone_blocked"));
    assert!(
        storage
            .bootstrap()
            .expect("bootstrap")
            .properties
            .is_empty()
    );
}

#[test]
fn replay_is_deterministic_across_batch_partitions() {
    let log = vec![
        remote(
            "replay-1",
            "device-remote",
            1,
            1,
            WorkspaceOperation::CreateFolder {
                id: "folder-replay".into(),
                title: "Replay".into(),
                placement: NodePlacement::last(None),
                at: 11,
            },
        ),
        remote(
            "replay-2",
            "device-remote",
            2,
            2,
            WorkspaceOperation::CreateNote {
                id: "note-replay".into(),
                title: "Replayed".into(),
                placement: NodePlacement::last(Some("folder-replay".into())),
                document_json: json!({"type": "doc", "content": []}),
                markdown: "replayed body".into(),
                at: 12,
            },
        ),
        remote_save("replay-3", 3, "note-replay", 9, "conflicting body"),
        remote(
            "replay-4",
            "device-remote",
            4,
            4,
            WorkspaceOperation::RenameNode {
                id: "folder-replay".into(),
                title: "Replay renamed".into(),
                at: 14,
            },
        ),
        remote(
            "replay-5",
            "device-remote",
            5,
            5,
            WorkspaceOperation::TrashSubtree {
                root_id: "note-replay".into(),
                at: 15,
            },
        ),
    ];

    let batched = SqliteWorkspace::open_in_memory().expect("open batched database");
    connect_at_cursor(&batched, 0);
    batched
        .apply_remote_operations(&log, 30)
        .expect("apply as one batch");

    let stepped = SqliteWorkspace::open_in_memory().expect("open stepped database");
    connect_at_cursor(&stepped, 0);
    for operation in &log {
        stepped
            .apply_remote_operations(std::slice::from_ref(operation), 30)
            .expect("apply one operation");
    }

    let batched_snapshot = batched.bootstrap().expect("batched bootstrap");
    let stepped_snapshot = stepped.bootstrap().expect("stepped bootstrap");
    assert_eq!(batched_snapshot, stepped_snapshot);

    let conflict_keys = |storage: &SqliteWorkspace| {
        storage
            .sync_conflicts()
            .expect("conflicts")
            .into_iter()
            .map(|conflict| {
                (
                    conflict.operation_id,
                    conflict.reason_code,
                    conflict.subreason,
                    conflict.server_sequence,
                )
            })
            .collect::<Vec<_>>()
    };
    assert_eq!(conflict_keys(&batched), conflict_keys(&stepped));

    let cursor = |storage: &SqliteWorkspace| {
        storage
            .sync_connection()
            .expect("connection")
            .expect("active")
            .observed_server_sequence
    };
    assert_eq!(cursor(&batched), 5);
    assert_eq!(cursor(&stepped), 5);
}

#[test]
fn portable_export_fails_closed_while_a_conflict_is_unresolved() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-export")])
        .expect("local note");
    storage
        .apply_operations(&[save_document("note-export", 1, "local body", 12)])
        .expect("local save");
    connect_at_cursor(&storage, 0);
    storage
        .apply_remote_operations(
            &[remote_save(
                "remote-export",
                1,
                "note-export",
                1,
                "remote body",
            )],
            30,
        )
        .expect("divergent save");

    let error = storage
        .export_archive(100)
        .expect_err("export must fail closed");
    assert!(matches!(&error, StorageError::InvalidOperation(message)
        if message.contains("unresolved sync conflict")));

    let conflict_id = storage.document_conflicts().expect("summaries")[0]
        .conflict_id
        .clone();
    storage
        .resolve_document_conflict(&skriuw_domain::ResolveDocumentConflict {
            conflict_id,
            choice: skriuw_domain::DocumentConflictResolutionChoice::Merged {
                document_json: json!({"type": "doc", "content": ["merged"]}),
                markdown: "merged body".into(),
            },
            at: 100,
        })
        .expect("resolve by merge");
    assert_eq!(
        storage.bootstrap().expect("bootstrap").documents[0].markdown,
        "merged body"
    );
    storage
        .export_archive(200)
        .expect("export after resolution");
}

#[test]
fn hydrates_a_fresh_device_from_a_checkpoint_and_replays_only_the_tail() {
    let source = SqliteWorkspace::open_in_memory().expect("open database");
    source
        .apply_operations(&[
            op(WorkspaceOperation::CreateNote {
                id: "note-1".into(),
                title: "Checkpointed".into(),
                placement: NodePlacement::last(None),
                document_json: json!({"type": "doc"}),
                markdown: "body".into(),
                at: 1,
            }),
            op(WorkspaceOperation::CreateTag {
                tag: WorkspaceTag {
                    id: "tag-1".into(),
                    name: "archived".into(),
                    color: None,
                    created_at: 1,
                    updated_at: 1,
                    created_in: None,
                },
            }),
        ])
        .expect("seed source workspace");
    let archive = source.export_archive(20).expect("export archive");
    let (checkpoint, bytes) =
        WorkspaceCheckpoint::build("workspace-1", 12, 30, &archive).expect("build checkpoint");
    let verified = checkpoint
        .verify_content(&bytes)
        .expect("verify checkpoint");

    let fresh = SqliteWorkspace::open_in_memory().expect("open database");
    connect_at_cursor(&fresh, 0);
    let summary = fresh
        .hydrate_from_checkpoint(&verified, checkpoint.server_sequence)
        .expect("hydrate from checkpoint");
    assert_eq!(summary.nodes, 1);
    assert_eq!(summary.documents, 1);

    let connection = fresh
        .sync_connection()
        .expect("connection")
        .expect("active connection");
    assert_eq!(connection.observed_server_sequence, 12);

    fresh
        .apply_remote_operations(
            &[remote(
                "op-tail",
                "device-2",
                1,
                13,
                WorkspaceOperation::RenameNode {
                    id: "note-1".into(),
                    title: "Renamed after checkpoint".into(),
                    at: 40,
                },
            )],
            41,
        )
        .expect("apply ordered tail");

    let snapshot = fresh.bootstrap().expect("bootstrap");
    assert_eq!(
        snapshot
            .nodes
            .iter()
            .find(|node| node.id == "note-1")
            .map(|node| node.title.as_str()),
        Some("Renamed after checkpoint")
    );
    assert_eq!(snapshot.tags.len(), 1);
}

#[test]
fn refuses_checkpoint_hydration_that_would_discard_local_work() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect_at_cursor(&storage, 0);
    storage
        .apply_operations(&[op(WorkspaceOperation::CreateFolder {
            id: "folder-local".into(),
            title: "Pending".into(),
            placement: NodePlacement::last(None),
            at: 1,
        })])
        .expect("queue local work");
    let archive = SqliteWorkspace::open_in_memory()
        .expect("open database")
        .export_archive(5)
        .expect("export archive");

    let error = storage
        .hydrate_from_checkpoint(&archive, 3)
        .expect_err("pending outbox must block hydration");
    assert!(matches!(error, StorageError::InvalidOperation(_)));

    let advanced = SqliteWorkspace::open_in_memory().expect("open database");
    connect_at_cursor(&advanced, 7);
    let error = advanced
        .hydrate_from_checkpoint(&archive, 3)
        .expect_err("an advanced cursor must block hydration");
    assert!(matches!(error, StorageError::InvalidOperation(_)));
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

#[test]
fn recovery_view_names_the_blocked_target_and_cause() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect(&storage);
    block_middle_of_three(&storage);

    let view = storage.sync_recovery_view().expect("recovery view");
    assert_eq!(view.view_version, skriuw_domain::SYNC_RECOVERY_VIEW_VERSION);
    assert_eq!(view.blocked.len(), 1);
    let item = &view.blocked[0];
    assert_eq!(item.operation_type, "create_folder");
    assert_eq!(item.reason_code, "asset_content_missing");
    assert_eq!(item.target_id.as_deref(), Some("folder-2"));
    assert_eq!(item.target_title.as_deref(), Some("Second"));
    assert!(item.first_blocked_at > 0);
    assert!(view.discarded.is_empty());
}

#[test]
fn retrying_a_blocked_operation_requeues_it_and_unblocks_the_queue() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect(&storage);
    let blocked_id = block_middle_of_three(&storage);

    storage
        .retry_blocked_sync_operation(&blocked_id, 500)
        .expect("retry the blocked operation");

    assert!(
        storage
            .blocked_sync_operations()
            .expect("blocked")
            .is_empty()
    );
    assert!(
        storage
            .sync_recovery_view()
            .expect("recovery view")
            .blocked
            .is_empty()
    );
    let batch = storage
        .claim_sync_operations("sync-worker", 600, 50, 64)
        .expect("claim")
        .expect("pending batch");
    assert_eq!(
        batch
            .request
            .operations
            .iter()
            .map(|operation| operation.client_sequence)
            .collect::<Vec<_>>(),
        vec![1, 2, 3],
        "the retried operation joins the tail of a contiguous queue"
    );
    assert_eq!(
        envelope_of(&batch.request.operations[2])
            .operation
            .target_entity_id(),
        Some("folder-2")
    );

    let error = storage
        .retry_blocked_sync_operation(&blocked_id, 700)
        .expect_err("a resolved record cannot be retried twice");
    assert!(matches!(error, StorageError::NotFound(_)));
}

#[test]
fn retry_rejects_operations_that_can_never_upload() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect(&storage);
    storage
        .apply_operations(&[folder("folder-1", "First", 11)])
        .expect("queue one operation");
    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending batch");
    let operation_id = batch.request.operations[0].operation_id.clone();
    storage
        .block_claimed_sync_operations("sync-worker", &[operation_id], "operation_too_large")
        .expect("block as permanently oversized");
    let view = storage.sync_recovery_view().expect("recovery view");

    let error = storage
        .retry_blocked_sync_operation(&view.blocked[0].blocked_id, 200)
        .expect_err("a permanently unsupported operation cannot be retried");
    assert!(matches!(error, StorageError::InvalidOperation(_)));
    assert_eq!(
        storage
            .sync_recovery_view()
            .expect("recovery view")
            .blocked
            .len(),
        1,
        "the record stays visible after the rejected retry"
    );
}

#[test]
fn discarding_a_blocked_operation_is_durable_across_restart() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("workspace.db");
    let blocked_id;
    {
        let storage = SqliteWorkspace::open(&path).expect("open database");
        connect(&storage);
        blocked_id = block_middle_of_three(&storage);
        storage
            .discard_blocked_sync_operation(&blocked_id, 900)
            .expect("discard the blocked operation");
        let view = storage.sync_recovery_view().expect("recovery view");
        assert!(view.blocked.is_empty());
        assert_eq!(view.discarded.len(), 1);
    }

    let reopened = SqliteWorkspace::open(&path).expect("reopen database");
    let view = reopened.sync_recovery_view().expect("recovery view");
    assert!(view.blocked.is_empty());
    assert_eq!(view.discarded.len(), 1);
    let record = &view.discarded[0];
    assert_eq!(record.blocked_id, blocked_id);
    assert_eq!(record.operation_type, "create_folder");
    assert_eq!(record.target_id.as_deref(), Some("folder-2"));
    assert!(record.discarded_at >= record.first_blocked_at);
    let batch = reopened
        .claim_sync_operations("sync-worker", 1_000, 50, 64)
        .expect("claim")
        .expect("pending batch");
    assert_eq!(
        batch.request.operations.len(),
        2,
        "the discarded operation never returns to the queue"
    );

    let error = reopened
        .discard_blocked_sync_operation(&blocked_id, 950)
        .expect_err("a resolved record cannot be discarded twice");
    assert!(matches!(error, StorageError::NotFound(_)));
}

#[test]
fn requeue_with_available_assets_moves_only_present_blobs() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect(&storage);
    storage
        .apply_operations(&[create_note("note-media")])
        .expect("create note");
    storage
        .apply_operations(&[op(WorkspaceOperation::AttachImage {
            image: WorkspaceImage {
                id: "image-1".into(),
                note_id: "note-media".into(),
                content_hash: "b".repeat(64),
                mime_type: "image/png".into(),
                byte_size: 4,
                width: Some(1),
                height: Some(1),
                created_at: 12,
            },
        })])
        .expect("attach image");
    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending batch");
    let attach_id = batch.request.operations[1].operation_id.clone();
    storage
        .block_claimed_sync_operations("sync-worker", &[attach_id], "asset_content_missing")
        .expect("block the attach operation");

    let requeued = storage
        .requeue_blocked_sync_operations_with_assets(300, &|_, _| false)
        .expect("requeue with absent blob");
    assert_eq!(requeued, 0);
    assert_eq!(
        storage.sync_recovery_view().expect("view").blocked.len(),
        1,
        "a still-missing blob keeps the record blocked"
    );

    let requeued = storage
        .requeue_blocked_sync_operations_with_assets(400, &|content_hash, mime_type| {
            content_hash == "b".repeat(64) && mime_type == "image/png"
        })
        .expect("requeue with present blob");
    assert_eq!(requeued, 1);
    assert!(
        storage
            .sync_recovery_view()
            .expect("view")
            .blocked
            .is_empty()
    );
    let batch = storage
        .claim_sync_operations("sync-worker", 500, 50, 64)
        .expect("claim")
        .expect("pending batch");
    assert_eq!(
        envelope_of(batch.request.operations.last().expect("requeued operation"))
            .operation
            .sync_policy()
            .operation_type,
        "attach_image"
    );
}

fn checklist_document(link: Option<(&str, &str)>, checked: bool, title: &str) -> serde_json::Value {
    let (task_id, block_id) = match link {
        Some((task_id, block_id)) => (json!(task_id), json!(block_id)),
        None => (json!(null), json!(null)),
    };
    json!({
        "type": "doc",
        "content": [{
            "type": "check_list",
            "content": [{
                "type": "check_item",
                "attrs": { "checked": checked, "taskId": task_id, "blockId": block_id },
                "content": [{
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": title }],
                }],
            }],
        }],
    })
}

fn source_document(
    note_id: &str,
    expected_revision: i64,
    link: Option<(&str, &str)>,
    checked: bool,
    title: &str,
) -> TaskSourceDocument {
    TaskSourceDocument {
        note_id: note_id.into(),
        document_json: checklist_document(link, checked, title),
        markdown: format!("- [{}] {title}", if checked { "x" } else { " " }),
        word_count: title.split_whitespace().count() as i64,
        expected_revision,
    }
}

fn promoted_task(id: &str, note_id: &str, block_id: &str, title: &str, at: i64) -> WorkspaceTask {
    WorkspaceTask {
        id: id.into(),
        title: title.into(),
        status: TaskStatus::Todo,
        priority: TaskPriority::Medium,
        due_date: None,
        description: String::new(),
        tag_ids: Vec::new(),
        assignee_ids: Vec::new(),
        source: Some(TaskSource {
            note_id: note_id.into(),
            block_id: block_id.into(),
        }),
        detached_at: None,
        created_at: at,
        updated_at: at,
    }
}

fn promote(task: WorkspaceTask, document: TaskSourceDocument) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::PromoteChecklistTask {
        task: Box::new(task),
        document: Box::new(document),
    })
}

fn promoted_workspace() -> SqliteWorkspace {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_note("note-1"),
            promote(
                promoted_task("task-1", "note-1", "block-1", "Ship the release", 5),
                source_document(
                    "note-1",
                    1,
                    Some(("task-1", "block-1")),
                    false,
                    "Ship the release",
                ),
            ),
        ])
        .expect("promote checklist item");
    storage
}

fn only_task(storage: &SqliteWorkspace) -> WorkspaceTask {
    let mut tasks = storage.bootstrap().expect("bootstrap").tasks;
    assert_eq!(tasks.len(), 1, "expected exactly one task");
    tasks.remove(0)
}

#[test]
fn promotion_writes_the_task_and_the_checklist_link_together() {
    let storage = promoted_workspace();
    let snapshot = storage.bootstrap().expect("bootstrap");

    let task = only_task(&storage);
    assert_eq!(
        task.source,
        Some(TaskSource {
            note_id: "note-1".into(),
            block_id: "block-1".into(),
        })
    );
    assert_eq!(task.title, "Ship the release");
    assert_eq!(task.status, TaskStatus::Todo);
    let document = snapshot
        .documents
        .iter()
        .find(|document| document.note_id == "note-1")
        .expect("source document");
    assert_eq!(document.revision, 2);
    let links = skriuw_domain::document_task_links(&document.document_json);
    assert_eq!(links.len(), 1);
    assert_eq!(links[0].task_id, "task-1");
}

#[test]
fn failed_promotion_leaves_neither_the_task_nor_the_document_change() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    let stale = promote(
        promoted_task("task-1", "note-1", "block-1", "Ship the release", 5),
        source_document(
            "note-1",
            9,
            Some(("task-1", "block-1")),
            false,
            "Ship the release",
        ),
    );
    assert!(matches!(
        storage.apply_operations(&[stale]),
        Err(StorageError::RevisionConflict { .. })
    ));

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert!(snapshot.tasks.is_empty());
    assert_eq!(snapshot.documents[0].revision, 1);
}

#[test]
fn promotion_without_the_link_in_the_document_is_rejected() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    let unlinked = promote(
        promoted_task("task-1", "note-1", "block-1", "Ship the release", 5),
        source_document("note-1", 1, None, false, "Ship the release"),
    );
    assert!(matches!(
        storage.apply_operations(&[unlinked]),
        Err(StorageError::InvalidOperation(_))
    ));
    assert!(storage.bootstrap().expect("bootstrap").tasks.is_empty());
}

#[test]
fn ordinary_checklist_items_never_create_tasks() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_note("note-1"),
            op(WorkspaceOperation::SaveDocument {
                note_id: "note-1".into(),
                document_json: checklist_document(None, false, "Buy milk"),
                markdown: "- [ ] Buy milk".into(),
                word_count: 2,
                expected_revision: 1,
                at: 3,
            }),
        ])
        .expect("save ordinary checklist");

    assert!(storage.bootstrap().expect("bootstrap").tasks.is_empty());
}

#[test]
fn the_source_checkbox_owns_task_completion() {
    let storage = promoted_workspace();

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: checklist_document(Some(("task-1", "block-1")), true, "Ship it"),
            markdown: "- [x] Ship it".into(),
            word_count: 2,
            expected_revision: 2,
            at: 7,
        })])
        .expect("check the source item");
    let task = only_task(&storage);
    assert_eq!(task.status, TaskStatus::Done);
    assert_eq!(task.title, "Ship it");
    assert_eq!(task.updated_at, 7);

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: checklist_document(Some(("task-1", "block-1")), false, "Ship it"),
            markdown: "- [ ] Ship it".into(),
            word_count: 2,
            expected_revision: 3,
            at: 8,
        })])
        .expect("uncheck the source item");
    assert_eq!(only_task(&storage).status, TaskStatus::Todo);
}

#[test]
fn deleting_the_source_block_detaches_the_task_instead_of_losing_it() {
    let storage = promoted_workspace();

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: json!({"type": "doc", "content": []}),
            markdown: String::new(),
            word_count: 0,
            expected_revision: 2,
            at: 9,
        })])
        .expect("remove the source item");

    let task = only_task(&storage);
    assert_eq!(task.source, None);
    assert_eq!(task.detached_at, Some(9));
    assert_eq!(task.title, "Ship the release");
}

#[test]
fn trashing_keeps_the_link_and_purging_detaches_the_task() {
    let storage = promoted_workspace();

    storage
        .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
            root_id: "note-1".into(),
            at: 20,
        })])
        .expect("trash the source note");
    assert!(only_task(&storage).source.is_some());

    storage
        .apply_operations(&[op(WorkspaceOperation::PurgeSubtree {
            root_id: "note-1".into(),
            trashed_before: 30,
        })])
        .expect("purge the source note");
    let task = only_task(&storage);
    assert_eq!(task.source, None);
    assert_eq!(task.detached_at, Some(30));
}

#[test]
fn task_updates_cannot_move_or_drop_the_source_link() {
    let storage = promoted_workspace();
    let task = only_task(&storage);

    let mut relinked = task.clone();
    relinked.source = Some(TaskSource {
        note_id: "note-1".into(),
        block_id: "block-other".into(),
    });
    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::UpdateTask {
            task: Box::new(relinked),
            document: None,
        })]),
        Err(StorageError::InvalidOperation(_))
    ));

    let mut unlinked = task.clone();
    unlinked.source = None;
    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::UpdateTask {
            task: Box::new(unlinked),
            document: None,
        })]),
        Err(StorageError::InvalidOperation(_))
    ));

    assert_eq!(only_task(&storage).source, task.source);
}

#[test]
fn detaching_clears_both_halves_of_the_link() {
    let storage = promoted_workspace();

    storage
        .apply_operations(&[op(WorkspaceOperation::DetachTask {
            id: "task-1".into(),
            document: Some(Box::new(source_document(
                "note-1",
                2,
                None,
                false,
                "Ship the release",
            ))),
            at: 12,
        })])
        .expect("detach the task");

    let task = only_task(&storage);
    assert_eq!(task.source, None);
    assert_eq!(task.detached_at, Some(12));
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert!(skriuw_domain::document_task_links(&snapshot.documents[0].document_json).is_empty());
}

#[test]
fn deleting_a_task_clears_the_link_and_tombstones_the_identity() {
    let storage = promoted_workspace();

    storage
        .apply_operations(&[op(WorkspaceOperation::DeleteTask {
            id: "task-1".into(),
            document: Some(Box::new(source_document(
                "note-1",
                2,
                None,
                false,
                "Ship the release",
            ))),
            at: 15,
        })])
        .expect("delete the task");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert!(snapshot.tasks.is_empty());
    assert!(skriuw_domain::document_task_links(&snapshot.documents[0].document_json).is_empty());

    let recreated = storage.apply_operations(&[promote(
        promoted_task("task-1", "note-1", "block-1", "Ship the release", 16),
        source_document(
            "note-1",
            3,
            Some(("task-1", "block-1")),
            false,
            "Ship the release",
        ),
    )]);
    assert!(recreated.is_ok(), "local recreation stays allowed");
}

#[test]
fn tasks_survive_restart_and_archive_round_trip() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("tasks-restart.db");
    let exported = {
        let storage = SqliteWorkspace::open(&path).expect("open database");
        storage
            .apply_operations(&[
                create_note("note-1"),
                promote(
                    promoted_task("task-1", "note-1", "block-1", "Ship the release", 5),
                    source_document(
                        "note-1",
                        1,
                        Some(("task-1", "block-1")),
                        false,
                        "Ship the release",
                    ),
                ),
            ])
            .expect("promote checklist item");
        storage.export_archive(50).expect("export archive")
    };

    let reopened = SqliteWorkspace::open(&path).expect("reopen database");
    let restarted = only_task(&reopened);
    assert_eq!(restarted.id, "task-1");
    assert_eq!(
        restarted.source.as_ref().map(|source| &source.block_id),
        Some(&"block-1".to_string())
    );

    let imported = SqliteWorkspace::open_in_memory().expect("open import target");
    imported
        .replace_from_archive(&exported)
        .expect("import archive");
    assert_eq!(
        imported.bootstrap().expect("bootstrap").tasks,
        exported.tasks
    );
    assert_eq!(
        imported.export_archive(50).expect("re-export"),
        exported,
        "task archive round trip drifted"
    );
}

fn prompt(id: &str, name: &str, built_in_id: Option<&str>, at: i64) -> WorkspacePrompt {
    WorkspacePrompt {
        id: id.into(),
        name: name.into(),
        system_prompt: "Rewrite the text in my own house style.".into(),
        input_shape: skriuw_domain::PromptInputShape::Selection,
        parameters: skriuw_domain::PromptParameters {
            temperature_millis: Some(450),
            max_output_bytes: 65_536,
        },
        built_in_id: built_in_id.map(str::to_owned),
        created_at: at,
        updated_at: at,
    }
}

fn set_prompt(prompt: WorkspacePrompt) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::SetPrompt {
        prompt: Box::new(prompt),
    })
}

#[test]
fn a_user_prompt_is_created_edited_and_deleted() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");

    storage
        .apply_operations(&[set_prompt(prompt("prompt-1", "Standup", None, 10))])
        .expect("create the prompt");
    assert_eq!(
        storage.bootstrap().expect("bootstrap").prompts,
        vec![prompt("prompt-1", "Standup", None, 10)]
    );

    let mut edited = prompt("prompt-1", "Standup summary", None, 10);
    edited.system_prompt = "Three bullets: done, next, blocked.".into();
    edited.updated_at = 20;
    storage
        .apply_operations(&[set_prompt(edited.clone())])
        .expect("edit the prompt");
    assert_eq!(
        storage.bootstrap().expect("bootstrap").prompts,
        vec![edited]
    );

    storage
        .apply_operations(&[op(WorkspaceOperation::DeletePrompt {
            id: "prompt-1".into(),
        })])
        .expect("delete the prompt");
    assert!(storage.bootstrap().expect("bootstrap").prompts.is_empty());

    let missing = storage.apply_operations(&[op(WorkspaceOperation::DeletePrompt {
        id: "prompt-1".into(),
    })]);
    assert!(
        matches!(missing, Err(StorageError::NotFound(id)) if id == "prompt-1"),
        "deleting an absent prompt must fail loudly"
    );
}

#[test]
fn a_built_in_can_be_shadowed_once_and_reset_by_deleting_the_shadow() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");

    storage
        .apply_operations(&[set_prompt(prompt(
            "prompt-1",
            "Rewrite",
            Some("rewrite"),
            10,
        ))])
        .expect("shadow the built-in");

    let second = storage.apply_operations(&[set_prompt(prompt(
        "prompt-2",
        "Rewrite again",
        Some("rewrite"),
        11,
    ))]);
    assert!(
        matches!(second, Err(StorageError::InvalidOperation(message)) if message.contains("already customised")),
        "a built-in cannot be customised twice"
    );

    let rehomed = storage.apply_operations(&[set_prompt(prompt(
        "prompt-1",
        "Rewrite",
        Some("improve"),
        12,
    ))]);
    assert!(
        matches!(rehomed, Err(StorageError::InvalidOperation(message)) if message.contains("cannot change which built-in")),
        "an edit cannot move a shadow onto another built-in"
    );

    storage
        .apply_operations(&[op(WorkspaceOperation::DeletePrompt {
            id: "prompt-1".into(),
        })])
        .expect("reset the built-in");
    assert!(storage.bootstrap().expect("bootstrap").prompts.is_empty());

    storage
        .apply_operations(&[set_prompt(prompt(
            "prompt-3",
            "Rewrite",
            Some("rewrite"),
            13,
        ))])
        .expect("the built-in can be customised again after a reset");
}

#[test]
fn prompts_survive_restart_and_archive_round_trip() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("prompts-restart.db");
    let exported = {
        let storage = SqliteWorkspace::open(&path).expect("open database");
        storage
            .apply_operations(&[
                set_prompt(prompt("prompt-shadow", "Rewrite", Some("rewrite"), 10)),
                set_prompt(prompt("prompt-own", "Standup", None, 11)),
            ])
            .expect("create prompts");
        storage.export_archive(50).expect("export archive")
    };

    let reopened = SqliteWorkspace::open(&path).expect("reopen database");
    let restarted = reopened.bootstrap().expect("bootstrap").prompts;
    assert_eq!(
        restarted
            .iter()
            .map(|prompt| prompt.id.as_str())
            .collect::<Vec<_>>(),
        vec!["prompt-shadow", "prompt-own"]
    );
    assert_eq!(
        restarted[0].built_in_id.as_deref(),
        Some("rewrite"),
        "the shadow link must survive a restart"
    );

    let imported = SqliteWorkspace::open_in_memory().expect("open import target");
    imported
        .replace_from_archive(&exported)
        .expect("import archive");
    assert_eq!(
        imported.bootstrap().expect("bootstrap").prompts,
        exported.prompts
    );
    assert_eq!(
        imported.export_archive(50).expect("re-export"),
        exported,
        "prompt archive round trip drifted"
    );
}
