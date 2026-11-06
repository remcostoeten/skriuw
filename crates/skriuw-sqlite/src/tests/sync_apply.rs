use super::*;

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
    assert!(superseded_rows(&storage).is_empty());
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
fn superseded_remote_write_is_durable_and_does_not_block_later_operations() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-conflict")])
        .expect("local note");
    connect_at_cursor(&storage, 0);
    let losing_save = remote(
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
        .apply_remote_operations(&[losing_save.clone(), later_create], 30)
        .expect("record superseded write and continue");
    assert_eq!(
        outcomes[0],
        superseded(SyncConflictReason::ConcurrentDocumentVersion),
        "the unpushed local creation outranks the remote body"
    );
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
        superseded_rows(&storage),
        vec![(
            "remote-conflict".into(),
            "concurrent_document_version".into()
        )]
    );
    assert!(history_rows(&storage, "note-conflict").iter().any(
        |(_, markdown, provenance)| markdown == "remote conflicting body"
            && provenance == "superseded"
    ));
    assert_eq!(
        storage
            .apply_remote_operations(&[losing_save], 31)
            .expect("duplicate superseded delivery"),
        vec![RemoteSyncApplyOutcome::Duplicate]
    );
    assert_eq!(superseded_rows(&storage).len(), 1);
    assert_eq!(
        history_rows(&storage, "note-conflict")
            .iter()
            .filter(|(_, _, provenance)| provenance == "superseded")
            .count(),
        1,
        "a duplicate delivery never preserves the body twice"
    );
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
