#[allow(dead_code)]
mod support;

use std::{
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};

use skriuw_domain::{SyncPullResponse, SyncPushRequest, SyncPushResponse};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{
    NewSyncConnection, WorkspaceMaintenance, WorkspaceStorage, WorkspaceSyncQueue,
};
use skriuw_sync::{
    SyncCancellation, SyncCoordinator, SyncCoordinatorConfig, SyncStatus, SyncTransport,
    TransportError,
};
use support::{FakeServer, FakeTransport, create_note};

const WORKSPACE: &str = "workspace-1";

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

fn wait_for_status(
    coordinator: &SyncCoordinator,
    accept: impl Fn(&SyncStatus) -> bool,
) -> SyncStatus {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let status = coordinator.status();
        if accept(&status) {
            return status;
        }
        assert!(
            Instant::now() < deadline,
            "timed out waiting for status, last status: {status:?}"
        );
        thread::sleep(Duration::from_millis(5));
    }
}

struct ConcurrencyProbeTransport {
    inner: Arc<FakeTransport>,
    active: AtomicUsize,
    maximum: AtomicUsize,
}

impl ConcurrencyProbeTransport {
    fn enter(&self) {
        let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
        self.maximum.fetch_max(active, Ordering::SeqCst);
        thread::sleep(Duration::from_millis(2));
    }

    fn exit(&self) {
        self.active.fetch_sub(1, Ordering::SeqCst);
    }
}

impl SyncTransport for ConcurrencyProbeTransport {
    fn has_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<bool, TransportError> {
        self.inner.has_chunk(workspace_id, digest, cancellation)
    }

