use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::{Value, json};
use skriuw_domain::{
    ArchiveValidationError, NodeKind, SUPPORTED_ARCHIVE_VERSIONS, WorkspaceArchive,
    WorkspaceSnapshot,
};

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

fn load_fixture_value(file: &str) -> Value {
    let raw = fs::read_to_string(archives_dir().join(file)).expect("read fixture");
    serde_json::from_str(&raw).expect("parse fixture JSON")
}

fn load_fixture_archive(file: &str) -> WorkspaceArchive {
    serde_json::from_value(load_fixture_value(file)).expect("deserialize fixture archive")
}

fn snapshot_from_archive(archive: &WorkspaceArchive) -> WorkspaceSnapshot {
    WorkspaceSnapshot {
        protocol_version: archive.protocol_version,
        active_note_id: archive.active_note_id.clone(),
        nodes: archive.nodes.clone(),
        documents: archive.documents.clone(),
        history_headers: Vec::new(),
        settings: archive.settings.clone(),
        tags: archive.tags.clone(),
        people: archive.people.clone(),
        references: Vec::new(),
    }
}

#[test]
fn catalogue_matches_production_supported_versions() {
    let manifest = load_manifest();

    let supported = manifest
        .supported_archive_versions
        .iter()
        .copied()
        .collect::<BTreeSet<_>>();
    assert_eq!(supported, BTreeSet::from(SUPPORTED_ARCHIVE_VERSIONS));
    assert_eq!(
        manifest.supported_archive_versions.len(),
        supported.len(),
        "manifest lists a supported version twice"
    );

    let mut fixtures_per_version = BTreeMap::<u16, usize>::new();
    for entry in &manifest.fixtures {
        assert!(
            supported.contains(&entry.archive_version),
            "fixture {} is catalogued under unsupported archive version {}",
            entry.file,
            entry.archive_version
        );
        assert!(
            entry
                .file
                .starts_with(&format!("v{}/", entry.archive_version)),
            "fixture {} is not stored under its version directory",
            entry.file
        );
        *fixtures_per_version
            .entry(entry.archive_version)
            .or_default() += 1;
    }
    for version in &supported {
        assert!(
            fixtures_per_version.get(version).copied().unwrap_or(0) >= 1,
            "supported archive version {version} has no golden fixture"
        );
    }
}

#[test]
fn catalogue_covers_exactly_the_version_directories() {
    let manifest = load_manifest();
    let supported = manifest
        .supported_archive_versions
        .iter()
        .copied()
        .collect::<BTreeSet<_>>();

    let mut catalogued_files = BTreeSet::new();
    for entry in &manifest.fixtures {
        assert!(
            catalogued_files.insert(entry.file.clone()),
            "fixture {} is catalogued twice",
            entry.file
        );
    }

    let mut on_disk_files = BTreeSet::new();
    for entry in fs::read_dir(archives_dir()).expect("list archives directory") {
        let entry = entry.expect("read archives directory entry");
        let name = entry
            .file_name()
            .into_string()
            .expect("directory entry name");
        if entry.file_type().expect("directory entry type").is_dir() {
            let version = name
                .strip_prefix('v')
                .and_then(|suffix| suffix.parse::<u16>().ok())
                .unwrap_or_else(|| panic!("unexpected directory {name} under fixtures/archives"));
            assert!(
                supported.contains(&version),
                "fixtures/archives/{name} exists for unsupported archive version {version}"
            );
            for file in fs::read_dir(entry.path()).expect("list version directory") {
                let file = file.expect("read version directory entry");
                let file_name = file.file_name().into_string().expect("fixture file name");
                assert!(
                    file.file_type().expect("fixture file type").is_file(),
                    "fixtures/archives/{name}/{file_name} is not a regular file"
                );
                on_disk_files.insert(format!("{name}/{file_name}"));
            }
        } else {
            assert_eq!(
                name, "manifest.json",
                "unexpected file {name} under fixtures/archives"
            );
        }
    }

    assert_eq!(catalogued_files, on_disk_files);
}

