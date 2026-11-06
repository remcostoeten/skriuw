use super::*;

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
    assert!(superseded_rows(&storage).is_empty());
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
fn pending_local_write_supersedes_the_remote_body_and_survives_restart() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("document-superseded.db");
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
        assert_eq!(
            outcomes,
            vec![superseded(SyncConflictReason::ConcurrentDocumentVersion)]
        );
    }

    let storage = SqliteWorkspace::open(&path).expect("reopen database");
    let document = document_of(&storage, "note-fork");
    assert_eq!(
        document.revision, 2,
        "local wins keeps the canonical revision"
    );
    assert_eq!(document.markdown, "local offline body");
    assert_eq!(
        superseded_rows(&storage),
        vec![("remote-fork".into(), "concurrent_document_version".into())]
    );
    let preserved = history_rows(&storage, "note-fork");
    assert!(preserved.contains(&(2, "remote offline body".into(), "superseded".into())));
    assert!(preserved.contains(&(2, "local offline body".into(), "local".into())));
}

#[test]
fn remote_write_above_the_head_replaces_the_local_body() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-remote-wins")])
        .expect("local note");
    storage
        .apply_operations(&[save_document(
            "note-remote-wins",
            1,
            "local body before push",
            12,
        )])
        .expect("local save");
    connect_at_cursor(&storage, 0);
    let pushed_through = push_all(&storage, 1);

    let outcomes = storage
        .apply_remote_operations(
            &[remote_save(
                "remote-newer",
                pushed_through + 1,
                "note-remote-wins",
                7,
                "remote newer body",
            )],
            30,
        )
        .expect("apply newer remote save");
    assert!(matches!(outcomes[0], RemoteSyncApplyOutcome::Applied(_)));
    let document = document_of(&storage, "note-remote-wins");
    assert_eq!(document.markdown, "remote newer body");
    assert_eq!(
        document.revision, 3,
        "the remote revision counter is rebased onto the local one"
    );
    assert!(history_rows(&storage, "note-remote-wins").contains(&(
        3,
        "remote newer body".into(),
        "remote".into()
    )));
    assert!(superseded_rows(&storage).is_empty());
}

#[test]
fn ack_before_echo_window_keeps_the_write_with_the_greater_sequence() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    connect_at_cursor(&storage, 0);
    storage
        .apply_remote_operations(
            &[remote(
                "remote-create",
                "device-remote",
                1,
                1,
                WorkspaceOperation::CreateNote {
                    id: "note-window".into(),
                    title: "Window".into(),
                    placement: NodePlacement::last(None),
                    document_json: json!({"type": "doc", "content": []}),
                    markdown: "shared base".into(),
                    at: 5,
                },
            )],
            10,
        )
        .expect("shared base arrives");
    storage
        .apply_operations(&[save_document("note-window", 1, "local edit", 12)])
        .expect("local edit");
    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending local edit");
    let local_operation_id = batch.request.operations[0].operation_id.clone();
    storage
        .acknowledge_sync_operations(
            "sync-worker",
            &[SyncAcceptedOperation {
                operation_id: local_operation_id,
                client_sequence: 1,
                server_sequence: 3,
            }],
        )
        .expect("server accepted the local edit at sequence 3");

    let outcomes = storage
        .apply_remote_operations(
            &[remote_save(
                "remote-older",
                2,
                "note-window",
                1,
                "remote edit",
            )],
            20,
        )
        .expect("older remote write arrives after the acknowledgement");
    assert_eq!(
        outcomes,
        vec![superseded(SyncConflictReason::ConcurrentDocumentVersion)],
        "sequence 2 loses to the acknowledged local write at sequence 3"
    );
    assert_eq!(document_of(&storage, "note-window").markdown, "local edit");
    assert!(
        history_rows(&storage, "note-window")
            .iter()
            .any(
                |(_, markdown, provenance)| markdown == "remote edit" && provenance == "superseded"
            )
    );

    let peer = SqliteWorkspace::open_in_memory().expect("open peer database");
    peer.connect_sync(&NewSyncConnection {
        workspace_id: "workspace-1".into(),
        device_id: "device-peer".into(),
        connected_at: 10,
        observed_server_sequence: 0,
    })
    .expect("connect peer");
    let log = [
        remote(
            "remote-create",
            "device-remote",
            1,
            1,
            WorkspaceOperation::CreateNote {
                id: "note-window".into(),
                title: "Window".into(),
                placement: NodePlacement::last(None),
                document_json: json!({"type": "doc", "content": []}),
                markdown: "shared base".into(),
                at: 5,
            },
        ),
        remote_save("remote-older", 2, "note-window", 1, "remote edit"),
        remote(
            "local-from-device-1",
            "device-1",
            1,
            3,
            WorkspaceOperation::SaveDocument {
                note_id: "note-window".into(),
                document_json: json!({"type": "doc", "revision": 2}),
                markdown: "local edit".into(),
                word_count: 2,
                expected_revision: 1,
                at: 12,
            },
        ),
    ];
    peer.apply_remote_operations(&log, 30)
        .expect("peer replays the log in server order");
    assert_eq!(
        document_of(&peer, "note-window").markdown,
        "local edit",
        "both devices converge on the write with the greater server sequence"
    );
}

