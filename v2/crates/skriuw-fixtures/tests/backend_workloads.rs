use std::{path::Path, sync::Arc, time::Instant};

use skriuw_fixtures::{
    FIXTURE_SETTINGS_EXTENSION_KEY, FixtureSpec, TreeShape, WorkspaceFixture, fixture_digest,
    generate_workspace_fixture, note_id,
};
use skriuw_history::{HistoryWorkResult, HistoryWorker, rebuild_history_cache};
use skriuw_history_git::{GitHistoryMaterializer, GitHistoryReader};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{HistoryQueue, WorkspaceMaintenance, WorkspaceStorage};
use tempfile::TempDir;

const MATERIALIZATION_BATCH_SIZE: usize = 512;
const ARCHIVE_EXPORTED_AT_MS: i64 = 1_753_100_000_000;
const HISTORY_WORKER_ID: &str = "workload-history-worker";
const HISTORY_VERIFIER_ID: &str = "workload-history-verifier";
const HISTORY_NOW_MS: i64 = 1_900_000_000_000;
const HISTORY_LEASE_MS: i64 = 60_000;
const IMPORT_SAMPLES: usize = 5;
const BOOTSTRAP_SAMPLES: usize = 5;
const HISTORY_DRAIN_SAMPLES_1000: usize = 5;
const HISTORY_DRAIN_SAMPLES_5000: usize = 3;
const HISTORY_REBUILD_SAMPLES: usize = 5;

fn mixed_spec(note_count: usize) -> FixtureSpec {
    FixtureSpec {
        shape: TreeShape::Mixed,
        note_count,
    }
}

fn materialize(storage: &SqliteWorkspace, fixture: &WorkspaceFixture) {
    for batch in fixture.operation_batches(MATERIALIZATION_BATCH_SIZE) {
        storage
            .apply_operations(&batch)
            .expect("apply fixture batch");
    }
}

fn assert_core_snapshot_state(
    storage: &SqliteWorkspace,
    fixture: &WorkspaceFixture,
    spec: FixtureSpec,
) {
    let snapshot = storage.bootstrap().expect("bootstrap");
    let metadata = &fixture.metadata;
    assert_eq!(
        snapshot.nodes.len(),
        metadata.node_count,
        "{}",
        metadata.name
    );
    assert_eq!(
        snapshot.documents.len(),
        metadata.document_count,
        "{}",
        metadata.name
    );
    assert_eq!(
        snapshot.active_note_id.as_deref(),
        Some(note_id(spec, 1).as_str()),
        "{}",
        metadata.name
    );
    assert_eq!(
        snapshot.settings.extensions[FIXTURE_SETTINGS_EXTENSION_KEY],
        serde_json::Value::String(metadata.name.clone()),
        "{}",
        metadata.name
    );
    assert!(
        snapshot.unavailable_node_ids().is_empty(),
        "{}",
        metadata.name
    );
}

fn assert_healthy_integrity(storage: &SqliteWorkspace, name: &str) {
    let report = storage.integrity_check().expect("integrity check");
    assert!(report.healthy, "{name}: {:?}", report.issues);
}

fn verified_source_archive(
    fixture: &WorkspaceFixture,
    spec: FixtureSpec,
) -> skriuw_domain::WorkspaceArchive {
    let source = SqliteWorkspace::open_in_memory().expect("open source workspace");
    materialize(&source, fixture);
    assert_core_snapshot_state(&source, fixture, spec);
    assert_healthy_integrity(&source, &fixture.metadata.name);
    let archive = source
        .export_archive(ARCHIVE_EXPORTED_AT_MS)
        .expect("export source archive");
    archive.validate().expect("source archive validates");
    assert_eq!(archive.nodes.len(), fixture.metadata.node_count);
    assert_eq!(archive.documents.len(), fixture.metadata.document_count);
    archive
}

fn import_workspace(
    archive: &skriuw_domain::WorkspaceArchive,
    fixture: &WorkspaceFixture,
) -> (TempDir, Arc<SqliteWorkspace>) {
    let directory = tempfile::tempdir().expect("temporary directory");
    let storage = Arc::new(
        SqliteWorkspace::open(directory.path().join("workload.db")).expect("open workspace"),
    );
    let summary = storage
        .replace_from_archive(archive)
        .expect("replace from archive");
    assert_eq!(summary.nodes, fixture.metadata.node_count);
    assert_eq!(summary.documents, fixture.metadata.document_count);
    assert_eq!(summary.history_items, fixture.metadata.document_count);
    (directory, storage)
}

fn drain_history_outbox(
    worker: &HistoryWorker<Arc<SqliteWorkspace>, GitHistoryMaterializer>,
) -> usize {
    let mut materialized = 0usize;
    loop {
        match worker
            .process_next(HISTORY_NOW_MS, HISTORY_LEASE_MS)
            .expect("process history item")
        {
            HistoryWorkResult::Idle => return materialized,
            HistoryWorkResult::Materialized { .. } => materialized += 1,
        }
    }
}

