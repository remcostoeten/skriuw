use super::*;

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
fn release_sync_claims_before_frees_only_old_claims_of_the_worker() {
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
    assert!(
        storage
            .claim_sync_operations("w", 100, 30_000, 64)
            .expect("claim")
            .is_some()
    );
    assert!(
        storage
            .claim_sync_operations("w", 201, 30_000, 64)
            .expect("claim within lease")
            .is_none()
    );

    assert_eq!(
        storage
            .release_sync_claims_before("other", 200)
            .expect("release another worker"),
        0
    );
    assert_eq!(
        storage
            .release_sync_claims_before("w", 100)
            .expect("release newer claims"),
        0
    );
    assert_eq!(
        storage
            .release_sync_claims_before("w", 200)
            .expect("release old claims"),
        1
    );
    assert!(
        storage
            .claim_sync_operations("w", 201, 30_000, 64)
            .expect("reclaim")
            .is_some()
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

#[derive(Debug)]
struct OutboxRow {
    operation_id: String,
    client_sequence: i64,
    operation_type: String,
    target_note_id: Option<String>,
    operation_json: String,
}

fn outbox_rows(storage: &SqliteWorkspace) -> Vec<OutboxRow> {
    let connection = storage.lock().expect("database lock");
    let mut statement = connection
        .prepare(
            "SELECT operation_id, client_sequence, \
             json_extract(operation_json, '$.operation.type'), target_note_id, operation_json \
             FROM sync_outbox ORDER BY client_sequence",
        )
        .expect("prepare outbox query");
    statement
        .query_map([], |row| {
            Ok(OutboxRow {
                operation_id: row.get(0)?,
                client_sequence: row.get(1)?,
                operation_type: row.get(2)?,
                target_note_id: row.get(3)?,
                operation_json: row.get(4)?,
            })
        })
        .expect("query outbox rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect outbox rows")
}

fn outbox_types(storage: &SqliteWorkspace) -> Vec<String> {
    outbox_rows(storage)
        .into_iter()
        .map(|row| row.operation_type)
        .collect()
}

fn next_client_sequence(storage: &SqliteWorkspace) -> u64 {
    storage
        .sync_connection()
        .expect("connection")
        .expect("active connection")
        .next_client_sequence
}

fn apply_one(storage: &SqliteWorkspace, envelope: WorkspaceOperationEnvelope) {
    storage
        .apply_operations(&[envelope])
        .expect("apply local operation");
}

fn offline_diagnostic() -> Diagnostic {
    Diagnostic::new(
        DiagnosticContext::Sync,
        DiagnosticCategory::Unavailable,
        "offline",
    )
}

#[test]
fn consecutive_unsent_saves_coalesce_into_one_row() {
    let storage = connected_fresh();
    let start = next_client_sequence(&storage);
    apply_one(&storage, create_note("note-typing"));
    apply_one(&storage, save_document("note-typing", 1, "first draft", 20));
    let first_save = outbox_rows(&storage).pop().expect("first save row");
    apply_one(
        &storage,
        save_document("note-typing", 2, "second draft", 21),
    );
    apply_one(&storage, save_document("note-typing", 3, "third draft", 22));

    let rows = outbox_rows(&storage);
    assert_eq!(rows.len(), 2, "create plus one save");
    assert_eq!(rows[0].operation_type, "create_note");
    assert_eq!(rows[1].operation_type, "save_document");
    assert_eq!(rows[1].operation_id, first_save.operation_id);
    assert_eq!(rows[1].client_sequence, first_save.client_sequence);
    assert_eq!(rows[1].client_sequence, rows[0].client_sequence + 1);
    assert!(rows[1].operation_json.contains("third draft"));
    assert_eq!(rows[1].target_note_id.as_deref(), Some("note-typing"));
    assert_eq!(next_client_sequence(&storage), start + 2);

    let batch = storage
        .claim_sync_operations("sync-worker", 100, 30_000, 64)
        .expect("claim")
        .expect("pending batch");
    let WorkspaceOperation::SaveDocument {
        markdown,
        expected_revision,
        ..
    } = &envelope_of(&batch.request.operations[1]).operation
    else {
        panic!("second queued operation is the save");
    };
    assert_eq!(markdown, "third draft");
    assert_eq!(*expected_revision, 3);
}

#[test]
fn claimed_saves_are_never_coalesced() {
    let storage = connected_fresh();
    apply_one(&storage, create_note("note-claimed"));
    apply_one(
        &storage,
        save_document("note-claimed", 1, "first draft", 20),
    );
    storage
        .claim_sync_operations("w", 100, 30_000, 64)
        .expect("claim")
        .expect("pending batch");
    apply_one(
        &storage,
        save_document("note-claimed", 2, "second draft", 21),
    );

    assert_eq!(
        outbox_types(&storage),
        vec!["create_note", "save_document", "save_document"]
    );
}

#[test]
fn released_saves_are_never_coalesced() {
    let storage = connected_fresh();
    apply_one(&storage, create_note("note-released"));
    apply_one(
        &storage,
        save_document("note-released", 1, "first draft", 20),
    );
    let first_json = outbox_rows(&storage)
        .pop()
        .expect("save row")
        .operation_json;
    let batch = storage
        .claim_sync_operations("w", 100, 30_000, 64)
        .expect("claim")
        .expect("pending batch");
    let ids = batch
        .request
        .operations
        .iter()
        .map(|operation| operation.operation_id.clone())
        .collect::<Vec<_>>();
    storage
        .release_sync_operations("w", &ids, 200, &offline_diagnostic())
        .expect("release for retry");
    apply_one(
        &storage,
        save_document("note-released", 2, "second draft", 21),
    );

    let rows = outbox_rows(&storage);
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[1].operation_json, first_json);
    assert!(rows[2].operation_json.contains("second draft"));
}

#[test]
fn saves_of_different_notes_do_not_coalesce() {
    let storage = connected_fresh();
    apply_one(&storage, create_note("note-a"));
    apply_one(&storage, create_note("note-b"));
    apply_one(&storage, save_document("note-a", 1, "a one", 20));
    apply_one(&storage, save_document("note-b", 1, "b one", 21));
    apply_one(&storage, save_document("note-a", 2, "a two", 22));

    let saves = outbox_rows(&storage)
        .into_iter()
        .filter(|row| row.operation_type == "save_document")
        .map(|row| row.target_note_id.expect("save target"))
        .collect::<Vec<_>>();
    assert_eq!(saves, vec!["note-a", "note-b", "note-a"]);
}

#[test]
fn a_save_after_another_operation_appends() {
    let storage = connected_fresh();
    apply_one(&storage, create_note("note-a"));
    apply_one(&storage, save_document("note-a", 1, "a one", 20));
    apply_one(
        &storage,
        op(WorkspaceOperation::RenameNode {
            id: "note-a".into(),
            title: "Renamed".into(),
            at: 21,
        }),
    );
    apply_one(&storage, save_document("note-a", 2, "a two", 22));

    let rows = outbox_rows(&storage);
    assert_eq!(
        rows.iter()
            .map(|row| row.operation_type.as_str())
            .collect::<Vec<_>>(),
        vec![
            "create_note",
            "save_document",
            "rename_node",
            "save_document"
        ]
    );
    assert!(
        rows.windows(2)
            .all(|pair| pair[1].client_sequence == pair[0].client_sequence + 1)
    );
    assert!(rows[1].operation_json.contains("a one"));
    assert!(rows[3].operation_json.contains("a two"));
}

#[test]
fn coalesced_save_keeps_local_write_pending() {
    let storage = connected_fresh();
    apply_one(&storage, create_note("note-pending"));
    let pushed_through = push_all(&storage, 1);
    apply_one(
        &storage,
        save_document("note-pending", 1, "local first", 20),
    );
    apply_one(
        &storage,
        save_document("note-pending", 2, "local second", 21),
    );
    assert_eq!(outbox_types(&storage), vec!["save_document"]);

    let outcomes = storage
        .apply_remote_operations(
            &[remote(
                "remote-save",
                "device-remote",
                1,
                pushed_through + 1,
                WorkspaceOperation::SaveDocument {
                    note_id: "note-pending".into(),
                    document_json: json!({"type": "doc", "content": []}),
                    markdown: "remote body".into(),
                    word_count: 2,
                    expected_revision: 1,
                    at: 30,
                },
            )],
            40,
        )
        .expect("apply remote save");
    assert_eq!(
        outcomes,
        vec![superseded(SyncConflictReason::ConcurrentDocumentVersion)]
    );
    assert_eq!(
        superseded_rows(&storage),
        vec![("remote-save".into(), "concurrent_document_version".into())]
    );
    assert_eq!(
        document_of(&storage, "note-pending").markdown,
        "local second"
    );
}

#[test]
fn failed_batch_rolls_back_a_coalesced_save() {
    let storage = connected_fresh();
    apply_one(&storage, create_note("note-rollback"));
    apply_one(
        &storage,
        save_document("note-rollback", 1, "kept draft", 20),
    );
    let before = outbox_rows(&storage)
        .pop()
        .expect("save row")
        .operation_json;
    let sequence_before = next_client_sequence(&storage);

    storage
        .apply_operations(&[
            save_document("note-rollback", 2, "discarded draft", 21),
            save_document("note-rollback", 2, "stale revision", 22),
        ])
        .expect_err("stale revision fails the batch");

    let rows = outbox_rows(&storage);
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[1].operation_json, before);
    assert_eq!(next_client_sequence(&storage), sequence_before);
}

