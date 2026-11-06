use super::*;

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
                additions: None,
                deletions: None,
                word_count: None,
            },
            HistoryHeader {
                note_id: "note-outside".into(),
                version_id: "outside-version".into(),
                created_at: 4,
                summary: "Outside".into(),
                additions: None,
                deletions: None,
                word_count: None,
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
            additions: None,
            deletions: None,
            word_count: None,
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
            additions: None,
            deletions: None,
            word_count: None,
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