#[test]
fn a_blocked_local_document_write_counts_as_pending() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-parked")])
        .expect("local note");
    connect_at_cursor(&storage, 0);
    push_all(&storage, 1);
    storage
        .apply_operations(&[save_document("note-parked", 1, "parked local body", 12)])
        .expect("local save");
    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending save");
    storage
        .block_claimed_sync_operations(
            "sync-worker",
            &[batch.request.operations[0].operation_id.clone()],
            "cloud_rejected",
        )
        .expect("park the save");
    assert!(
        storage.has_pending_sync_operations().expect("pending"),
        "an unresolved blocked row counts as pending local work"
    );

    let outcomes = storage
        .apply_remote_operations(
            &[remote_save(
                "remote-vs-parked",
                2,
                "note-parked",
                1,
                "remote body",
            )],
            30,
        )
        .expect("remote save against a parked local write");
    assert_eq!(
        outcomes,
        vec![superseded(SyncConflictReason::ConcurrentDocumentVersion)]
    );
    assert_eq!(
        document_of(&storage, "note-parked").markdown,
        "parked local body"
    );
}

fn sealed_payload_of(storage: &SqliteWorkspace, note_id: &str) -> skriuw_domain::SealedPayload {
    let connection = storage.lock().expect("database lock");
    crate::lock::sealed_row(&connection, note_id)
        .expect("read sealed row")
        .expect("note is sealed")
        .sealed
}

fn document_head_of(storage: &SqliteWorkspace, note_id: &str) -> Option<i64> {
    let connection = storage.lock().expect("database lock");
    connection
        .query_row(
            "SELECT server_sequence FROM sync_document_heads WHERE note_id = ?1",
            [note_id],
            |row| row.get(0),
        )
        .ok()
}

fn opened_markdown(storage: &SqliteWorkspace, note_id: &str) -> String {
    storage
        .read_locked_documents(Some(&[note_id.to_owned()]))
        .expect("read locked documents")
        .pop()
        .expect("locked document")
        .markdown
}

fn synced_locked_note(
    storage: &SqliteWorkspace,
    note_id: &str,
) -> (skriuw_domain::SealedPayload, u64) {
    storage
        .apply_operations(&[create_note(note_id)])
        .expect("local note");
    storage
        .configure_note_lock(
            ConfigureNoteLockRequest {
                kind: NoteLockKind::Pin,
                secret: "2468".into(),
                hint: None,
                entropy: vec![7; NOTE_LOCK_CONFIGURE_ENTROPY_BYTES],
            },
            10,
        )
        .expect("configure note lock");
    connect_at_cursor(storage, 0);
    storage
        .apply_operations(&[op(WorkspaceOperation::SetNodeLocked {
            id: note_id.into(),
            locked: true,
            at: 20,
        })])
        .expect("lock note");
    let pushed_through = push_all(storage, 1);
    (sealed_payload_of(storage, note_id), pushed_through)
}

fn remote_sealed_save(
    operation_id: &str,
    server_sequence: u64,
    note_id: &str,
    sealed: skriuw_domain::SealedPayload,
) -> ReplicatedWorkspaceOperation {
    remote(
        operation_id,
        "device-remote",
        server_sequence,
        server_sequence,
        WorkspaceOperation::SaveSealedDocument {
            note_id: note_id.into(),
            sealed,
            expected_revision: 1,
            at: 25,
        },
    )
}