fn assert_history_state(storage: &SqliteWorkspace, git_root: &Path, fixture: &WorkspaceFixture) {
    let name = &fixture.metadata.name;
    let reader = GitHistoryReader::open(git_root).expect("open history reader");
    let report = reader.integrity_check().expect("history integrity check");
    assert!(report.healthy(), "{name}: {:?}", report.issues);
    assert_eq!(report.commit_count, fixture.metadata.note_count, "{name}");
    assert_eq!(report.note_count, fixture.metadata.note_count, "{name}");

    let snapshot = storage.bootstrap().expect("bootstrap after history");
    assert_eq!(
        snapshot.history_headers.len(),
        fixture.metadata.note_count,
        "{name}"
    );
    assert!(
        storage
            .claim_history_revision(HISTORY_VERIFIER_ID, HISTORY_NOW_MS + 1, HISTORY_LEASE_MS)
            .expect("claim after drain")
            .is_none(),
        "{name}: history outbox is not empty"
    );
}

fn median_ms(samples: &[f64]) -> f64 {
    assert!(!samples.is_empty());
    let mut sorted = samples.to_vec();
    sorted.sort_by(|left, right| left.partial_cmp(right).expect("finite sample"));
    let middle = sorted.len() / 2;
    if sorted.len() % 2 == 1 {
        sorted[middle]
    } else {
        (sorted[middle - 1] + sorted[middle]) / 2.0
    }
}

fn elapsed_ms(started: Instant) -> f64 {
    started.elapsed().as_secs_f64() * 1_000.0
}

fn print_fixture_banner(fixture: &WorkspaceFixture) {
    println!(
        "fixture {} digest {} operations {} batch {}",
        fixture.metadata.name,
        fixture_digest(fixture),
        fixture.metadata.operation_count,
        MATERIALIZATION_BATCH_SIZE
    );
}

#[test]
fn import_and_bootstrap_return_generated_fixture_state() {
    let spec = mixed_spec(120);
    let fixture = generate_workspace_fixture(spec);
    let archive = verified_source_archive(&fixture, spec);
    let (_directory, storage) = import_workspace(&archive, &fixture);

    assert_core_snapshot_state(&storage, &fixture, spec);
    for expectation in &fixture.metadata.search_expectations {
        let hits = storage
            .search(&expectation.term, fixture.metadata.note_count.max(1))
            .expect("search");
        assert_eq!(
            hits.len(),
            expectation.expected_note_matches,
            "{} {}",
            fixture.metadata.name,
            expectation.term
        );
    }
    assert_healthy_integrity(&storage, &fixture.metadata.name);
}

#[test]
fn history_processing_drains_outbox_and_rebuilds_cache() {
    let spec = mixed_spec(120);
    let fixture = generate_workspace_fixture(spec);
    let archive = verified_source_archive(&fixture, spec);
    let (directory, storage) = import_workspace(&archive, &fixture);
    let git_root = directory.path().join("history-git");
    let materializer = GitHistoryMaterializer::open(&git_root).expect("open history materializer");
    let worker = HistoryWorker::new(HISTORY_WORKER_ID, Arc::clone(&storage), materializer)
        .expect("create history worker");

    let materialized = drain_history_outbox(&worker);
    assert_eq!(materialized, fixture.metadata.note_count);
    assert_history_state(&storage, &git_root, &fixture);

    let reader = GitHistoryReader::open(&git_root).expect("open history reader");
    let published = rebuild_history_cache(&reader, &storage).expect("rebuild history cache");
    assert_eq!(published, fixture.metadata.note_count);
    assert_history_state(&storage, &git_root, &fixture);
    assert_healthy_integrity(&storage, &fixture.metadata.name);
}

#[test]
#[ignore = "manual backend workload measurement"]
fn benchmarks_import_workloads() {
    for note_count in [1_000usize, 5_000] {
        let spec = mixed_spec(note_count);
        let fixture = generate_workspace_fixture(spec);
        print_fixture_banner(&fixture);
        let archive = verified_source_archive(&fixture, spec);

        let mut open_samples = Vec::with_capacity(IMPORT_SAMPLES);
        let mut import_samples = Vec::with_capacity(IMPORT_SAMPLES);
        for sample in 1..=IMPORT_SAMPLES {
            let directory = tempfile::tempdir().expect("temporary directory");
            let database_path = directory.path().join("import.db");

            let open_started = Instant::now();
            let storage = SqliteWorkspace::open(&database_path).expect("open workspace");
            let open_ms = elapsed_ms(open_started);

            let import_started = Instant::now();
            let summary = storage
                .replace_from_archive(&archive)
                .expect("replace from archive");
            let import_ms = elapsed_ms(import_started);

            assert_eq!(summary.nodes, fixture.metadata.node_count);
            assert_eq!(summary.documents, fixture.metadata.document_count);
            assert_eq!(summary.history_items, fixture.metadata.document_count);
            assert_core_snapshot_state(&storage, &fixture, spec);
            assert_healthy_integrity(&storage, &fixture.metadata.name);

            println!(
                "import {} sample {sample}: open {open_ms:.3} ms, replace_from_archive {import_ms:.3} ms",
                fixture.metadata.name
            );
            open_samples.push(open_ms);
            import_samples.push(import_ms);
        }
        println!(
            "import {} median: open {:.3} ms, replace_from_archive {:.3} ms",
            fixture.metadata.name,
            median_ms(&open_samples),
            median_ms(&import_samples)
        );
    }
}

