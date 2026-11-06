use super::*;

fn own_operations(storage: &SqliteWorkspace) -> Vec<ReplicatedWorkspaceOperation> {
    let connection = storage.lock().expect("database lock");
    let mut statement = connection
        .prepare(
            "SELECT operation_id, device_id, client_sequence, base_server_sequence, \
             server_sequence, operation_json FROM sync_received_operations \
             WHERE outcome = 'local_echo' ORDER BY server_sequence",
        )
        .expect("prepare echo query");
    statement
        .query_map([], |row| {
            let operation_json = row.get::<_, String>(5)?;
            let envelope: WorkspaceOperationEnvelope =
                serde_json::from_str(&operation_json).expect("stored envelope");
            Ok(ReplicatedWorkspaceOperation {
                operation_id: row.get(0)?,
                device_id: row.get(1)?,
                client_sequence: row.get::<_, i64>(2)? as u64,
                base_server_sequence: row.get::<_, i64>(3)? as u64,
                server_sequence: row.get::<_, i64>(4)? as u64,
                payload: SyncOperationPayload::inline(envelope),
            })
        })
        .expect("query echoes")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect echoes")
}

#[test]
fn hydration_refuses_work_queued_by_another_connection_inside_its_transaction() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("hydration-race.db");
    let first = SqliteWorkspace::open(&path).expect("open first connection");
    let second = SqliteWorkspace::open(&path).expect("open second connection");
    connect_at_cursor(&first, 0);
    assert!(!first.has_pending_sync_operations().expect("pending"));
    let archive = SqliteWorkspace::open_in_memory()
        .expect("open database")
        .export_archive(5)
        .expect("export archive");

    second
        .apply_operations(&[folder("folder-raced", "Raced", 11)])
        .expect("second connection queues local work between check and hydrate");

    let error = first
        .hydrate_from_checkpoint(&archive, 3)
        .expect_err("the in-transaction precondition sees the new outbox row");
    assert!(matches!(error, StorageError::InvalidOperation(_)));
    assert_eq!(first.bootstrap().expect("bootstrap").nodes.len(), 1);
    assert_eq!(
        first
            .sync_connection()
            .expect("connection")
            .expect("active")
            .observed_server_sequence,
        0
    );
    assert!(first.has_pending_sync_operations().expect("pending"));
}

#[test]
fn hydration_precondition_covers_pushed_and_blocked_work_at_cursor_zero() {
    let archive = SqliteWorkspace::open_in_memory()
        .expect("open database")
        .export_archive(5)
        .expect("export archive");

    let pushed = connected_fresh();
    pushed
        .apply_operations(&[folder("folder-pushed", "Pushed", 11)])
        .expect("queue local work");
    let batch = pushed
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending batch");
    pushed
        .acknowledge_sync_operations(
            "sync-worker",
            &[SyncAcceptedOperation {
                operation_id: batch.request.operations[0].operation_id.clone(),
                client_sequence: 1,
                server_sequence: 5,
            }],
        )
        .expect("non-contiguous acknowledgement leaves the cursor at zero");
    let connection = pushed
        .sync_connection()
        .expect("connection")
        .expect("active");
    assert_eq!(connection.observed_server_sequence, 0);
    assert_eq!(connection.next_client_sequence, 2);
    assert!(!pushed.has_pending_sync_operations().expect("pending"));
    assert!(matches!(
        pushed.hydrate_from_checkpoint(&archive, 3),
        Err(StorageError::InvalidOperation(_))
    ));
    assert_eq!(pushed.bootstrap().expect("bootstrap").nodes.len(), 1);

    let blocked = connected_fresh();
    block_middle_of_three(&blocked);
    push_all(&blocked, 1);
    let connection = blocked
        .sync_connection()
        .expect("connection")
        .expect("active");
    assert_eq!(connection.observed_server_sequence, 2);
    assert!(blocked.has_pending_sync_operations().expect("pending"));
    assert!(matches!(
        blocked.hydrate_from_checkpoint(&archive, 3),
        Err(StorageError::InvalidOperation(_))
    ));
}