#[test]
fn an_unsent_sealed_save_supersedes_a_remote_sealed_save() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    let (acknowledged, pushed_through) = synced_locked_note(&storage, "note-sealed");
    storage
        .apply_operations(&[save_document("note-sealed", 2, "revised secret plans", 30)])
        .expect("save while unlocked");
    assert_ne!(sealed_payload_of(&storage, "note-sealed"), acknowledged);

    let incoming = pushed_through + 1;
    let outcomes = storage
        .apply_remote_operations(
            &[remote_sealed_save(
                "remote-sealed",
                incoming,
                "note-sealed",
                acknowledged,
            )],
            40,
        )
        .expect("remote sealed save against an unsent local one");
    assert_eq!(
        outcomes,
        vec![superseded(SyncConflictReason::ConcurrentDocumentVersion)]
    );
    assert_eq!(
        opened_markdown(&storage, "note-sealed"),
        "revised secret plans"
    );
    assert_eq!(
        superseded_rows(&storage),
        vec![("remote-sealed".into(), "concurrent_document_version".into())]
    );
    assert!(
        history_rows(&storage, "note-sealed").is_empty(),
        "a sealed body never reaches history"
    );
    assert_eq!(
        document_head_of(&storage, "note-sealed"),
        Some(incoming as i64)
    );
}

#[test]
fn an_unsent_sealed_save_supersedes_a_remote_plaintext_save_without_history() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    let (_, pushed_through) = synced_locked_note(&storage, "note-sealed");
    storage
        .apply_operations(&[save_document("note-sealed", 2, "revised secret plans", 30)])
        .expect("save while unlocked");

    let outcomes = storage
        .apply_remote_operations(
            &[remote_save(
                "remote-plaintext",
                pushed_through + 1,
                "note-sealed",
                1,
                "remote plaintext body",
            )],
            40,
        )
        .expect("remote plaintext save against an unsent sealed one");
    assert_eq!(
        outcomes,
        vec![superseded(SyncConflictReason::ConcurrentDocumentVersion)]
    );
    assert_eq!(
        opened_markdown(&storage, "note-sealed"),
        "revised secret plans"
    );
    assert!(
        history_rows(&storage, "note-sealed").is_empty(),
        "a locked note keeps no plaintext history"
    );
}

#[test]
fn a_blocked_sealed_save_counts_as_pending() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    let (acknowledged, pushed_through) = synced_locked_note(&storage, "note-sealed");
    storage
        .apply_operations(&[save_document("note-sealed", 2, "parked secret body", 30)])
        .expect("save while unlocked");
    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending sealed save");
    storage
        .block_claimed_sync_operations(
            "sync-worker",
            &[batch.request.operations[0].operation_id.clone()],
            "cloud_rejected",
        )
        .expect("park the sealed save");

    let outcomes = storage
        .apply_remote_operations(
            &[remote_sealed_save(
                "remote-vs-parked",
                pushed_through + 1,
                "note-sealed",
                acknowledged,
            )],
            40,
        )
        .expect("remote sealed save against a parked one");
    assert_eq!(
        outcomes,
        vec![superseded(SyncConflictReason::ConcurrentDocumentVersion)]
    );
    assert_eq!(
        opened_markdown(&storage, "note-sealed"),
        "parked secret body"
    );
}

#[test]
fn an_acknowledged_sealed_save_yields_to_a_newer_remote_sealed_save() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    let (first, locked_through) = synced_locked_note(&storage, "note-sealed");
    let original = opened_markdown(&storage, "note-sealed");
    storage
        .apply_operations(&[save_document("note-sealed", 2, "revised secret plans", 30)])
        .expect("save while unlocked");
    let pushed_through = push_all(&storage, locked_through + 1);
    assert_eq!(
        document_head_of(&storage, "note-sealed"),
        Some(pushed_through as i64)
    );

    let outcomes = storage
        .apply_remote_operations(
            &[remote_sealed_save(
                "remote-newer-sealed",
                pushed_through + 1,
                "note-sealed",
                first,
            )],
            40,
        )
        .expect("newer remote sealed save");
    assert!(matches!(outcomes[0], RemoteSyncApplyOutcome::Applied(_)));
    assert_eq!(opened_markdown(&storage, "note-sealed"), original);
    assert!(superseded_rows(&storage).is_empty());
    assert_eq!(
        document_head_of(&storage, "note-sealed"),
        Some(pushed_through as i64 + 1)
    );
}

