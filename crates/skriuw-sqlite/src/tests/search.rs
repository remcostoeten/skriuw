use super::*;

#[test]
fn filtered_search_applies_candidates_before_limit() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    for index in 0..250 {
        storage
            .apply_operations(&[create_note(&format!("search-{index}"))])
            .expect("create");
    }
    let global = storage.search("SQLite", 250).expect("global search");
    let last = global.last().expect("last ranked result").note_id.clone();
    let hits = storage
        .search_filtered("SQLite", 1, Some(std::slice::from_ref(&last)))
        .expect("filtered search");
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].note_id, last);
    assert!(
        storage
            .search_filtered("SQLite", 1, Some(&[]))
            .expect("empty candidates")
            .is_empty()
    );
    storage
        .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
            root_id: last.clone(),
            at: 2,
        })])
        .expect("trash");
    assert!(
        storage
            .search_filtered("SQLite", 1, Some(&[last]))
            .expect("trashed candidate")
            .is_empty()
    );
}

fn note_with_body(id: &str, title: &str, markdown: &str) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::CreateNote {
        id: id.into(),
        title: title.into(),
        placement: NodePlacement::last(None),
        document_json: json!({"type": "doc", "content": []}),
        markdown: markdown.into(),
        at: 1,
    })
}

fn matched_ids(hits: &[skriuw_domain::SearchHit]) -> Vec<String> {
    hits.iter().map(|hit| hit.note_id.clone()).collect()
}

/// `unicode61 remove_diacritics 2` folds every combining accent, so Dutch and
/// English readers find a word however they typed it. See ADR-0041.
#[test]
fn diacritics_fold_in_both_directions_for_dutch_and_english() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[note_with_body(
            "note-nl",
            "Reisverslag",
            "Het geërfde café in Curaçao lag naast een oud reünie-terras.",
        )])
        .expect("create note");

    for query in ["geerfde", "geërfde", "cafe", "café", "curacao", "reunie"] {
        let hits = storage.search(query, 10).expect("search");
        assert_eq!(
            matched_ids(&hits),
            vec!["note-nl"],
            "query {query} found nothing"
        );
    }
}

#[test]
fn search_is_case_insensitive_and_matches_word_prefixes() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[note_with_body(
            "note-1",
            "Deployment",
            "Rollback procedure for the release train.",
        )])
        .expect("create note");

    assert_eq!(
        matched_ids(&storage.search("ROLLB", 10).expect("search")),
        vec!["note-1"]
    );
}

#[test]
fn markdown_syntax_and_opaque_payloads_stay_out_of_the_index() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[note_with_body(
            "note-1",
            "Sketchbook",
            "A [kitchen plan](images/9f3c-uuid) sketch.\n\n```drawing\n{\"strokes\":[{\"pressure\":12}]}\n```",
        )])
        .expect("create note");

    assert_eq!(
        matched_ids(&storage.search("kitchen", 10).expect("search")),
        vec!["note-1"]
    );
    assert!(storage.search("strokes", 10).expect("search").is_empty());
    assert!(storage.search("pressure", 10).expect("search").is_empty());
    assert!(storage.search("images", 10).expect("search").is_empty());
}

#[test]
fn chip_labels_are_searchable_as_plain_words() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[note_with_body(
            "note-1",
            "Standup",
            "Paired with $ada on #design-system and linked [[Roadmap]].",
        )])
        .expect("create note");

    for query in ["ada", "design-system", "Roadmap"] {
        assert_eq!(
            matched_ids(&storage.search(query, 10).expect("search")),
            vec!["note-1"],
            "query {query} found nothing"
        );
    }
}

/// A title match outranks a body match for the same word, so the palette's
/// content group never buries the note the reader actually named.
#[test]
fn title_matches_rank_above_body_matches() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            note_with_body(
                "note-body",
                "Weekly notes",
                "The migration plan is on track.",
            ),
            note_with_body("note-title", "Migration plan", "Nothing else to report."),
        ])
        .expect("create notes");

    let hits = storage.search("migration", 10).expect("search");
    assert_eq!(matched_ids(&hits), vec!["note-title", "note-body"]);
}

#[test]
fn rebuilding_the_search_index_is_idempotent() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[note_with_body("note-1", "Atlas", "Bearings and gears.")])
        .expect("create note");

    let first = storage.rebuild_search_index().expect("rebuild once");
    let second = storage.rebuild_search_index().expect("rebuild twice");

    assert_eq!(first, second);
    assert!(!second.needs_rebuild);
    assert_eq!(second.indexed_notes, 1);
    assert_eq!(second.index_version, second.current_version);
    assert_eq!(
        matched_ids(&storage.search("bearings", 10).expect("search")),
        vec!["note-1"]
    );
}

/// A projection is rebuildable state: losing it must never lose a note. The
/// index is dropped underneath the workspace, the workspace is reopened, and
/// the rebuild restores every hit.
#[test]
fn a_lost_search_index_is_restored_by_a_rebuild_after_restart() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("workspace.db");
    {
        let storage = SqliteWorkspace::open(&path).expect("open database");
        storage
            .apply_operations(&[note_with_body(
                "note-1",
                "Recovered",
                "Bearings and gears survive a lost projection.",
            )])
            .expect("create note");
        storage.rebuild_search_index().expect("rebuild");
    }

    {
        let connection = Connection::open(&path).expect("open connection");
        connection
            .execute("DELETE FROM documents_fts", [])
            .expect("drop projection rows");
    }

    let storage = SqliteWorkspace::open(&path).expect("reopen database");
    assert!(storage.search("bearings", 10).expect("search").is_empty());
    let status = storage.search_index_status().expect("status");
    assert!(status.needs_rebuild);
    assert_eq!(status.indexed_notes, 0);
    assert_eq!(status.note_count, 1);

    let rebuilt = storage.rebuild_search_index().expect("rebuild");
    assert!(!rebuilt.needs_rebuild);
    assert_eq!(
        matched_ids(&storage.search("bearings", 10).expect("search")),
        vec!["note-1"]
    );
}

/// A workspace written by an older build carries no version marker, so it
/// reports drift once and stops reporting it after the rebuild.
#[test]
fn a_workspace_without_a_version_marker_reports_drift_once() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[note_with_body("note-1", "Atlas", "Bearings and gears.")])
        .expect("create note");

    let before = storage.search_index_status().expect("status");
    assert_eq!(before.index_version, 0);
    assert!(before.needs_rebuild);

    storage.rebuild_search_index().expect("rebuild");

    assert!(!storage.search_index_status().expect("status").needs_rebuild);
}

#[test]
fn a_rebuilt_index_still_excludes_trashed_notes() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[note_with_body("note-1", "Atlas", "Bearings and gears.")])
        .expect("create note");
    storage
        .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
            root_id: "note-1".into(),
            at: 2,
        })])
        .expect("trash note");

    storage.rebuild_search_index().expect("rebuild");

    assert!(storage.search("bearings", 10).expect("search").is_empty());
}

#[test]
fn an_archive_import_leaves_the_index_current() {
    let source = SqliteWorkspace::open_in_memory().expect("open database");
    source
        .apply_operations(&[note_with_body("note-1", "Atlas", "Bearings and gears.")])
        .expect("create note");
    let archive = source.export_archive(5).expect("export archive");

    let target = SqliteWorkspace::open_in_memory().expect("open database");
    target
        .replace_from_archive(&archive)
        .expect("import archive");

    assert!(!target.search_index_status().expect("status").needs_rebuild);
    assert_eq!(
        matched_ids(&target.search("bearings", 10).expect("search")),
        vec!["note-1"]
    );
}