#[test]
fn golden_fixtures_deserialize_validate_and_round_trip() {
    let manifest = load_manifest();
    for entry in &manifest.fixtures {
        let archive = load_fixture_archive(&entry.file);
        assert_eq!(
            archive.archive_version, entry.archive_version,
            "fixture {} declares archiveVersion {} but the catalogue says {}",
            entry.file, archive.archive_version, entry.archive_version
        );
        archive
            .validate()
            .unwrap_or_else(|error| panic!("fixture {} is invalid: {error}", entry.file));

        let reserialized = serde_json::to_value(&archive).expect("serialize fixture archive");
        let reparsed =
            serde_json::from_value::<WorkspaceArchive>(reserialized).expect("reparse archive");
        assert_eq!(
            reparsed, archive,
            "fixture {} round trip drifted",
            entry.file
        );
    }
}

#[test]
fn representative_fixture_preserves_compatibility_sensitive_fields() {
    let archive = load_fixture_archive("v1/representative.json");

    assert_eq!(archive.active_note_id.as_deref(), Some("note-welcome"));
    assert_eq!(archive.settings.theme, "paper");
    assert_eq!(archive.settings.editor_line_height, "relaxed");
    assert!(!archive.settings.show_line_numbers);
    assert_eq!(archive.settings.editor_placeholder, "Skriuw dyn ferhaal…");
    assert_eq!(
        archive.settings.extensions.get("labsPreview"),
        Some(&json!({"enabled": true, "cohort": 3}))
    );

    let trashed_folder = archive
        .nodes
        .iter()
        .find(|node| node.id == "folder-archive")
        .expect("trashed folder");
    assert_eq!(trashed_folder.kind, NodeKind::Folder);
    assert_eq!(trashed_folder.deleted_at, Some(1_750_000_006_000));

    let unicode_note = archive
        .nodes
        .iter()
        .find(|node| node.id == "note-unicode")
        .expect("unicode note");
    assert_eq!(unicode_note.title, "Grüße 中文 ✍️");
    assert_eq!(unicode_note.icon.as_deref(), Some("🌍"));

    let unicode_document = archive
        .documents
        .iter()
        .find(|document| document.note_id == "note-unicode")
        .expect("unicode document");
    assert!(unicode_document.markdown.contains("Grüße 中文"));
    assert!(unicode_document.markdown.contains("🎉"));
    assert_eq!(
        unicode_document.document_json["content"][1]["content"][0]["text"],
        json!("émojis 🎉, עברית, καλημέρα, doorsneetekst.")
    );

    let unavailable = snapshot_from_archive(&archive);
    assert_eq!(
        unavailable.unavailable_node_ids(),
        BTreeSet::from(["folder-archive", "note-old-draft"])
    );
}

#[test]
fn pinned_fixture_preserves_pinned_at() {
    let archive = load_fixture_archive("v2/pinned.json");

    let pinned_folder = archive
        .nodes
        .iter()
        .find(|node| node.id == "folder-pinned")
        .expect("pinned folder");
    assert_eq!(pinned_folder.pinned_at, Some(1_753_200_002_000));

    let pinned_note = archive
        .nodes
        .iter()
        .find(|node| node.id == "note-pinned")
        .expect("pinned note");
    assert_eq!(pinned_note.pinned_at, Some(1_753_200_003_000));

    let loose_note = archive
        .nodes
        .iter()
        .find(|node| node.id == "note-loose")
        .expect("loose note");
    assert_eq!(loose_note.pinned_at, None);
}

#[test]
fn pre_pinning_archives_import_with_all_nodes_unpinned() {
    let archive = load_fixture_archive("v1/representative.json");
    assert!(!archive.nodes.is_empty());
    assert!(archive.nodes.iter().all(|node| node.pinned_at.is_none()));
    archive.validate().expect("v1 archive stays valid");
}

#[test]
fn future_archive_versions_fail_explicitly() {
    let mut value = load_fixture_value("v1/representative.json");
    value["archiveVersion"] = json!(3);
    let future =
        serde_json::from_value::<WorkspaceArchive>(value).expect("parse future-version archive");
    assert_eq!(
        future.validate(),
        Err(ArchiveValidationError::UnsupportedArchiveVersion(3))
    );

    let mut value = load_fixture_value("v1/representative.json");
    value["protocolVersion"] = json!(2);
    let future =
        serde_json::from_value::<WorkspaceArchive>(value).expect("parse future-protocol archive");
    assert_eq!(
        future.validate(),
        Err(ArchiveValidationError::UnsupportedProtocol(2))
    );
}
