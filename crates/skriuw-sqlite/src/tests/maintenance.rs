use super::*;

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
        .execute_batch(include_str!("../../tests/fixtures/legacy_0001.sql"))
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
        .execute(
            "INSERT INTO history_cache(note_id, commit_id, created_at, summary) \
                 VALUES ('note-1', 'version-1', 1, 'Legacy revision')",
            [],
        )
        .expect("create legacy history header");
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
    let legacy_diff_stats = connection
        .query_row(
            "SELECT additions, deletions FROM history_cache WHERE note_id = 'note-1'",
            [],
            |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, Option<i64>>(1)?)),
        )
        .expect("upgraded history diff stats");

    assert_eq!(pending, ("note-1".into(), 0));
    assert_eq!(legacy_diff_stats, (None, None));
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
            additions: Some(1),
            deletions: Some(0),
            word_count: Some(1),
        }])
        .expect("seed history cache");

    storage
        .replace_history_headers(&[
            HistoryHeader {
                note_id: "note-1".into(),
                version_id: "version-new".into(),
                created_at: 2,
                summary: "New".into(),
                additions: Some(2),
                deletions: Some(1),
                word_count: Some(1),
            },
            HistoryHeader {
                note_id: "note-1".into(),
                version_id: "version-invalid".into(),
                created_at: -1,
                summary: "Invalid".into(),
                additions: Some(1),
                deletions: Some(0),
                word_count: Some(1),
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
        .claim_history_revision("worker-1", HISTORY_COALESCE_WINDOW_MS + 10, 1_000)
        .expect("claim history")
        .expect("history item");
    let diagnostic = Diagnostic::new(
        DiagnosticContext::History,
        DiagnosticCategory::Backend,
        format!("\n{}\t", "failure".repeat(300)),
    );

    storage
        .release_history_revision("worker-1", &item.id, 1_010, &diagnostic)
        .expect("release history");

    let (persisted, next_attempt_at) = storage
        .lock()
        .expect("database lock")
        .query_row(
            "SELECT last_error, next_attempt_at FROM history_outbox WHERE id = ?1",
            [&item.id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .expect("persisted diagnostic");
    assert_eq!(persisted, diagnostic.to_string());
    assert_eq!(next_attempt_at, 1_010);
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
fn idle_history_claim_leaves_the_write_lock_alone() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("workspace.db");
    let storage = SqliteWorkspace::open(&path).expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    let writer = Connection::open(&path).expect("open writer");
    writer
        .execute_batch("BEGIN IMMEDIATE")
        .expect("hold write lock");

    let started = Instant::now();
    let claimed = storage
        .claim_history_revision("worker-1", 10, 1_000)
        .expect("idle claim");

    assert!(claimed.is_none());
    assert!(started.elapsed() < std::time::Duration::from_secs(1));
    writer
        .execute_batch("ROLLBACK")
        .expect("release write lock");
    assert!(
        storage
            .claim_history_revision("worker-1", HISTORY_COALESCE_WINDOW_MS + 10, 1_000)
            .expect("due claim")
            .is_some()
    );
}

#[test]
fn next_history_claim_follows_window_lease_retry_and_trash() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    assert_eq!(storage.next_history_claim_at(1_000).expect("empty"), None);
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    assert_eq!(
        storage.next_history_claim_at(1_000).expect("pending"),
        Some(1 + HISTORY_COALESCE_WINDOW_MS)
    );

    let claimed_at = HISTORY_COALESCE_WINDOW_MS + 10;
    let item = storage
        .claim_history_revision("worker-1", claimed_at, 1_000)
        .expect("claim history")
        .expect("history item");
    assert_eq!(
        storage.next_history_claim_at(1_000).expect("leased"),
        Some(claimed_at + 1_000)
    );

    let retry_at = claimed_at + 60_000;
    storage
        .release_history_revision(
            "worker-1",
            &item.id,
            retry_at,
            &Diagnostic::new(
                DiagnosticContext::History,
                DiagnosticCategory::Backend,
                "failure",
            ),
        )
        .expect("release history");
    assert_eq!(
        storage.next_history_claim_at(1_000).expect("retrying"),
        Some(retry_at)
    );

    storage
        .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
            root_id: "note-1".into(),
            at: 10,
        })])
        .expect("trash note");
    assert_eq!(storage.next_history_claim_at(1_000).expect("trashed"), None);
}
