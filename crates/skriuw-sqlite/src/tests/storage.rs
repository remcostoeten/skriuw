use super::*;

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
fn reads_a_workspace_delta_for_specific_identifiers() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            folder("folder-1", "Folder", 1),
            create_placed_note("note-1", NodePlacement::last(Some("folder-1".into())), 2),
            create_placed_note("note-2", NodePlacement::last(None), 3),
        ])
        .expect("seed workspace");

    let delta = storage
        .read_workspace_delta(&["note-1".into(), "folder-1".into(), "missing".into()])
        .expect("read delta");
    assert_eq!(
        delta
            .documents
            .iter()
            .map(|document| document.note_id.as_str())
            .collect::<Vec<_>>(),
        vec!["note-1"]
    );
    assert_eq!(
        delta
            .nodes
            .iter()
            .map(|node| (node.id.as_str(), node.kind))
            .collect::<Vec<_>>(),
        vec![("folder-1", NodeKind::Folder), ("note-1", NodeKind::Note)]
    );
    assert!(
        storage
            .read_workspace_delta(&[])
            .expect("empty delta")
            .documents
            .is_empty()
    );
}

#[test]
fn busy_and_locked_sqlite_failures_map_to_a_transient_error() {
    let busy = rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_BUSY),
        Some("database is locked".into()),
    );
    let locked = rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_LOCKED),
        None,
    );
    let corrupt = rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CORRUPT),
        None,
    );
    assert!(matches!(crate::error::backend(busy), StorageError::Busy(_)));
    assert!(matches!(
        crate::error::backend(locked),
        StorageError::Busy(_)
    ));
    assert!(matches!(
        crate::error::backend(corrupt),
        StorageError::Backend(_)
    ));
    assert!(matches!(
        crate::error::backend(std::io::Error::other("disk")),
        StorageError::Backend(_)
    ));
}

#[test]
fn a_file_workspace_opens_with_a_larger_page_cache_and_memory_mapped_reads() {
    let directory = tempdir().expect("tempdir");
    let storage = SqliteWorkspace::open(directory.path().join("workspace.db")).expect("open");
    let connection = storage.lock().expect("database lock");

    let cache_size = connection
        .query_row("PRAGMA cache_size", [], |row| row.get::<_, i64>(0))
        .expect("cache size");
    let mmap_size = connection
        .query_row("PRAGMA mmap_size", [], |row| row.get::<_, i64>(0))
        .expect("mmap size");

    assert_eq!(cache_size, -16_000);
    assert_eq!(mmap_size, 268_435_456);
}