#[test]
fn requeued_blocked_document_write_carries_the_canonical_body() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-requeue")])
        .expect("local note");
    connect_at_cursor(&storage, 0);
    push_all(&storage, 1);
    storage
        .apply_operations(&[save_document("note-requeue", 1, "first parked body", 12)])
        .expect("first local save");
    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending save");
    storage
        .block_claimed_sync_operations(
            "sync-worker",
            &[batch.request.operations[0].operation_id.clone()],
            "cloud_rejected",
        )
        .expect("park the save");
    storage
        .apply_operations(&[save_document("note-requeue", 2, "newer local body", 13)])
        .expect("later local save");
    push_all(&storage, 2);
    let blocked_id = storage.sync_recovery_view().expect("view").blocked[0]
        .blocked_id
        .clone();

    storage
        .retry_blocked_sync_operation(&blocked_id, 500)
        .expect("retry the parked save");

    let batch = storage
        .claim_sync_operations("sync-worker", 600, 50, 64)
        .expect("claim")
        .expect("requeued save");
    match &envelope_of(&batch.request.operations[0]).operation {
        WorkspaceOperation::SaveDocument {
            markdown,
            expected_revision,
            ..
        } => {
            assert_eq!(markdown, "newer local body");
            assert_eq!(*expected_revision, 3);
        }
        other => panic!("expected a save of the canonical body, found {other:?}"),
    }
}

#[test]
fn a_superseded_body_keeps_images_and_task_links_untouched() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_note("note-media-safe"),
            attach_image("image-safe", "note-media-safe", 'c'),
        ])
        .expect("note with image");
    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-media-safe".into(),
            document_json: json!({"type": "doc", "content": [
                {"type": "image_ref", "attrs": {"id": "image-safe", "alt": ""}}
            ]}),
            markdown: "![](images/image-safe)".into(),
            word_count: 0,
            expected_revision: 1,
            at: 12,
        })])
        .expect("local save referencing the image");
    connect_at_cursor(&storage, 0);

    let outcomes = storage
        .apply_remote_operations(
            &[remote_save(
                "remote-drop-image",
                1,
                "note-media-safe",
                1,
                "remote body without the image",
            )],
            30,
        )
        .expect("remote save loses to the pending local write");
    assert_eq!(
        outcomes,
        vec![superseded(SyncConflictReason::ConcurrentDocumentVersion)]
    );
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.images.len(), 1, "preservation never prunes images");
    assert_eq!(snapshot.documents[0].revision, 2);
    assert!(
        snapshot
            .references
            .iter()
            .all(|references| references.note_id == "note-media-safe"),
        "preservation never rewrites references"
    );
}

#[test]
fn superseded_history_rows_never_coalesce_with_local_rows() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-history")])
        .expect("local note");
    storage
        .apply_operations(&[save_document("note-history", 1, "local burst one", 2)])
        .expect("local save inside the window");
    connect_at_cursor(&storage, 0);
    storage
        .apply_remote_operations(
            &[
                remote_save("remote-lost-1", 1, "note-history", 1, "remote lost one"),
                remote_save("remote-lost-2", 2, "note-history", 1, "remote lost two"),
            ],
            3,
        )
        .expect("two losing remote writes");
    storage
        .apply_operations(&[save_document("note-history", 2, "local burst two", 4)])
        .expect("local save after the superseded rows");

    let rows = history_rows(&storage, "note-history");
    assert_eq!(
        rows,
        vec![
            (2, "local burst one".into(), "local".into()),
            (2, "remote lost one".into(), "superseded".into()),
            (3, "remote lost two".into(), "superseded".into()),
            (3, "local burst two".into(), "local".into()),
        ],
        "a superseded row closes the coalescing window and two losers stay distinct"
    );
    assert_eq!(document_of(&storage, "note-history").revision, 3);
    let claimed = storage
        .claim_history_revision("worker", 10, 1_000)
        .expect("claim")
        .expect("superseded rows are claimable immediately");
    assert_eq!(claimed.provenance, HistoryProvenance::Superseded);
    assert!(claimed.markdown.starts_with("remote lost"));
}

