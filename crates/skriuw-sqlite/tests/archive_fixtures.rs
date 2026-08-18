use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::json;
use skriuw_domain::{WORKSPACE_ARCHIVE_VERSION, WorkspaceArchive, WorkspaceDocument};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{StorageError, WorkspaceMaintenance, WorkspaceStorage};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FixtureEntry {
    archive_version: u16,
    file: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FixtureManifest {
    supported_archive_versions: Vec<u16>,
    fixtures: Vec<FixtureEntry>,
}

fn archives_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/archives")
}

fn load_manifest() -> FixtureManifest {
    let raw = fs::read_to_string(archives_dir().join("manifest.json")).expect("read manifest");
    serde_json::from_str(&raw).expect("parse manifest")
}

fn load_fixture_archive(file: &str) -> WorkspaceArchive {
    let raw = fs::read_to_string(archives_dir().join(file)).expect("read fixture");
    serde_json::from_str(&raw).expect("deserialize fixture archive")
}

fn assert_healthy(storage: &SqliteWorkspace, context: &str) {
    let report = storage.integrity_check().expect("integrity check");
    assert!(
        report.healthy,
        "{context}: integrity issues {:?}",
        report.issues
    );
}

#[test]
fn golden_fixtures_import_bootstrap_and_round_trip() {
    let manifest = load_manifest();
    for entry in &manifest.fixtures {
        assert!(
            manifest
                .supported_archive_versions
                .contains(&entry.archive_version),
            "fixture {} uses uncatalogued archive version {}",
            entry.file,
            entry.archive_version
        );
        let archive = load_fixture_archive(&entry.file);

        let storage = SqliteWorkspace::open_in_memory().expect("open first database");
        let summary = storage
            .replace_from_archive(&archive)
            .unwrap_or_else(|error| panic!("import {} failed: {error}", entry.file));
        assert_eq!(summary.nodes, archive.nodes.len());
        assert_eq!(summary.documents, archive.documents.len());
        assert_healthy(&storage, &entry.file);

        let snapshot = storage.bootstrap().expect("bootstrap imported workspace");
        assert_eq!(
            snapshot.nodes, archive.nodes,
            "{} nodes drifted",
            entry.file
        );
        assert_eq!(
            snapshot.documents, archive.documents,
            "{} documents drifted",
            entry.file
        );
        assert_eq!(
            snapshot.settings, archive.settings,
            "{} settings drifted",
            entry.file
        );
        assert_eq!(
            snapshot.active_note_id, archive.active_note_id,
            "{} active note drifted",
            entry.file
        );
        assert_eq!(
            snapshot.properties, archive.properties,
            "{} properties drifted",
            entry.file
        );
        assert_eq!(
            snapshot.property_templates, archive.property_templates,
            "{} property templates drifted",
            entry.file
        );
        assert_eq!(
            snapshot.tasks, archive.tasks,
            "{} tasks drifted",
            entry.file
        );

        let mut expected = archive.clone();
        expected.archive_version = WORKSPACE_ARCHIVE_VERSION;
        let exported = storage
            .export_archive(archive.exported_at)
            .expect("export imported workspace");
        assert_eq!(exported, expected, "{} export drifted", entry.file);

        let second = SqliteWorkspace::open_in_memory().expect("open second database");
        second
            .replace_from_archive(&exported)
            .expect("import re-exported archive");
        assert_healthy(&second, &entry.file);
        let re_exported = second
            .export_archive(archive.exported_at)
            .expect("export second workspace");
        assert_eq!(
            re_exported, expected,
            "{} second export drifted",
            entry.file
        );
    }
}

#[test]
fn representative_fixture_enforces_unavailability_and_search() {
    let archive = load_fixture_archive("v1/representative.json");
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .replace_from_archive(&archive)
        .expect("import representative fixture");

    let snapshot = storage.bootstrap().expect("bootstrap workspace");
    assert_eq!(
        snapshot.unavailable_node_ids(),
        BTreeSet::from(["folder-archive", "note-old-draft"])
    );

    let visible = storage
        .search("fixturegolden", 10)
        .expect("search visible note");
    assert_eq!(
        visible
            .iter()
            .map(|hit| hit.note_id.as_str())
            .collect::<Vec<_>>(),
        vec!["note-welcome"]
    );

    let hidden = storage
        .search("fixturehidden", 10)
        .expect("search trashed note");
    assert!(hidden.is_empty());

    let unicode = storage
        .search("doorsneetekst", 10)
        .expect("search unicode note");
    assert_eq!(
        unicode
            .iter()
            .map(|hit| hit.note_id.as_str())
            .collect::<Vec<_>>(),
        vec!["note-unicode"]
    );
}

#[test]
fn invalid_archives_fail_before_mutation_and_preserve_workspace() {
    let archive = load_fixture_archive("v1/representative.json");
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .replace_from_archive(&archive)
        .expect("import representative fixture");

    let mut future = archive.clone();
    future.archive_version = 6;
    assert!(matches!(
        storage.replace_from_archive(&future),
        Err(StorageError::InvalidOperation(_))
    ));

    let mut broken = archive.clone();
    broken.documents.push(WorkspaceDocument {
        note_id: "missing-note".into(),
        document_json: json!({"type": "doc"}),
        markdown: String::new(),
        revision: 1,
        word_count: 0,
    });
    assert!(matches!(
        storage.replace_from_archive(&broken),
        Err(StorageError::InvalidOperation(_))
    ));

    let preserved = storage
        .export_archive(archive.exported_at)
        .expect("export preserved workspace");
    let mut expected = archive.clone();
    expected.archive_version = WORKSPACE_ARCHIVE_VERSION;
    assert_eq!(preserved, expected);
    assert_healthy(&storage, "preserved workspace");
}
