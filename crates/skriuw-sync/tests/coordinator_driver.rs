#[allow(dead_code)]
mod support;

use std::{
    sync::{
        Arc, Mutex, RwLock,
        atomic::{AtomicUsize, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};

use skriuw_domain::{SyncPullResponse, SyncPushRequest, SyncPushResponse, WorkspaceCheckpoint};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{
    NewSyncConnection, WorkspaceMaintenance, WorkspaceStorage, WorkspaceSyncQueue,
};
use skriuw_sync::{
    SyncCancellation, SyncCoordinator, SyncCoordinatorConfig, SyncPollIntervals, SyncStatus,
    SyncTransport, TransportError,
};
use support::{FakeServer, FakeTransport, PushFault, create_note};

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

fn wait_until(accept: impl Fn() -> bool, what: &str) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !accept() {
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
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

    fn latest_checkpoint(
        &self,
        workspace_id: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Option<WorkspaceCheckpoint>, TransportError> {
        self.inner.latest_checkpoint(workspace_id, cancellation)
    }

    fn publish_checkpoint(
        &self,
        workspace_id: &str,
        checkpoint: &WorkspaceCheckpoint,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.inner
            .publish_checkpoint(workspace_id, checkpoint, cancellation)
    }

    fn acknowledge(
        &self,
        workspace_id: &str,
        device_id: &str,
        server_sequence: u64,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.inner
            .acknowledge(workspace_id, device_id, server_sequence, cancellation)
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

    fn latest_checkpoint(
        &self,
        _workspace_id: &str,
        _cancellation: &SyncCancellation,
    ) -> Result<Option<WorkspaceCheckpoint>, TransportError> {
        Ok(None)
    }

    fn publish_checkpoint(
        &self,
        _workspace_id: &str,
        _checkpoint: &WorkspaceCheckpoint,
        _cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        Ok(())
    }

    fn acknowledge(
        &self,
        _workspace_id: &str,
        _device_id: &str,
        _server_sequence: u64,
        _cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        Ok(())
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

/// Reads the shared session token on every call like the production
/// transports and answers with an expired session while it says so.
struct TokenCheckedTransport {
    inner: Arc<FakeTransport>,
    token: Arc<RwLock<String>>,
}

impl TokenCheckedTransport {
    fn session(&self) -> Result<(), TransportError> {
        let token = self.token.read().expect("token").clone();
        if token == "expired" {
            Err(TransportError::AuthenticationRequired)
        } else {
            Ok(())
        }
    }
}

impl SyncTransport for TokenCheckedTransport {
    fn has_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<bool, TransportError> {
        self.session()?;
        self.inner.has_chunk(workspace_id, digest, cancellation)
    }

    fn put_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        bytes: &[u8],
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.session()?;
        self.inner
            .put_chunk(workspace_id, digest, bytes, cancellation)
    }

    fn get_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Vec<u8>, TransportError> {
        self.session()?;
        self.inner.get_chunk(workspace_id, digest, cancellation)
    }

    fn latest_checkpoint(
        &self,
        workspace_id: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Option<WorkspaceCheckpoint>, TransportError> {
        self.session()?;
        self.inner.latest_checkpoint(workspace_id, cancellation)
    }

    fn publish_checkpoint(
        &self,
        workspace_id: &str,
        checkpoint: &WorkspaceCheckpoint,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.session()?;
        self.inner
            .publish_checkpoint(workspace_id, checkpoint, cancellation)
    }

    fn acknowledge(
        &self,
        workspace_id: &str,
        device_id: &str,
        server_sequence: u64,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.session()?;
        self.inner
            .acknowledge(workspace_id, device_id, server_sequence, cancellation)
    }

    fn push(
        &self,
        workspace_id: &str,
        request: &SyncPushRequest,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPushResponse, TransportError> {
        self.session()?;
        self.inner.push(workspace_id, request, cancellation)
    }

    fn pull(
        &self,
        workspace_id: &str,
        after_server_sequence: u64,
        limit: usize,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPullResponse, TransportError> {
        self.session()?;
        self.inner
            .pull(workspace_id, after_server_sequence, limit, cancellation)
    }
}

fn spawn_coordinator(
    queue: Arc<SqliteWorkspace>,
    transport: Arc<dyn SyncTransport>,
) -> SyncCoordinator {
    spawn_coordinator_with(queue, transport, SyncCoordinatorConfig::default())
}

fn spawn_coordinator_with(
    queue: Arc<SqliteWorkspace>,
    transport: Arc<dyn SyncTransport>,
    config: SyncCoordinatorConfig,
) -> SyncCoordinator {
    let workspace = Arc::clone(&queue);
    SyncCoordinator::spawn(
        queue,
        workspace,
        transport,
        support::FakeAssetStore::new(),
        Arc::new(skriuw_sync::SystemClock),
        config,
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

    coordinator.resume_with_session("fresh-token");
    wait_for_status(&coordinator, |status| {
        *status == SyncStatus::UpToDate && server.log_len() == 1
    });
    coordinator.shutdown();
}

#[test]
fn sign_out_mid_push_preserves_the_outbox_and_resume_pushes_once() {
    let server = FakeServer::new(WORKSPACE);
    let storage = Arc::new(SqliteWorkspace::open_in_memory().expect("open database"));
    connect(&storage, "device-a");
    storage
        .apply_operations(&[create_note("note-1", "Mid-push sign-out", 1)])
        .expect("apply operation");
    let transport = FakeTransport::new(&server, "device-a");
    let (push_started, started) = mpsc::channel();
    let hold = Arc::new(Mutex::new(true));
    let gate = Arc::clone(&hold);
    transport.set_push_hook(Box::new(move |cancellation| {
        let _ = push_started.send(());
        while *gate.lock().expect("gate") && !cancellation.is_cancelled() {
            thread::sleep(Duration::from_millis(1));
        }
    }));
    let coordinator = spawn_coordinator(
        Arc::clone(&storage),
        Arc::clone(&transport) as Arc<dyn SyncTransport>,
    );
    started
        .recv_timeout(Duration::from_secs(10))
        .expect("push started");

    coordinator.pause_for_logout();
    wait_for_status(&coordinator, |status| {
        *status == SyncStatus::AuthenticationRequired
    });
    assert_eq!(server.log_len(), 0, "the interrupted push never landed");
    assert!(
        storage
            .has_pending_sync_operations()
            .expect("pending operations"),
        "the outbox survives the sign-out"
    );
    assert_eq!(transport.push_calls(), 1);

    *hold.lock().expect("gate") = false;
    coordinator.resume_with_session("fresh-token");
    wait_for_status(&coordinator, |status| {
        *status == SyncStatus::UpToDate && server.log_len() == 1
    });
    thread::sleep(Duration::from_millis(30));
    assert_eq!(
        transport.push_calls(),
        2,
        "resume pushes the preserved operation exactly once"
    );
    assert_eq!(server.operation_ids().len(), 1);
    coordinator.shutdown();
}

#[test]
fn an_expired_session_stops_polling_and_a_refreshed_token_resumes_through_the_shared_lock() {
    let server = FakeServer::new(WORKSPACE);
    let storage = Arc::new(SqliteWorkspace::open_in_memory().expect("open database"));
    connect(&storage, "device-a");
    let inner = FakeTransport::new(&server, "device-a");
    let token = Arc::new(RwLock::new("valid".to_string()));
    let transport = Arc::new(TokenCheckedTransport {
        inner: Arc::clone(&inner),
        token: Arc::clone(&token),
    });
    let observed = Arc::new(Mutex::new(Vec::<SyncStatus>::new()));
    let sink = Arc::clone(&observed);
    let coordinator = spawn_coordinator_with(
        Arc::clone(&storage),
        transport as Arc<dyn SyncTransport>,
        SyncCoordinatorConfig {
            session_token: Some(Arc::clone(&token)),
            status_observer: Some(Arc::new(move |status: &SyncStatus| {
                sink.lock().expect("observed").push(status.clone());
            })),
            ..SyncCoordinatorConfig::default()
        },
    );
    wait_for_status(&coordinator, |status| *status == SyncStatus::UpToDate);

    *token.write().expect("token") = "expired".into();
    storage
        .apply_operations(&[create_note("note-1", "Waits for a session", 1)])
        .expect("apply operation");
    coordinator.notify_local_commit();
    wait_for_status(&coordinator, |status| {
        *status == SyncStatus::AuthenticationRequired
    });
    let calls_when_expired = inner.total_calls();
    coordinator.notify_local_commit();
    coordinator.notify_focus();
    thread::sleep(Duration::from_millis(50));
    assert_eq!(
        inner.total_calls(),
        calls_when_expired,
        "no cycle runs against a dead session"
    );
    assert_eq!(
        observed
            .lock()
            .expect("observed")
            .iter()
            .filter(|status| **status == SyncStatus::AuthenticationRequired)
            .count(),
        1,
        "the observer sees the expiry exactly once"
    );

    coordinator.resume_with_session("renewed");
    assert_eq!(token.read().expect("token").as_str(), "renewed");
    wait_for_status(&coordinator, |status| {
        *status == SyncStatus::UpToDate && server.log_len() == 1
    });
    coordinator.shutdown();
}

#[test]
fn offline_is_a_hint_that_probes_and_clears_on_any_wake() {
    let server = FakeServer::new(WORKSPACE);
    let storage = Arc::new(SqliteWorkspace::open_in_memory().expect("open database"));
    connect(&storage, "device-a");
    let transport = FakeTransport::new(&server, "device-a");
    let coordinator = spawn_coordinator_with(
        Arc::clone(&storage),
        Arc::clone(&transport) as Arc<dyn SyncTransport>,
        SyncCoordinatorConfig {
            poll: SyncPollIntervals {
                offline_probe_ms: 40,
                ..SyncPollIntervals::default()
            },
            ..SyncCoordinatorConfig::default()
        },
    );
    wait_for_status(&coordinator, |status| *status == SyncStatus::UpToDate);

    transport.script_push_fault(PushFault::Transient);
    transport.script_push_fault(PushFault::Transient);
    storage
        .apply_operations(&[create_note("note-1", "Offline edit", 1)])
        .expect("apply operation");
    coordinator.set_online(false);
    wait_for_status(&coordinator, |status| *status == SyncStatus::Offline);
    let calls_when_offline = transport.total_calls();

    wait_until(
        || transport.total_calls() > calls_when_offline,
        "an offline probe",
    );
    assert_eq!(
        coordinator.status(),
        SyncStatus::Offline,
        "a failed probe keeps the offline projection instead of retrying"
    );

    coordinator.notify_local_commit();
    wait_for_status(&coordinator, |status| {
        *status == SyncStatus::UpToDate && server.log_len() == 1
    });
    coordinator.shutdown();
}

#[test]
fn reconnecting_resets_the_backoff_and_refresh_clears_durable_retry_times() {
    let server = FakeServer::new(WORKSPACE);
    let storage = Arc::new(SqliteWorkspace::open_in_memory().expect("open database"));
    connect(&storage, "device-a");
    let transport = FakeTransport::new(&server, "device-a");
    let coordinator = spawn_coordinator(
        Arc::clone(&storage),
        Arc::clone(&transport) as Arc<dyn SyncTransport>,
    );
    wait_for_status(&coordinator, |status| *status == SyncStatus::UpToDate);

    transport.script_push_fault(PushFault::RateLimited(600_000));
    storage
        .apply_operations(&[create_note("note-1", "Rate limited", 1)])
        .expect("apply operation");
    coordinator.notify_local_commit();
    wait_for_status(&coordinator, |status| {
        matches!(status, SyncStatus::Retrying { .. })
    });
    assert!(
        storage
            .next_sync_attempt_at()
            .expect("next attempt")
            .is_some(),
        "the rate limit left a durable retry time"
    );

    coordinator.request_refresh();
    wait_for_status(&coordinator, |status| {
        *status == SyncStatus::UpToDate && server.log_len() == 1
    });
    assert_eq!(storage.next_sync_attempt_at().expect("next attempt"), None);
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
    coordinator.set_visibility(false, false);
    coordinator.set_wake_channel_connected(true);
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

/// Representative measurement against `docs/performance-contract.md`,
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