#[test]
fn creating_an_existing_note_keeps_the_record_and_reconciles_the_body() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-twice")])
        .expect("local note");
    connect_at_cursor(&storage, 0);
    let pushed_through = push_all(&storage, 1);
    let recreate = |operation_id: &str, sequence: u64, markdown: &str| {
        remote(
            operation_id,
            "device-remote",
            sequence,
            sequence,
            WorkspaceOperation::CreateNote {
                id: "note-twice".into(),
                title: "Remote title".into(),
                placement: NodePlacement::last(None),
                document_json: json!({"type": "doc", "content": [markdown]}),
                markdown: markdown.into(),
                at: 30,
            },
        )
    };

    let outcomes = storage
        .apply_remote_operations(
            &[recreate(
                "remote-recreate",
                pushed_through + 1,
                "remote body",
            )],
            40,
        )
        .expect("recreate applies as a body write");
    assert!(matches!(outcomes[0], RemoteSyncApplyOutcome::Applied(_)));
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(
        snapshot.nodes[0].title, "Fast notes",
        "node fields keep the first record"
    );
    assert_eq!(snapshot.documents[0].markdown, "remote body");

    storage
        .apply_operations(&[save_document("note-twice", 2, "local pending", 50)])
        .expect("local pending write");
    let outcomes = storage
        .apply_remote_operations(
            &[recreate(
                "remote-recreate-2",
                pushed_through + 2,
                "remote lost body",
            )],
            60,
        )
        .expect("recreate against pending local work");
    assert_eq!(
        outcomes,
        vec![superseded(SyncConflictReason::ConcurrentDocumentVersion)]
    );
    assert_eq!(
        document_of(&storage, "note-twice").markdown,
        "local pending"
    );
    assert!(
        history_rows(&storage, "note-twice")
            .iter()
            .any(|(_, markdown, provenance)| markdown == "remote lost body"
                && provenance == "superseded")
    );
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
    assert_eq!(
        outcomes,
        vec![
            superseded(SyncConflictReason::TombstoneBlocked),
            superseded(SyncConflictReason::TombstoneBlocked),
        ]
    );
    assert!(storage.bootstrap().expect("bootstrap").nodes.is_empty());
    assert_eq!(
        superseded_rows(&storage),
        vec![
            ("remote-delayed-edit".into(), "tombstone_blocked".into()),
            ("remote-stale-recreate".into(), "tombstone_blocked".into()),
        ]
    );
}

#[test]
fn edit_of_trashed_note_applies_and_survives_restore() {
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
    let pushed_through = push_all(&storage, 1);

    let outcomes = storage
        .apply_remote_operations(
            &[remote_save(
                "remote-trash-edit",
                pushed_through + 1,
                "note-trashed",
                1,
                "edited while trashed",
            )],
            30,
        )
        .expect("apply edit");
    assert!(matches!(outcomes[0], RemoteSyncApplyOutcome::Applied(_)));
    let document = document_of(&storage, "note-trashed");
    assert_eq!(document.markdown, "edited while trashed");
    assert!(
        storage.bootstrap().expect("bootstrap").nodes[0]
            .deleted_at
            .is_some(),
        "the body converges without touching tree state"
    );
    assert!(storage.search("edited", 10).expect("search").is_empty());

    storage
        .apply_operations(&[op(WorkspaceOperation::RestoreSubtree {
            root_id: "note-trashed".into(),
            placement: NodePlacement::last(None),
            at: 40,
        })])
        .expect("restore note");
    assert_eq!(storage.search("edited", 10).expect("search").len(), 1);
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
    assert!(superseded_rows(&storage).is_empty());
}

