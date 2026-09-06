//! In-process propagation measurement for `docs/benchmarks/2026-09-05-sync-propagation.md`.
//!
//! Two real SQLite workspace files, two coordinator threads, one fake server,
//! and the fake wake channel wired as the service wires it: an accepted push
//! on device A wakes device B. The measured span is the interactive commit on
//! A up to B's workspace observer reporting the applied change.

#[allow(dead_code)]
mod support;

use std::{
    sync::{Arc, Weak, mpsc},
    time::{Duration, Instant},
};

use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{
    NewSyncConnection, WorkspaceMaintenance, WorkspaceStorage, WorkspaceSyncQueue,
};
use skriuw_sync::{
    RemoteChangeSet, SyncCoordinator, SyncCoordinatorConfig, SyncStatus, SyncTransport,
};
use support::{FakeServer, FakeTransport, create_note, save_document};

const WORKSPACE: &str = "workspace-1";
const EDITS: usize = 100;
const BOUND: Duration = Duration::from_secs(2);

fn connect(storage: &SqliteWorkspace, device_id: &str) {
    storage
        .connect_sync(&NewSyncConnection {
            workspace_id: WORKSPACE.into(),
            device_id: device_id.into(),
            connected_at: 1,
            observed_server_sequence: 0,
        })
        .expect("connect sync");
}

fn wait_for_status(coordinator: &SyncCoordinator, accept: impl Fn(&SyncStatus) -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !accept(&coordinator.status()) {
        assert!(
            Instant::now() < deadline,
            "timed out: {:?}",
            coordinator.status()
        );
        std::thread::sleep(Duration::from_millis(2));
    }
}

fn percentile(sorted: &[Duration], percentile: usize) -> Duration {
    sorted[(sorted.len() * percentile / 100).min(sorted.len() - 1)]
}

#[test]
fn commit_to_peer_observer_latency_stays_under_two_seconds() {
    let directory = tempfile::tempdir().expect("temp directory");
    let path_a = directory.path().join("device-a.db");
    let path_b = directory.path().join("device-b.db");
    let server = FakeServer::new(WORKSPACE);

    let storage_a = Arc::new(SqliteWorkspace::open(&path_a).expect("open a"));
    let storage_b = Arc::new(SqliteWorkspace::open(&path_b).expect("open b"));
    connect(&storage_a, "device-a");
    connect(&storage_b, "device-b");
    let transport_a = FakeTransport::new(&server, "device-a");
    let transport_b = FakeTransport::new(&server, "device-b");

    let (changed, changes) = mpsc::channel::<RemoteChangeSet>();
    let coordinator_b = Arc::new(SyncCoordinator::spawn(
        Arc::clone(&storage_b) as Arc<dyn WorkspaceSyncQueue>,
        Arc::clone(&storage_b) as Arc<dyn WorkspaceMaintenance>,
        Arc::clone(&transport_b) as Arc<dyn SyncTransport>,
        support::FakeAssetStore::new(),
        Arc::new(skriuw_sync::SystemClock),
        SyncCoordinatorConfig {
            workspace_observer: Some(Arc::new(move |change: &RemoteChangeSet| {
                let _ = changed.send(change.clone());
            })),
            ..SyncCoordinatorConfig::default()
        },
    ));
    let wake_target: Weak<SyncCoordinator> = Arc::downgrade(&coordinator_b);
    transport_a.set_push_committed_hook(Box::new(move || {
        if let Some(coordinator) = wake_target.upgrade() {
            coordinator.notify_remote_change();
        }
    }));
    let coordinator_a = SyncCoordinator::spawn(
        Arc::clone(&storage_a) as Arc<dyn WorkspaceSyncQueue>,
        Arc::clone(&storage_a) as Arc<dyn WorkspaceMaintenance>,
        Arc::clone(&transport_a) as Arc<dyn SyncTransport>,
        support::FakeAssetStore::new(),
        Arc::new(skriuw_sync::SystemClock),
        SyncCoordinatorConfig::default(),
    );
    wait_for_status(&coordinator_a, |status| *status == SyncStatus::UpToDate);
    wait_for_status(&coordinator_b, |status| *status == SyncStatus::UpToDate);

    let interactive_a = SqliteWorkspace::open(&path_a).expect("open interactive a");
    interactive_a
        .apply_operations(&[create_note("note-1", "Measured", 1)])
        .expect("create note");
    coordinator_a.notify_local_commit();
    let seeded = changes
        .recv_timeout(Duration::from_secs(10))
        .expect("seed reached device b");
    assert!(seeded.note_ids.contains(&"note-1".to_string()));

    let mut latencies = Vec::with_capacity(EDITS);
    for index in 0..EDITS {
        let started = Instant::now();
        interactive_a
            .apply_operations(&[save_document(
                "note-1",
                index as i64 + 1,
                &format!("Edit {index}"),
                (index as i64) + 2,
            )])
            .expect("save document");
        coordinator_a.notify_local_commit();
        let change = changes
            .recv_timeout(Duration::from_secs(10))
            .expect("edit reached device b");
        latencies.push(started.elapsed());
        assert_eq!(change.note_ids, ["note-1"]);
        assert!(!change.structure_changed);
    }
    latencies.sort();
    let p50 = percentile(&latencies, 50);
    let p95 = percentile(&latencies, 95);
    let max = latencies[latencies.len() - 1];
    println!(
        "commit -> peer observer latency over {EDITS} edits: p50 {p50:?} p95 {p95:?} max {max:?}"
    );

    wait_for_status(&coordinator_b, |status| *status == SyncStatus::UpToDate);
    let body_b = storage_b.bootstrap().expect("bootstrap b").documents[0]
        .markdown
        .clone();
    assert_eq!(body_b, format!("Edit {}", EDITS - 1));
    assert!(p95 < BOUND, "p95 {p95:?} exceeds {BOUND:?}");

    coordinator_a.shutdown();
    coordinator_b.shutdown();
}