    fn put_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        bytes: &[u8],
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.inner
            .put_chunk(workspace_id, digest, bytes, cancellation)
    }

    fn get_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Vec<u8>, TransportError> {
        self.inner.get_chunk(workspace_id, digest, cancellation)
    }

    fn push(
        &self,
        workspace_id: &str,
        request: &SyncPushRequest,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPushResponse, TransportError> {
        self.enter();
        let result = self.inner.push(workspace_id, request, cancellation);
        self.exit();
        result
    }

    fn pull(
        &self,
        workspace_id: &str,
        after_server_sequence: u64,
        limit: usize,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPullResponse, TransportError> {
        self.enter();
        let result = self
            .inner
            .pull(workspace_id, after_server_sequence, limit, cancellation);
        self.exit();
        result
    }
}

struct BlockingTransport {
    push_started: mpsc::Sender<()>,
}

impl SyncTransport for BlockingTransport {
    fn has_chunk(
        &self,
        _workspace_id: &str,
        _digest: &str,
        _cancellation: &SyncCancellation,
    ) -> Result<bool, TransportError> {
        Ok(true)
    }

    fn put_chunk(
        &self,
        _workspace_id: &str,
        _digest: &str,
        _bytes: &[u8],
        _cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        Ok(())
    }

    fn get_chunk(
        &self,
        _workspace_id: &str,
        _digest: &str,
        _cancellation: &SyncCancellation,
    ) -> Result<Vec<u8>, TransportError> {
        Err(TransportError::Transient("no content".into()))
    }

    fn push(
        &self,
        _workspace_id: &str,
        _request: &SyncPushRequest,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPushResponse, TransportError> {
        let _ = self.push_started.send(());
        while !cancellation.is_cancelled() {
            thread::sleep(Duration::from_millis(1));
        }
        Err(TransportError::Cancelled)
    }

    fn pull(
        &self,
        _workspace_id: &str,
        _after_server_sequence: u64,
        _limit: usize,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPullResponse, TransportError> {
        while !cancellation.is_cancelled() {
            thread::sleep(Duration::from_millis(1));
        }
        Err(TransportError::Cancelled)
    }
}

fn spawn_coordinator(
    queue: Arc<SqliteWorkspace>,
    transport: Arc<dyn SyncTransport>,
) -> SyncCoordinator {
    SyncCoordinator::spawn(
        queue,
        transport,
        Arc::new(skriuw_sync::SystemClock),
        SyncCoordinatorConfig::default(),
    )
}

#[test]
fn concurrent_triggers_never_create_duplicate_loops() {
    let server = FakeServer::new(WORKSPACE);
    let storage = Arc::new(SqliteWorkspace::open_in_memory().expect("open database"));
    connect(&storage, "device-a");
    let probe = Arc::new(ConcurrencyProbeTransport {
        inner: FakeTransport::new(&server, "device-a"),
        active: AtomicUsize::new(0),
        maximum: AtomicUsize::new(0),
    });
    let coordinator = Arc::new(spawn_coordinator(
        Arc::clone(&storage),
        Arc::clone(&probe) as Arc<dyn SyncTransport>,
    ));

    let mut triggers = Vec::new();
    for round in 0..4 {
        let coordinator = Arc::clone(&coordinator);
        let storage = Arc::clone(&storage);
        triggers.push(thread::spawn(move || {
            for index in 0..25 {
                let note_id = format!("note-{round}-{index}");
                storage
                    .apply_operations(&[create_note(&note_id, &note_id, 1)])
                    .expect("apply operation");
                coordinator.notify_local_commit();
                coordinator.notify_focus();
                coordinator.request_refresh();
            }
        }));
    }
    for trigger in triggers {
        trigger.join().expect("trigger thread");
    }
    coordinator.request_refresh();
    wait_for_status(&coordinator, |status| {
        *status == SyncStatus::UpToDate && server.log_len() == 100
    });

    assert_eq!(probe.maximum.load(Ordering::SeqCst), 1);
    assert_eq!(server.log_len(), 100);
    coordinator.shutdown();
}

#[test]
fn shutdown_cancels_inflight_work_without_losing_durable_state() {
    let directory = tempfile::tempdir().expect("temp directory");
    let database_path = directory.path().join("workspace.db");
    let storage = Arc::new(SqliteWorkspace::open(&database_path).expect("open database"));
    connect(&storage, "device-a");
    storage
        .apply_operations(&[create_note("note-1", "Survives shutdown", 1)])
        .expect("apply operation");

    let (push_started, started) = mpsc::channel();
    let coordinator = spawn_coordinator(
        Arc::clone(&storage),
        Arc::new(BlockingTransport { push_started }),
    );
    coordinator.notify_startup();
    started
        .recv_timeout(Duration::from_secs(10))
        .expect("push started");

    let shutdown_started = Instant::now();
    coordinator.shutdown();
    assert!(shutdown_started.elapsed() < Duration::from_secs(5));
    drop(coordinator);
    drop(storage);

    let server = FakeServer::new(WORKSPACE);
    let reopened = Arc::new(SqliteWorkspace::open(&database_path).expect("reopen database"));
    let transport = FakeTransport::new(&server, "device-a");
    let recovered = spawn_coordinator(Arc::clone(&reopened), transport as Arc<dyn SyncTransport>);
    wait_for_status(&recovered, |status| *status == SyncStatus::UpToDate);

    assert_eq!(server.log_len(), 1);
    recovered.shutdown();
}

#[test]
fn logout_pauses_sync_and_preserves_pending_work() {
    let server = FakeServer::new(WORKSPACE);
    let storage = Arc::new(SqliteWorkspace::open_in_memory().expect("open database"));
    connect(&storage, "device-a");
    let transport = FakeTransport::new(&server, "device-a");
    let coordinator = spawn_coordinator(
        Arc::clone(&storage),
        Arc::clone(&transport) as Arc<dyn SyncTransport>,
    );
    wait_for_status(&coordinator, |status| *status == SyncStatus::UpToDate);

    coordinator.pause_for_logout();
    wait_for_status(&coordinator, |status| {
        *status == SyncStatus::AuthenticationRequired
    });
    let calls_when_paused = transport.total_calls();
    storage
        .apply_operations(&[create_note("note-1", "Pending through logout", 1)])
        .expect("apply operation");
    coordinator.notify_local_commit();
    thread::sleep(Duration::from_millis(50));

    assert_eq!(transport.total_calls(), calls_when_paused);
    assert_eq!(server.log_len(), 0);
    assert_eq!(
        storage.bootstrap().expect("bootstrap").nodes[0].title,
        "Pending through logout"
    );

    coordinator.resume_with_session();
    wait_for_status(&coordinator, |status| {
        *status == SyncStatus::UpToDate && server.log_len() == 1
    });
    coordinator.shutdown();
}

#[test]
fn offline_transition_pauses_network_until_reconnected() {
    let server = FakeServer::new(WORKSPACE);
    let storage = Arc::new(SqliteWorkspace::open_in_memory().expect("open database"));
    connect(&storage, "device-a");
    let transport = FakeTransport::new(&server, "device-a");
    let coordinator = spawn_coordinator(
        Arc::clone(&storage),
        Arc::clone(&transport) as Arc<dyn SyncTransport>,
    );
    wait_for_status(&coordinator, |status| *status == SyncStatus::UpToDate);

    coordinator.set_online(false);
    wait_for_status(&coordinator, |status| *status == SyncStatus::Offline);
    let calls_when_offline = transport.total_calls();
    storage
        .apply_operations(&[create_note("note-1", "Offline edit", 1)])
        .expect("apply operation");
    coordinator.notify_local_commit();
    thread::sleep(Duration::from_millis(50));
    assert_eq!(transport.total_calls(), calls_when_offline);

    coordinator.notify_reconnected();
    wait_for_status(&coordinator, |status| {
        *status == SyncStatus::UpToDate && server.log_len() == 1
    });
    coordinator.shutdown();
}

#[test]
fn local_only_interactions_start_no_transport_work() {
    let directory = tempfile::tempdir().expect("temp directory");
    let database_path = directory.path().join("workspace.db");
    let server = FakeServer::new(WORKSPACE);
    let transport = FakeTransport::new(&server, "device-a");
    let coordinator_storage =
        Arc::new(SqliteWorkspace::open(&database_path).expect("open coordinator connection"));
    let coordinator = spawn_coordinator(
        Arc::clone(&coordinator_storage),
        Arc::clone(&transport) as Arc<dyn SyncTransport>,
    );
    wait_for_status(&coordinator, |status| *status == SyncStatus::LocalOnly);

    let interactive = SqliteWorkspace::open(&database_path).expect("open interactive connection");
    interactive
        .apply_operations(&[create_note("note-1", "Local note", 1)])
        .expect("apply operation");
    coordinator.notify_local_commit();
    interactive.search("Local", 10).expect("search");
    interactive.bootstrap().expect("bootstrap");
    interactive.export_archive(1).expect("export archive");
    interactive.integrity_check().expect("integrity check");
    coordinator.notify_focus();
    coordinator.request_refresh();
    thread::sleep(Duration::from_millis(75));

    assert_eq!(transport.total_calls(), 0);
    assert_eq!(coordinator.status(), SyncStatus::LocalOnly);
    coordinator.shutdown();
    assert_eq!(transport.total_calls(), 0);
}

#[test]
fn local_commits_complete_while_the_transport_is_blocked() {
    let directory = tempfile::tempdir().expect("temp directory");
    let database_path = directory.path().join("workspace.db");
    let coordinator_storage =
        Arc::new(SqliteWorkspace::open(&database_path).expect("open coordinator connection"));
    connect(&coordinator_storage, "device-a");
    let interactive = SqliteWorkspace::open(&database_path).expect("open interactive connection");
    interactive
        .apply_operations(&[create_note("note-0", "Seed", 1)])
        .expect("seed operation");

    let (push_started, started) = mpsc::channel();
    let coordinator = spawn_coordinator(
        Arc::clone(&coordinator_storage),
        Arc::new(BlockingTransport { push_started }),
    );
    coordinator.notify_startup();
    started
        .recv_timeout(Duration::from_secs(10))
        .expect("push started");

    let commits_started = Instant::now();
    for index in 1..=50 {
        let note_id = format!("note-{index}");
        interactive
            .apply_operations(&[create_note(&note_id, &note_id, 1)])
            .expect("apply while transport blocked");
        coordinator.notify_local_commit();
    }
    let elapsed = commits_started.elapsed();

    assert_eq!(interactive.bootstrap().expect("bootstrap").nodes.len(), 51);
    assert!(
        elapsed < Duration::from_secs(5),
        "50 local commits took {elapsed:?} while the transport was blocked"
    );
    coordinator.shutdown();
}

fn measure_commit_latencies(
    storage: &SqliteWorkspace,
    prefix: &str,
    samples: usize,
) -> Vec<Duration> {
    let mut latencies = Vec::with_capacity(samples);
    for index in 0..samples {
        let note_id = format!("{prefix}-{index}");
        let started = Instant::now();
        storage
            .apply_operations(&[create_note(&note_id, &note_id, 1)])
            .expect("apply measured operation");
        latencies.push(started.elapsed());
    }
    latencies.sort();
    latencies
}

fn percentile(latencies: &[Duration], percentile: usize) -> Duration {
    latencies[(latencies.len() * percentile / 100).min(latencies.len() - 1)]
}

/// Representative measurement against `v2/docs/performance-contract.md`,
/// excluded from shared CI because timing there is not deterministic. Run
/// with: `cargo test -p skriuw-sync --release -- --ignored --nocapture`.
#[test]
#[ignore = "manual performance measurement"]
fn measure_local_only_and_connected_commit_latency() {
    let directory = tempfile::tempdir().expect("temp directory");

    let local_path = directory.path().join("local-only.db");
    let local = SqliteWorkspace::open(&local_path).expect("open local-only database");
    let local_latencies = measure_commit_latencies(&local, "local", 200);

    let connected_path = directory.path().join("connected.db");
    let connected =
        Arc::new(SqliteWorkspace::open(&connected_path).expect("open connected database"));
    connect(&connected, "device-a");
    let server = FakeServer::new(WORKSPACE);
    let transport = FakeTransport::new(&server, "device-a");
    let interactive = SqliteWorkspace::open(&connected_path).expect("open interactive connection");
    let coordinator =
        spawn_coordinator(Arc::clone(&connected), transport as Arc<dyn SyncTransport>);
    let connected_latencies = measure_commit_latencies(&interactive, "connected", 200);
    for _ in 0..4 {
        coordinator.notify_local_commit();
    }
    wait_for_status(&coordinator, |status| {
        *status == SyncStatus::UpToDate && server.log_len() == 200
    });
    coordinator.shutdown();

    println!(
        "local-only commit latency: p50 {:?} p95 {:?} max {:?}",
        percentile(&local_latencies, 50),
        percentile(&local_latencies, 95),
        local_latencies[local_latencies.len() - 1],
    );
    println!(
        "connected commit latency with active coordinator: p50 {:?} p95 {:?} max {:?}",
        percentile(&connected_latencies, 50),
        percentile(&connected_latencies, 95),
        connected_latencies[connected_latencies.len() - 1],
    );
}
