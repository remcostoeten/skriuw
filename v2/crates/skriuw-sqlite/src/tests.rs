use std::{path::PathBuf, time::Instant};

use rusqlite::Connection;
use serde_json::json;
use skriuw_domain::{
    HistoryHeader, NodePlacement, WorkspaceOperation, WorkspaceOperationEnvelope, WorkspaceSettings,
};
use skriuw_storage::{
    Diagnostic, DiagnosticCategory, DiagnosticContext, HistoryCache, HistoryQueue,
    MAX_DIAGNOSTIC_MESSAGE_BYTES, StorageError, WorkspaceMaintenance, WorkspaceStorage,
};
use tempfile::tempdir;

use super::SqliteWorkspace;
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
        .prepare("SELECT revision FROM history_outbox WHERE note_id = 'note-1' ORDER BY revision")
        .expect("prepare history query")
        .query_map([], |row| row.get::<_, i64>(0))
        .expect("query history")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect history revisions");
    assert_eq!(revisions, [1, 2, 3]);
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
        .claim_history_revision("worker-1", 10, 1_000)
        .expect("claim history")
        .expect("history item");
    let diagnostic = Diagnostic::new(
        DiagnosticContext::History,
        DiagnosticCategory::Backend,
        format!("\n{}\t", "failure".repeat(300)),
    );

    storage
        .release_history_revision("worker-1", &item.id, &diagnostic)
        .expect("release history");

    let persisted = storage
        .lock()
        .expect("database lock")
        .query_row(
            "SELECT last_error FROM history_outbox WHERE id = ?1",
            [&item.id],
            |row| row.get::<_, String>(0),
        )
        .expect("persisted diagnostic");
    assert_eq!(persisted, diagnostic.to_string());
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
            .claim_history_revision("worker", 20, 10)
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
