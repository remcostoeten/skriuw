use super::*;

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

/// Two devices annotating the same note converge the way any other document
/// edit does: the layer rides `SaveDocument` inside `document_json`, so the
/// second writer loses on revision and the winner's ink is intact. Stable
/// element ids are what make the preserved alternative mergeable afterwards.
#[test]
fn concurrent_annotation_edits_conflict_like_any_document_edit() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    let first_device = json!({
        "type": "doc",
        "attrs": {"drawing": {"version": 1, "elements": [
            {"id": "a", "kind": "stroke", "tool": "pen", "color": "ink",
             "width": 2, "points": [0, 0, 10, 10]}
        ]}},
        "content": []
    });
    let second_device = json!({
        "type": "doc",
        "attrs": {"drawing": {"version": 1, "elements": [
            {"id": "b", "kind": "stroke", "tool": "pen", "color": "red",
             "width": 2, "points": [50, 50, 60, 60]}
        ]}},
        "content": []
    });

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: first_device.clone(),
            markdown: "one".into(),
            word_count: 1,
            expected_revision: 1,
            at: 2,
        })])
        .expect("first device saves");

    let error = storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: second_device,
            markdown: "two".into(),
            word_count: 1,
            expected_revision: 1,
            at: 3,
        })])
        .expect_err("second device is stale");

    assert!(matches!(
        error,
        StorageError::RevisionConflict {
            expected: 1,
            current: 2,
            ..
        }
    ));

    let snapshot = storage.bootstrap().expect("bootstrap");
    let document = snapshot
        .documents
        .iter()
        .find(|document| document.note_id == "note-1")
        .expect("stored document");
    assert_eq!(
        document.document_json, first_device,
        "the winning device keeps its ink untouched"
    );
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