#[test]
fn rehydration_keeps_local_evidence_and_reapplies_own_operations() {
    let storage = connected_fresh();
    storage
        .apply_remote_operations(
            &[remote_note("remote-x", 1, "note-x", None, "shared base")],
            10,
        )
        .expect("shared note arrives");
    storage
        .apply_operations(&[
            save_document("note-x", 1, "own edit", 12),
            op(WorkspaceOperation::CreateTag {
                tag: WorkspaceTag {
                    id: "tag-gone".into(),
                    name: "Gone".into(),
                    color: None,
                    created_at: 13,
                    updated_at: 13,
                    created_in: None,
                },
            }),
            op(WorkspaceOperation::DeleteTag {
                id: "tag-gone".into(),
            }),
            create_placed_note("note-y", NodePlacement::last(None), 14),
        ])
        .expect("local work");
    let pushed_through = push_all(&storage, 2);
    assert_eq!(pushed_through, 5);
    storage
        .apply_operations(&[save_document("note-y", 1, "parked body", 15)])
        .expect("later local save");
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
    let own = own_operations(&storage);
    assert_eq!(own.len(), 4);

    let source = SqliteWorkspace::open_in_memory().expect("open checkpoint source");
    source
        .apply_operations(&[op(WorkspaceOperation::CreateNote {
            id: "note-x".into(),
            title: "note-x".into(),
            placement: NodePlacement::last(None),
            document_json: json!({"type": "doc", "content": ["shared base"]}),
            markdown: "shared base".into(),
            at: 1,
        })])
        .expect("checkpoint content");
    let archive = source.export_archive(20).expect("export checkpoint");

    let summary = storage
        .rehydrate_from_checkpoint(&archive, 1)
        .expect("rehydrate after log truncation");
    assert_eq!(summary.documents, 1);
    let connection = storage
        .sync_connection()
        .expect("connection")
        .expect("active");
    assert_eq!(connection.observed_server_sequence, 1);
    assert_eq!(connection.rehydrated_through, 1);
    assert_eq!(connection.next_client_sequence, 5);
    assert!(
        storage
            .sync_tombstones()
            .expect("tombstones")
            .iter()
            .any(|tombstone| tombstone.entity_kind == "tag" && tombstone.entity_id == "tag-gone"),
        "tombstones survive rehydration"
    );
    assert_eq!(
        storage.sync_recovery_view().expect("view").blocked.len(),
        1,
        "blocked rows survive rehydration"
    );
    assert!(received_rows(&storage).is_empty());
    let history = history_rows(&storage, "note-x");
    assert!(history.contains(&(3, "own edit".into(), "local".into())));
    assert!(history.contains(&(2, "shared base".into(), "remote".into())));
    assert!(history_rows(&storage, "note-y").is_empty());
    assert_eq!(document_of(&storage, "note-x").revision, 3);
    assert_eq!(document_of(&storage, "note-x").markdown, "shared base");

    let outcomes = storage
        .apply_remote_operations(&own, 40)
        .expect("own operations above the checkpoint re-apply");
    assert!(matches!(outcomes[0], RemoteSyncApplyOutcome::Applied(_)));
    assert_eq!(
        outcomes[1],
        superseded(SyncConflictReason::TombstoneBlocked),
        "the kept tombstone stops the deleted tag from being recreated"
    );
    assert_eq!(outcomes[2], RemoteSyncApplyOutcome::NoOp);
    assert!(matches!(outcomes[3], RemoteSyncApplyOutcome::Applied(_)));
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(document_of(&storage, "note-x").markdown, "own edit");
    assert!(snapshot.tags.is_empty());
    assert!(snapshot.nodes.iter().any(|node| node.id == "note-y"));
    assert_eq!(
        storage
            .sync_connection()
            .expect("connection")
            .expect("active")
            .observed_server_sequence,
        5
    );

    storage
        .apply_operations(&[save_document("note-x", 4, "after rehydration", 50)])
        .expect("local save continues from the raised revision");
    assert!(history_rows(&storage, "note-x").contains(&(
        5,
        "after rehydration".into(),
        "local".into()
    )));
}

#[test]
fn rehydration_requires_an_empty_outbox_but_tolerates_blocked_rows() {
    let storage = connected_fresh();
    storage
        .apply_operations(&[folder("folder-pending", "Pending", 11)])
        .expect("queue local work");
    let archive = SqliteWorkspace::open_in_memory()
        .expect("open database")
        .export_archive(5)
        .expect("export archive");
    assert!(matches!(
        storage.rehydrate_from_checkpoint(&archive, 3),
        Err(StorageError::InvalidOperation(_))
    ));
    assert_eq!(storage.bootstrap().expect("bootstrap").nodes.len(), 1);

    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending batch");
    storage
        .block_claimed_sync_operations(
            "sync-worker",
            &[batch.request.operations[0].operation_id.clone()],
            "cloud_rejected",
        )
        .expect("park the folder");
    storage
        .rehydrate_from_checkpoint(&archive, 3)
        .expect("blocked rows do not stop rehydration");
    assert_eq!(storage.sync_recovery_view().expect("view").blocked.len(), 1);
}

