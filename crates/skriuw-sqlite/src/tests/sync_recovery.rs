use super::*;

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

#[test]
fn blocking_refuses_to_renumber_a_batch_that_was_pushed_before() {
    let storage = connected_fresh();
    storage
        .apply_operations(&[folder("folder-1", "First", 11)])
        .expect("queue one operation");
    let batch = storage
        .claim_sync_operations("sync-worker", 100, 50, 64)
        .expect("claim")
        .expect("pending batch");
    let operation_id = batch.request.operations[0].operation_id.clone();
    storage
        .release_sync_operations(
            "sync-worker",
            std::slice::from_ref(&operation_id),
            150,
            &Diagnostic::new(
                DiagnosticContext::Sync,
                DiagnosticCategory::Backend,
                "lost ack",
            ),
        )
        .expect("release after a push whose acknowledgement was lost");
    storage
        .claim_sync_operations("sync-worker", 200, 50, 64)
        .expect("claim")
        .expect("second attempt");

    let error = storage
        .block_claimed_sync_operations(
            "sync-worker",
            std::slice::from_ref(&operation_id),
            "asset_content_missing",
        )
        .expect_err("a second attempt may already be server-visible");
    assert!(matches!(error, StorageError::ReleaseRequired(_)));
    assert!(
        storage
            .blocked_sync_operations()
            .expect("blocked")
            .is_empty()
    );
    storage
        .release_sync_operations(
            "sync-worker",
            &[operation_id],
            300,
            &Diagnostic::new(
                DiagnosticContext::Sync,
                DiagnosticCategory::Backend,
                "retry",
            ),
        )
        .expect("the lease is still intact and can be released");
}

#[test]
fn blocking_refuses_an_unknown_reason_and_keeps_the_claim() {
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

    let error = storage
        .block_claimed_sync_operations(
            "sync-worker",
            std::slice::from_ref(&operation_id),
            "made_up_reason",
        )
        .expect_err("an unknown reason is refused");
    assert!(matches!(error, StorageError::InvalidOperation(_)));
    assert!(
        storage
            .blocked_sync_operations()
            .expect("blocked")
            .is_empty()
    );

    storage
        .block_claimed_sync_operations("sync-worker", &[operation_id], "cloud_rejected")
        .expect("the claim is still held after the refusal");
    assert_eq!(storage.blocked_sync_operations().expect("blocked").len(), 1);
}

#[test]
fn a_retry_that_cannot_read_the_canonical_body_leaves_the_record_parked() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-corrupt")])
        .expect("local note");
    connect_at_cursor(&storage, 0);
    push_all(&storage, 1);
    storage
        .apply_operations(&[save_document("note-corrupt", 1, "parked body", 12)])
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
    let next_sequence = storage
        .sync_connection()
        .expect("connection")
        .expect("active connection")
        .next_client_sequence;
    storage
        .lock()
        .expect("database lock")
        .execute(
            "UPDATE documents SET document_json = '{', markdown = 'diverged' \
             WHERE note_id = 'note-corrupt'",
            [],
        )
        .expect("corrupt the canonical body");
    let blocked_id = storage.sync_recovery_view().expect("view").blocked[0]
        .blocked_id
        .clone();

    let error = storage
        .retry_blocked_sync_operation(&blocked_id, 500)
        .expect_err("an unreadable canonical body fails the retry");
    assert!(matches!(error, StorageError::Backend(_)));

    let view = storage.sync_recovery_view().expect("view");
    assert_eq!(view.blocked.len(), 1, "the record stays parked");
    assert!(view.discarded.is_empty());
    assert!(
        storage
            .claim_sync_operations("sync-worker", 600, 50, 64)
            .expect("claim")
            .is_none(),
        "nothing reached the outbox"
    );
    assert_eq!(
        storage
            .sync_connection()
            .expect("connection")
            .expect("active connection")
            .next_client_sequence,
        next_sequence
    );
}
