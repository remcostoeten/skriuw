use super::*;

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