#[test]
fn notes_mentioning_each_other_seed_to_a_second_device() {
    let storage = connected_fresh();
    let mention = |target: &str| {
        json!({"type": "doc", "content": [
            {"type": "mention_ref", "attrs": {"kind": "note", "id": target}}
        ]})
    };
    let log = [
        remote(
            "remote-a",
            "device-remote",
            1,
            1,
            WorkspaceOperation::CreateNote {
                id: "note-a".into(),
                title: "A".into(),
                placement: NodePlacement::last(None),
                document_json: mention("note-b"),
                markdown: "mentions b".into(),
                at: 1,
            },
        ),
        remote(
            "remote-b",
            "device-remote",
            2,
            2,
            WorkspaceOperation::CreateNote {
                id: "note-b".into(),
                title: "B".into(),
                placement: NodePlacement::last(None),
                document_json: mention("note-a"),
                markdown: "mentions a".into(),
                at: 2,
            },
        ),
    ];

    let outcomes = storage
        .apply_remote_operations(&log, 10)
        .expect("mutual mentions seed in log order");
    assert!(
        outcomes
            .iter()
            .all(|outcome| matches!(outcome, RemoteSyncApplyOutcome::Applied(_)))
    );
    let references = storage.bootstrap().expect("bootstrap").references;
    let targets = |note_id: &str| {
        references
            .iter()
            .find(|references| references.note_id == note_id)
            .map(|references| {
                references
                    .targets
                    .iter()
                    .map(|target| target.target_id.clone())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    };
    assert_eq!(targets("note-a"), vec!["note-b".to_owned()]);
    assert_eq!(targets("note-b"), vec!["note-a".to_owned()]);
    let dangling = storage
        .lock()
        .expect("database lock")
        .query_row("SELECT COUNT(*) FROM sync_dangling_references", [], |row| {
            row.get::<_, i64>(0)
        })
        .expect("count dangling");
    assert_eq!(dangling, 0);

    let error = storage
        .apply_operations(&[op(WorkspaceOperation::CreateNote {
            id: "note-c".into(),
            title: "C".into(),
            placement: NodePlacement::last(None),
            document_json: mention("note-missing"),
            markdown: "mentions nothing".into(),
            at: 3,
        })])
        .expect_err("local writes keep failing closed on dangling mentions");
    assert!(matches!(error, StorageError::InvalidOperation(_)));
}

#[test]
fn first_connection_seeds_note_covers_after_their_images() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_note("note-covered"),
            attach_image("cover-1", "note-covered", 'd'),
            op(WorkspaceOperation::SetNoteCover {
                note_id: "note-covered".into(),
                image_id: Some("cover-1".into()),
                at: 3,
            }),
            op(WorkspaceOperation::SetNoteCoverFullWidth {
                note_id: "note-covered".into(),
                full_width: true,
                at: 4,
            }),
            op(WorkspaceOperation::SetNoteCoverTransform {
                note_id: "note-covered".into(),
                position_x: 25.0,
                position_y: 75.0,
                zoom: 1.5,
                at: 5,
            }),
        ])
        .expect("note with a cover");
    connect_at_cursor(&storage, 0);

    let batch = storage
        .claim_sync_operations("initial-upload", 100, 50, 64)
        .expect("claim")
        .expect("initial upload");
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
        vec![
            "create_note",
            "attach_image",
            "set_note_cover",
            "set_note_cover_transform",
            "set_note_cover_full_width",
        ]
    );

    let peer = SqliteWorkspace::open_in_memory().expect("open peer");
    peer.apply_operations(&[
        create_note("note-covered"),
        attach_image("cover-1", "note-covered", 'd'),
    ])
    .expect("peer already holds the note and its image bytes");
    peer.connect_sync(&NewSyncConnection {
        workspace_id: "workspace-1".into(),
        device_id: "device-peer".into(),
        connected_at: 10,
        observed_server_sequence: 0,
    })
    .expect("connect peer");
    let pushed_through = push_all(&peer, 1);
    let log = batch
        .request
        .operations
        .iter()
        .skip(2)
        .enumerate()
        .map(|(index, operation)| ReplicatedWorkspaceOperation {
            operation_id: operation.operation_id.clone(),
            device_id: "device-1".into(),
            client_sequence: operation.client_sequence,
            base_server_sequence: 0,
            server_sequence: pushed_through + index as u64 + 1,
            payload: operation.payload.clone(),
        })
        .collect::<Vec<_>>();
    let outcomes = peer.apply_remote_operations(&log, 20).expect("seed peer");
    assert!(
        outcomes
            .iter()
            .all(|outcome| matches!(outcome, RemoteSyncApplyOutcome::Applied(_)))
    );
    let node = &peer.bootstrap().expect("bootstrap").nodes[0];
    assert_eq!(node.cover_image_id.as_deref(), Some("cover-1"));
    assert!(node.cover_full_width);
    assert_eq!(
        (
            node.cover_position_x,
            node.cover_position_y,
            node.cover_zoom
        ),
        (25.0, 75.0, 1.5)
    );
}

