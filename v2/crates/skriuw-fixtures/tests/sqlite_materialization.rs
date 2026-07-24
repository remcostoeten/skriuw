use std::time::Instant;

use skriuw_fixtures::{
    FIXTURE_SETTINGS_EXTENSION_KEY, FixtureSpec, TreeShape, WorkspaceFixture,
    generate_workspace_fixture, note_id,
};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{WorkspaceMaintenance, WorkspaceStorage};

const MATERIALIZATION_BATCH_SIZE: usize = 512;

fn materialize(storage: &SqliteWorkspace, fixture: &WorkspaceFixture) {
    for batch in fixture.operation_batches(MATERIALIZATION_BATCH_SIZE) {
        storage.apply_operations(&batch).expect("apply batch");
    }
}

fn assert_fixture_state(storage: &SqliteWorkspace, fixture: &WorkspaceFixture, spec: FixtureSpec) {
    let snapshot = storage.bootstrap().expect("bootstrap");
    let metadata = &fixture.metadata;
    assert_eq!(snapshot.nodes.len(), metadata.node_count);
    assert_eq!(snapshot.documents.len(), metadata.document_count);
    assert_eq!(
        snapshot.active_note_id.as_deref(),
        Some(note_id(spec, 1).as_str())
    );
    assert_eq!(
        snapshot.settings.extensions[FIXTURE_SETTINGS_EXTENSION_KEY],
        serde_json::Value::String(metadata.name.clone())
    );
    assert!(snapshot.unavailable_node_ids().is_empty());

    for expectation in &metadata.search_expectations {
        let hits = storage
            .search(&expectation.term, metadata.note_count.max(1))
            .expect("search");
        assert_eq!(
            hits.len(),
            expectation.expected_note_matches,
            "{} {}",
            metadata.name,
            expectation.term
        );
    }

    let archive = storage.export_archive(1).expect("export archive");
    archive.validate().expect("archive validates");
    assert_eq!(archive.nodes.len(), metadata.node_count);

    let report = storage.integrity_check().expect("integrity check");
    assert!(report.healthy, "{:?}", report.issues);
}

#[test]
fn small_mixed_fixture_materializes_into_sqlite() {
    let spec = FixtureSpec {
        shape: TreeShape::Mixed,
        note_count: 120,
    };
    let fixture = generate_workspace_fixture(spec);
    let storage = SqliteWorkspace::open_in_memory().expect("open in-memory workspace");
    materialize(&storage, &fixture);
    assert_fixture_state(&storage, &fixture, spec);
}

#[test]
#[ignore = "manual scale fixture materialization"]
fn mixed_5000_note_fixture_materializes_into_sqlite() {
    let spec = FixtureSpec {
        shape: TreeShape::Mixed,
        note_count: 5_000,
    };
    let fixture = generate_workspace_fixture(spec);
    let directory = tempfile::tempdir().expect("temporary directory");
    let storage =
        SqliteWorkspace::open(directory.path().join("fixture-5000.db")).expect("open workspace");

    let started = Instant::now();
    materialize(&storage, &fixture);
    let elapsed = started.elapsed();

    assert_fixture_state(&storage, &fixture, spec);
    println!(
        "materialized {} operations for {} in {:.3?}",
        fixture.metadata.operation_count, fixture.metadata.name, elapsed
    );
}