#[test]
fn coalescing_continues_after_restart() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("coalesce-restart.db");
    {
        let storage = SqliteWorkspace::open(&path).expect("open database");
        connect_at_cursor(&storage, 0);
        apply_one(&storage, create_note("note-restart"));
        apply_one(
            &storage,
            save_document("note-restart", 1, "before restart", 20),
        );
    }

    let storage = SqliteWorkspace::open(&path).expect("reopen database");
    apply_one(
        &storage,
        save_document("note-restart", 2, "after restart", 21),
    );

    let rows = outbox_rows(&storage);
    assert_eq!(rows.len(), 2);
    assert!(rows[1].operation_json.contains("after restart"));
}

#[test]
fn fresh_connect_purges_sync_state_left_by_an_incomplete_teardown() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect(&storage);
    storage
        .apply_operations(&[create_placed_note(
            "note-old-epoch",
            NodePlacement::last(None),
            11,
        )])
        .expect("enqueue old-epoch operations");
    {
        let connection = storage.lock().expect("database lock");
        connection
            .execute_batch("DELETE FROM sync_connection;")
            .expect("simulate incomplete teardown");
    }

    connect_at_cursor(&storage, 0);

    let sequences: Vec<i64> = {
        let connection = storage.lock().expect("database lock");
        let mut statement = connection
            .prepare("SELECT client_sequence FROM sync_outbox ORDER BY client_sequence")
            .expect("prepare");
        statement
            .query_map([], |row| row.get(0))
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("rows")
    };
    assert!(!sequences.is_empty(), "fresh connect enqueues the snapshot");
    assert_eq!(
        sequences,
        (1..=sequences.len() as i64).collect::<Vec<_>>(),
        "outbox restarts contiguously from 1 with no stale rows"
    );

    storage
        .apply_operations(&[create_placed_note(
            "note-new-epoch",
            NodePlacement::last(None),
            12,
        )])
        .expect("post-reconnect operations enqueue without sequence collisions");
    let connection = storage
        .sync_connection()
        .expect("connection")
        .expect("active connection");
    assert_eq!(connection.next_client_sequence, sequences.len() as u64 + 2);
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
fn retry_delay_is_reported_and_cleared_by_an_explicit_refresh() {
    let storage = connected_fresh();
    assert_eq!(storage.next_sync_attempt_at().expect("idle"), None);
    storage
        .apply_operations(&[folder("folder-retry", "Retry", 11)])
        .expect("queue local work");
    assert_eq!(storage.next_sync_attempt_at().expect("immediate"), Some(0));
    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending batch");
    assert_eq!(
        storage
            .next_sync_attempt_at()
            .expect("claimed rows are not waiting"),
        None
    );
    storage
        .release_sync_operations(
            "sync-worker",
            &[batch.request.operations[0].operation_id.clone()],
            5_000,
            &Diagnostic::new(
                DiagnosticContext::Sync,
                DiagnosticCategory::Unavailable,
                "offline",
            ),
        )
        .expect("release with retry");
    assert_eq!(
        storage.next_sync_attempt_at().expect("delayed"),
        Some(5_000)
    );
    assert!(
        storage
            .claim_sync_operations("sync-worker", 200, 50, 64)
            .expect("claim")
            .is_none()
    );

    assert_eq!(storage.reset_sync_retry_times(200).expect("reset"), 1);
    assert_eq!(storage.next_sync_attempt_at().expect("cleared"), Some(0));
    assert!(
        storage
            .claim_sync_operations("sync-worker", 200, 50, 64)
            .expect("claim after reset")
            .is_some()
    );
    assert_eq!(
        storage.reset_sync_retry_times(200).expect("nothing left"),
        0
    );
}