#[test]
fn migration_0023_rewrites_open_conflicts_as_superseded_rows() {
    let mut connection = Connection::open_in_memory().expect("open database");
    SqliteWorkspace::configure(&connection).expect("configure database");
    connection
        .execute_batch(
            "CREATE TABLE schema_migrations (\
                 version INTEGER PRIMARY KEY,\
                 name TEXT NOT NULL,\
                 checksum TEXT NOT NULL,\
                 applied_at INTEGER NOT NULL\
             ) STRICT;",
        )
        .expect("create ledger");
    for migration in MIGRATIONS.iter().filter(|migration| migration.version < 23) {
        connection
            .execute_batch(migration.sql)
            .expect("apply pre-0023 migration");
        connection
            .execute(
                "INSERT INTO schema_migrations(version, name, checksum, applied_at) \
                 VALUES (?1, ?2, ?3, 1)",
                rusqlite::params![migration.version, migration.name, checksum(migration.sql)],
            )
            .expect("record migration");
    }
    connection
        .execute_batch(
            "INSERT INTO workspace_nodes(id, kind, rank, title, created_at, updated_at) \
                 VALUES ('note-1', 'note', 1024, 'Old', 1, 1);\
             INSERT INTO documents(note_id, document_json, markdown, revision, word_count) \
                 VALUES ('note-1', '{\"type\":\"doc\"}', 'local body', 2, 2);\
             INSERT INTO history_outbox(id, note_id, revision, markdown, created_at) \
                 VALUES ('history-1', 'note-1', 2, 'local body', 5);\
             INSERT INTO sync_connection(singleton, workspace_id, device_id, connected_at, \
                 observed_server_sequence, next_client_sequence) \
                 VALUES (1, 'workspace-1', 'device-1', 1, 1, 1);\
             INSERT INTO sync_conflicts(id, operation_id, operation_type, server_sequence, \
                 reason_code, subreason, operation_json, message, created_at) \
                 VALUES ('conflict-1', 'remote-1', 'save_document', 1, 'revision_conflict', \
                 'concurrent_document_version', '{}', 'sync.conflict: concurrent', 9);\
             INSERT INTO sync_document_conflicts(conflict_id, note_id, remote_document_json, \
                 remote_markdown, remote_word_count, remote_at) \
                 VALUES ('conflict-1', 'note-1', '{\"type\":\"doc\"}', 'remote body', 2, 8);\
             INSERT INTO sync_received_operations(operation_id, device_id, client_sequence, \
                 base_server_sequence, server_sequence, operation_json, outcome, conflict_id, \
                 received_at) \
                 VALUES ('remote-1', 'device-remote', 1, 0, 1, '{}', 'conflict', 'conflict-1', 9);",
        )
        .expect("seed a pre-0023 open conflict");

    SqliteWorkspace::migrate(&mut connection).expect("upgrade database");

    let (outcome, reason, detail) = connection
        .query_row(
            "SELECT outcome, reason, detail FROM sync_received_operations \
             WHERE operation_id = 'remote-1'",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .expect("migrated received row");
    assert_eq!(outcome, "superseded");
    assert_eq!(reason.as_deref(), Some("concurrent_document_version"));
    assert_eq!(detail.as_deref(), Some("sync.conflict: concurrent"));
    let conflict_tables = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' \
             AND name IN ('sync_conflicts', 'sync_document_conflicts')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .expect("count conflict tables");
    assert_eq!(conflict_tables, 0);
    let provenance = connection
        .query_row(
            "SELECT provenance FROM history_outbox WHERE id = 'history-1'",
            [],
            |row| row.get::<_, String>(0),
        )
        .expect("migrated history row");
    assert_eq!(provenance, "local");
    let rehydrated_through = connection
        .query_row(
            "SELECT rehydrated_through FROM sync_connection WHERE singleton = 1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .expect("rehydrated_through column");
    assert_eq!(rehydrated_through, 0);
    assert!(
        table_columns(&connection, "sync_dangling_references")
            .expect("dangling table")
            .contains(&"target_id".to_owned())
    );
    connection
        .execute(
            "INSERT INTO sync_blocked_operations(id, operation_type, operation_json, reason_code, \
             created_at) VALUES ('blocked-1', 'save_document', '{}', 'cloud_rejected', 1)",
            [],
        )
        .expect("cloud_rejected is an accepted reason");
}

#[test]
fn migration_0029_indexes_the_note_of_pending_outbox_rows() {
    let mut connection = Connection::open_in_memory().expect("open database");
    SqliteWorkspace::configure(&connection).expect("configure database");
    connection
        .execute_batch(
            "CREATE TABLE schema_migrations (\
                 version INTEGER PRIMARY KEY,\
                 name TEXT NOT NULL,\
                 checksum TEXT NOT NULL,\
                 applied_at INTEGER NOT NULL\
             ) STRICT;",
        )
        .expect("create ledger");
    for migration in MIGRATIONS.iter().filter(|migration| migration.version < 29) {
        connection
            .execute_batch(migration.sql)
            .expect("apply pre-0029 migration");
        connection
            .execute(
                "INSERT INTO schema_migrations(version, name, checksum, applied_at) \
                 VALUES (?1, ?2, ?3, 1)",
                rusqlite::params![migration.version, migration.name, checksum(migration.sql)],
            )
            .expect("record migration");
    }
    let pending = [
        serde_json::to_string(&create_note("note-created")).expect("create json"),
        serde_json::to_string(&save_document("note-saved", 1, "body", 2)).expect("save json"),
        r#"{"protocolVersion":1,"operation":{"type":"save_sealed_document","noteId":"note-sealed"}}"#
            .to_owned(),
        serde_json::to_string(&op(WorkspaceOperation::RenameNode {
            id: "note-saved".into(),
            title: "Renamed".into(),
            at: 3,
        }))
        .expect("rename json"),
    ];
    for (index, operation_json) in pending.iter().enumerate() {
        connection
            .execute(
                "INSERT INTO sync_outbox(operation_id, client_sequence, base_server_sequence, \
                 operation_json, created_at) VALUES (?1, ?2, 0, ?3, 1)",
                rusqlite::params![format!("pending-{index}"), index as i64 + 1, operation_json],
            )
            .expect("seed pending outbox row");
    }

    SqliteWorkspace::migrate(&mut connection).expect("upgrade database");

    let mut statement = connection
        .prepare("SELECT target_note_id FROM sync_outbox ORDER BY client_sequence")
        .expect("prepare target query");
    let targets = statement
        .query_map([], |row| row.get::<_, Option<String>>(0))
        .expect("query targets")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect targets");
    drop(statement);
    assert_eq!(
        targets,
        vec![
            Some("note-created".to_owned()),
            Some("note-saved".to_owned()),
            Some("note-sealed".to_owned()),
            None,
        ]
    );
    let mut plan = connection
        .prepare(
            "EXPLAIN QUERY PLAN SELECT 1 FROM sync_outbox WHERE target_note_id = ?1 \
             AND json_extract(operation_json, '$.operation.type') \
                 IN ('save_document', 'create_note')",
        )
        .expect("prepare query plan");
    let details = plan
        .query_map(["note-saved"], |row| row.get::<_, String>(3))
        .expect("query plan")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect query plan");
    assert!(
        details
            .iter()
            .any(|detail| detail.contains("INDEX sync_outbox_target_note")),
        "pending-write lookup scans the outbox: {details:?}"
    );
}