#[test]
#[ignore = "manual backend workload measurement"]
fn benchmarks_bootstrap_workloads() {
    for note_count in [1_000usize, 5_000] {
        let spec = mixed_spec(note_count);
        let fixture = generate_workspace_fixture(spec);
        print_fixture_banner(&fixture);
        let directory = tempfile::tempdir().expect("temporary directory");
        let database_path = directory.path().join("bootstrap.db");
        {
            let storage = SqliteWorkspace::open(&database_path).expect("open workspace");
            materialize(&storage, &fixture);
            assert_core_snapshot_state(&storage, &fixture, spec);
            assert_healthy_integrity(&storage, &fixture.metadata.name);
        }

        let mut open_samples = Vec::with_capacity(BOOTSTRAP_SAMPLES);
        let mut bootstrap_samples = Vec::with_capacity(BOOTSTRAP_SAMPLES);
        for sample in 1..=BOOTSTRAP_SAMPLES {
            let open_started = Instant::now();
            let storage = SqliteWorkspace::open(&database_path).expect("open workspace");
            let open_ms = elapsed_ms(open_started);

            let bootstrap_started = Instant::now();
            let snapshot = storage.bootstrap().expect("bootstrap");
            let bootstrap_ms = elapsed_ms(bootstrap_started);

            assert_eq!(snapshot.nodes.len(), fixture.metadata.node_count);
            assert_eq!(snapshot.documents.len(), fixture.metadata.document_count);
            assert_eq!(
                snapshot.active_note_id.as_deref(),
                Some(note_id(spec, 1).as_str())
            );

            println!(
                "bootstrap {} sample {sample}: open {open_ms:.3} ms, bootstrap {bootstrap_ms:.3} ms",
                fixture.metadata.name
            );
            open_samples.push(open_ms);
            bootstrap_samples.push(bootstrap_ms);
        }
        println!(
            "bootstrap {} median: open {:.3} ms, bootstrap {:.3} ms",
            fixture.metadata.name,
            median_ms(&open_samples),
            median_ms(&bootstrap_samples)
        );
    }
}

#[test]
#[ignore = "manual backend workload measurement"]
fn benchmarks_history_workloads() {
    for (note_count, drain_samples) in [
        (1_000usize, HISTORY_DRAIN_SAMPLES_1000),
        (5_000, HISTORY_DRAIN_SAMPLES_5000),
    ] {
        let spec = mixed_spec(note_count);
        let fixture = generate_workspace_fixture(spec);
        print_fixture_banner(&fixture);
        let archive = verified_source_archive(&fixture, spec);

        let mut drain_sample_values = Vec::with_capacity(drain_samples);
        let mut last_environment = None;
        for sample in 1..=drain_samples {
            let (directory, storage) = import_workspace(&archive, &fixture);
            let git_root = directory.path().join("history-git");
            let materializer =
                GitHistoryMaterializer::open(&git_root).expect("open history materializer");
            let worker = HistoryWorker::new(HISTORY_WORKER_ID, Arc::clone(&storage), materializer)
                .expect("create history worker");

            let drain_started = Instant::now();
            let materialized = drain_history_outbox(&worker);
            let drain_ms = elapsed_ms(drain_started);

            assert_eq!(materialized, fixture.metadata.note_count);
            assert_history_state(&storage, &git_root, &fixture);

            println!(
                "history {} sample {sample}: outbox_to_git {drain_ms:.3} ms for {materialized} commits",
                fixture.metadata.name
            );
            drain_sample_values.push(drain_ms);
            last_environment = Some((directory, storage, git_root));
        }
        println!(
            "history {} median: outbox_to_git {:.3} ms",
            fixture.metadata.name,
            median_ms(&drain_sample_values)
        );

        let (_directory, storage, git_root) =
            last_environment.expect("history drain produced an environment");
        let reader = GitHistoryReader::open(&git_root).expect("open history reader");
        let mut rebuild_sample_values = Vec::with_capacity(HISTORY_REBUILD_SAMPLES);
        for sample in 1..=HISTORY_REBUILD_SAMPLES {
            let rebuild_started = Instant::now();
            let published =
                rebuild_history_cache(&reader, &storage).expect("rebuild history cache");
            let rebuild_ms = elapsed_ms(rebuild_started);

            assert_eq!(published, fixture.metadata.note_count);

            println!(
                "history {} sample {sample}: validated_cache_rebuild {rebuild_ms:.3} ms for {published} headers",
                fixture.metadata.name
            );
            rebuild_sample_values.push(rebuild_ms);
        }
        println!(
            "history {} median: validated_cache_rebuild {:.3} ms",
            fixture.metadata.name,
            median_ms(&rebuild_sample_values)
        );
        assert_history_state(&storage, &git_root, &fixture);
    }
}