#[test]
fn concurrent_create_identity_collision_keeps_the_first_record() {
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
    assert_eq!(
        outcomes[1],
        superseded(SyncConflictReason::IdentityConflict)
    );
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.tags[0].name, "Local");
    assert_eq!(
        superseded_rows(&storage),
        vec![("remote-divergent-create".into(), "identity_conflict".into())]
    );
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
    assert_eq!(
        outcomes[0],
        superseded(SyncConflictReason::TombstoneBlocked)
    );
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

    assert_eq!(received_rows(&batched), received_rows(&stepped));
    assert_eq!(
        history_rows(&batched, "note-replay"),
        history_rows(&stepped, "note-replay")
    );

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
fn portable_export_succeeds_after_a_superseded_write() {
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
        .expect("superseded save");

    let archive = storage
        .export_archive(100)
        .expect("export never fails closed");
    assert_eq!(archive.documents[0].markdown, "local body");
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

#[test]
fn concurrent_valid_moves_take_the_later_placement_in_server_order() {
    let log = [
        remote_folder("s9-p", 1, "folder-p", None),
        remote_folder("s9-q", 2, "folder-q", None),
        remote_note("s9-x", 3, "note-x", None, "moved"),
        remote_move("s9-move-p", 4, "note-x", Some("folder-p")),
        remote_move("s9-move-q", 5, "note-x", Some("folder-q")),
    ];
    let batched = connected_fresh();
    let outcomes = batched
        .apply_remote_operations(&log, 10)
        .expect("apply as one batch");
    assert!(
        outcomes
            .iter()
            .all(|outcome| matches!(outcome, RemoteSyncApplyOutcome::Applied(_)))
    );
    assert_eq!(parent_of(&batched, "note-x").as_deref(), Some("folder-q"));

    let stepped = connected_fresh();
    for operation in &log {
        stepped
            .apply_remote_operations(std::slice::from_ref(operation), 10)
            .expect("apply one operation");
    }
    assert_eq!(
        batched.bootstrap().expect("batched"),
        stepped.bootstrap().expect("stepped")
    );
}

#[test]
fn move_against_a_deleted_parent_keeps_the_last_valid_placement() {
    let storage = connected_fresh();
    let outcomes = storage
        .apply_remote_operations(
            &[
                remote_folder("s10-p", 1, "folder-p", None),
                remote_folder("s10-q", 2, "folder-q", None),
                remote_note("s10-x", 3, "note-x", Some("folder-q"), "stays"),
                remote_trash("s10-trash-p", 4, "folder-p"),
                remote_move("s10-move-trashed", 5, "note-x", Some("folder-p")),
                remote(
                    "s10-purge-p",
                    "device-remote",
                    6,
                    6,
                    WorkspaceOperation::PurgeSubtree {
                        root_id: "folder-p".into(),
                        trashed_before: 10,
                    },
                ),
                remote_move("s10-move-purged", 7, "note-x", Some("folder-p")),
            ],
            10,
        )
        .expect("apply the log");
    assert_eq!(outcomes[4], superseded(SyncConflictReason::TreeConflict));
    assert_eq!(
        outcomes[6],
        superseded(SyncConflictReason::TombstoneBlocked)
    );
    assert_eq!(parent_of(&storage, "note-x").as_deref(), Some("folder-q"));
    assert_eq!(
        storage
            .sync_connection()
            .expect("connection")
            .expect("active")
            .observed_server_sequence,
        7
    );
    assert_eq!(
        superseded_rows(&storage),
        vec![
            ("s10-move-trashed".into(), "tree_conflict".into()),
            ("s10-move-purged".into(), "tombstone_blocked".into()),
        ]
    );
}

#[test]
fn crossed_moves_keep_the_first_valid_placement_and_stay_acyclic() {
    let storage = connected_fresh();
    let outcomes = storage
        .apply_remote_operations(
            &[
                remote_folder("s11-a", 1, "folder-a", None),
                remote_folder("s11-b", 2, "folder-b", None),
                remote_move("s11-a-under-b", 3, "folder-a", Some("folder-b")),
                remote_move("s11-b-under-a", 4, "folder-b", Some("folder-a")),
            ],
            10,
        )
        .expect("apply the log");
    assert!(matches!(outcomes[2], RemoteSyncApplyOutcome::Applied(_)));
    assert_eq!(outcomes[3], superseded(SyncConflictReason::TreeConflict));
    assert_eq!(parent_of(&storage, "folder-a").as_deref(), Some("folder-b"));
    assert_eq!(parent_of(&storage, "folder-b"), None);
}

#[test]
fn restore_into_a_deleted_destination_leaves_the_subtree_trashed() {
    let storage = connected_fresh();
    let restore = |operation_id: &str, sequence: u64, parent: Option<&str>| {
        remote(
            operation_id,
            "device-remote",
            sequence,
            sequence,
            WorkspaceOperation::RestoreSubtree {
                root_id: "note-x".into(),
                placement: NodePlacement::last(parent.map(str::to_owned)),
                at: sequence as i64,
            },
        )
    };
    let outcomes = storage
        .apply_remote_operations(
            &[
                remote_folder("s13-d", 1, "folder-d", None),
                remote_note("s13-x", 2, "note-x", None, "trashed"),
                remote_trash("s13-trash-x", 3, "note-x"),
                remote_trash("s13-trash-d", 4, "folder-d"),
                restore("s13-restore-lost", 5, Some("folder-d")),
                restore("s13-restore-root", 6, None),
            ],
            10,
        )
        .expect("apply the log");
    assert_eq!(outcomes[4], superseded(SyncConflictReason::TreeConflict));
    assert!(matches!(outcomes[5], RemoteSyncApplyOutcome::Applied(_)));
    let nodes = storage.bootstrap().expect("bootstrap").nodes;
    let note = nodes.iter().find(|node| node.id == "note-x").expect("note");
    assert_eq!(note.deleted_at, None);
    assert_eq!(note.parent_id, None);
}

#[test]
fn property_remove_outranks_a_later_edit_and_reorder() {
    let storage = connected_fresh();
    let set = |operation_id: &str, sequence: u64, name: &str| {
        let mut property = text_property("note-x", "property-p", 0);
        property.field.name = name.into();
        remote(
            operation_id,
            "device-remote",
            sequence,
            sequence,
            WorkspaceOperation::SetNoteProperty {
                property,
                at: sequence as i64,
            },
        )
    };
    let outcomes = storage
        .apply_remote_operations(
            &[
                remote_note("s15-x", 1, "note-x", None, "properties"),
                set("s15-set", 2, "Owner"),
                remote(
                    "s15-remove",
                    "device-remote",
                    3,
                    3,
                    WorkspaceOperation::RemoveNoteProperty {
                        note_id: "note-x".into(),
                        property_id: "property-p".into(),
                        at: 3,
                    },
                ),
                set("s15-edit", 4, "Renamed owner"),
                remote(
                    "s15-reorder",
                    "device-remote",
                    5,
                    5,
                    WorkspaceOperation::ReorderNoteProperties {
                        note_id: "note-x".into(),
                        ordered_property_ids: vec!["property-p".into()],
                        at: 5,
                    },
                ),
            ],
            10,
        )
        .expect("apply the log");
    assert_eq!(
        outcomes[3],
        superseded(SyncConflictReason::TombstoneBlocked)
    );
    assert_eq!(
        outcomes[4],
        superseded(SyncConflictReason::CollectionConflict)
    );
    assert!(
        storage
            .bootstrap()
            .expect("bootstrap")
            .properties
            .is_empty()
    );
}

#[test]
fn template_updates_commute_and_the_last_writer_wins() {
    let storage = connected_fresh();
    let template = |operation_id: &str, sequence: u64, id: &str, name: &str, position: i64| {
        remote(
            operation_id,
            "device-remote",
            sequence,
            sequence,
            WorkspaceOperation::SetNotePropertyTemplate {
                template: NotePropertyTemplate {
                    id: id.into(),
                    name: name.into(),
                    position,
                    properties: Vec::new(),
                },
            },
        )
    };
    let outcomes = storage
        .apply_remote_operations(
            &[
                template("s16-t1", 1, "template-1", "One", 0),
                template("s16-t2", 2, "template-2", "Two", 1),
                template("s16-t1-a", 3, "template-1", "One from A", 0),
                template("s16-t2-b", 4, "template-2", "Two from B", 1),
                template("s16-t1-b", 5, "template-1", "One from B", 0),
            ],
            10,
        )
        .expect("apply the log");
    assert!(
        outcomes
            .iter()
            .all(|outcome| matches!(outcome, RemoteSyncApplyOutcome::Applied(_)))
    );
    let templates = storage.bootstrap().expect("bootstrap").property_templates;
    assert_eq!(
        templates
            .iter()
            .map(|template| (
                template.id.as_str(),
                template.name.as_str(),
                template.position
            ))
            .collect::<Vec<_>>(),
        vec![
            ("template-1", "One from B", 0),
            ("template-2", "Two from B", 1)
        ]
    );
}
