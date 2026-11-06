#![cfg(not(target_arch = "wasm32"))]

use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};

use skriuw_domain::{
    SyncPullResponse, SyncPushRequest, SyncPushResponse, WorkspaceCheckpoint,
    WorkspaceEncryptionMarker,
};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_sync::{
    CloudOriginPolicy, ProvisionFailure, ProvisionedWorkspace, SyncAssetStore, SyncCancellation,
    SyncCloud, SyncHttpEndpoints, SyncProvisioner, SyncRuntime, SyncRuntimeConfig,
    SyncRuntimeError, SyncSessionToken, SyncStatus, SyncTransport, SystemClock, TransportError,
    TrustedCloudOrigin, WakeConnectError, WakeConnector, WakeListenerConfig, WakeSocket,
    trusted_cloud_base_url,
};

fn cloud() -> TrustedCloudOrigin {
    trusted_cloud_base_url("https://sync.skriuw.app", CloudOriginPolicy::RELEASE)
        .expect("trusted origin")
}

#[derive(Default)]
struct CloudState {
    provisions: AtomicUsize,
    hold_provisioning: AtomicBool,
    refuse_session: AtomicBool,
    wake_connects: AtomicUsize,
    tokens: Mutex<Vec<String>>,
}

impl CloudState {
    fn wait_for_provisions(&self, expected: usize) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while self.provisions.load(Ordering::SeqCst) < expected {
            assert!(Instant::now() < deadline, "provisioning never started");
            thread::sleep(Duration::from_millis(5));
        }
    }
}

struct FakeCloud {
    state: Arc<CloudState>,
    wake: bool,
}

struct FakeTransport {
    state: Arc<CloudState>,
    session: SyncSessionToken,
}

impl SyncCloud for FakeCloud {
    type Transport = FakeTransport;

    fn open_transport(
        &self,
        session: SyncSessionToken,
        _endpoints: SyncHttpEndpoints,
    ) -> Result<FakeTransport, String> {
        Ok(FakeTransport {
            state: Arc::clone(&self.state),
            session,
        })
    }

    fn wake_connector(&self) -> Option<Arc<dyn WakeConnector>> {
        self.wake
            .then(|| Arc::new(FakeWake(Arc::clone(&self.state))) as Arc<dyn WakeConnector>)
    }
}

struct FakeWake(Arc<CloudState>);

impl WakeConnector for FakeWake {
    fn connect(&self, _url: &str, token: &str) -> Result<Box<dyn WakeSocket>, WakeConnectError> {
        self.0.wake_connects.fetch_add(1, Ordering::SeqCst);
        self.0.tokens.lock().expect("tokens").push(token.into());
        Err(WakeConnectError::Failed("no socket in tests".into()))
    }
}

impl SyncProvisioner for FakeTransport {
    fn provision(&self, device_id: &str) -> Result<ProvisionedWorkspace, ProvisionFailure> {
        self.state.provisions.fetch_add(1, Ordering::SeqCst);
        while self.state.hold_provisioning.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(5));
        }
        if self.state.refuse_session.load(Ordering::SeqCst) {
            return Err(ProvisionFailure::SessionExpired);
        }
        let _ = self.session.read().expect("session").len();
        Ok(ProvisionedWorkspace {
            workspace_id: "workspace-1".into(),
            device_id: device_id.into(),
        })
    }
}

fn unavailable() -> TransportError {
    TransportError::Transient("fake cloud serves provisioning only".into())
}

impl SyncTransport for FakeTransport {
    fn push(
        &self,
        _: &str,
        _: &SyncPushRequest,
        _: &SyncCancellation,
    ) -> Result<SyncPushResponse, TransportError> {
        Err(unavailable())
    }

    fn pull(
        &self,
        _: &str,
        _: u64,
        _: usize,
        _: &SyncCancellation,
    ) -> Result<SyncPullResponse, TransportError> {
        Err(unavailable())
    }

    fn has_chunk(&self, _: &str, _: &str, _: &SyncCancellation) -> Result<bool, TransportError> {
        Err(unavailable())
    }

    fn put_chunk(
        &self,
        _: &str,
        _: &str,
        _: &[u8],
        _: &SyncCancellation,
    ) -> Result<(), TransportError> {
        Err(unavailable())
    }

    fn get_chunk(&self, _: &str, _: &str, _: &SyncCancellation) -> Result<Vec<u8>, TransportError> {
        Err(unavailable())
    }

    fn latest_checkpoint(
        &self,
        _: &str,
        _: &SyncCancellation,
    ) -> Result<Option<WorkspaceCheckpoint>, TransportError> {
        Err(unavailable())
    }

    fn publish_checkpoint(
        &self,
        _: &str,
        _: &WorkspaceCheckpoint,
        _: &SyncCancellation,
    ) -> Result<(), TransportError> {
        Err(unavailable())
    }

    fn workspace_encryption(
        &self,
        _: &str,
        _: &SyncCancellation,
    ) -> Result<Option<WorkspaceEncryptionMarker>, TransportError> {
        Err(unavailable())
    }

    fn claim_workspace_encryption(
        &self,
        _: &str,
        _: &str,
        _: &str,
        _: &SyncCancellation,
    ) -> Result<WorkspaceEncryptionMarker, TransportError> {
        Err(unavailable())
    }

    fn acknowledge(
        &self,
        _: &str,
        _: &str,
        _: u64,
        _: &SyncCancellation,
    ) -> Result<(), TransportError> {
        Err(unavailable())
    }
}

struct NoAssets;

impl SyncAssetStore for NoAssets {
    fn read_asset(&self, _: &str, _: &str) -> Result<Option<Vec<u8>>, String> {
        Ok(None)
    }

    fn store_asset(&self, _: &str, _: &str, _: &[u8]) -> Result<(), String> {
        Err("no asset store in tests".into())
    }
}

type Runtime = SyncRuntime<SqliteWorkspace, FakeCloud>;

fn runtime(database_path: PathBuf, state: &Arc<CloudState>, wake: bool) -> Runtime {
    SyncRuntime::new(
        Box::new(move || SqliteWorkspace::open(&database_path)),
        FakeCloud {
            state: Arc::clone(state),
            wake,
        },
        SyncRuntimeConfig {
            clock: Arc::new(SystemClock),
            assets: Arc::new(NoAssets),
            status_observer: None,
            workspace_observer: None,
            wake: WakeListenerConfig {
                min_backoff: Duration::from_millis(5),
                max_backoff: Duration::from_millis(20),
                stop_poll: Duration::from_millis(1),
            },
        },
    )
}

#[test]
fn overlapping_connects_for_one_session_start_one_coordinator() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let state = Arc::new(CloudState::default());
    state.hold_provisioning.store(true, Ordering::SeqCst);
    let runtime = runtime(directory.path().join("workspace.db"), &state, false);

    let (resume, renderer) = thread::scope(|scope| {
        let resume = scope.spawn(|| runtime.connect("token".into(), cloud()));
        state.wait_for_provisions(1);
        let renderer = scope.spawn(|| runtime.connect("token".into(), cloud()));
        thread::sleep(Duration::from_millis(100));
        state.hold_provisioning.store(false, Ordering::SeqCst);
        (
            resume.join().expect("resume connect"),
            renderer.join().expect("renderer connect"),
        )
    });

    assert!(resume.is_ok(), "{resume:?}");
    assert!(renderer.is_ok(), "{renderer:?}");
    assert_eq!(state.provisions.load(Ordering::SeqCst), 1);
    assert_ne!(runtime.status(), SyncStatus::LocalOnly);
    assert_eq!(
        runtime.linked_workspace_id().expect("linked"),
        Some("workspace-1".into())
    );

    runtime
        .connect("rotated-token".into(), cloud())
        .expect("connect with a new session");
    assert_eq!(state.provisions.load(Ordering::SeqCst), 2);
    runtime.shutdown();
    assert_eq!(runtime.status(), SyncStatus::LocalOnly);
}

#[test]
fn pausing_during_connect_keeps_sync_stopped() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let state = Arc::new(CloudState::default());
    state.hold_provisioning.store(true, Ordering::SeqCst);
    let runtime = runtime(directory.path().join("workspace.db"), &state, false);

    let connected = thread::scope(|scope| {
        let connecting = scope.spawn(|| runtime.connect("token".into(), cloud()));
        state.wait_for_provisions(1);
        assert_eq!(runtime.pause(), SyncStatus::LocalOnly);
        state.hold_provisioning.store(false, Ordering::SeqCst);
        connecting.join().expect("connect")
    });

    assert!(matches!(connected, Ok(SyncStatus::LocalOnly)));
    assert_eq!(runtime.status(), SyncStatus::LocalOnly);
    assert!(matches!(
        runtime.enable_encryption(&[0; 20]),
        Err(SyncRuntimeError::CloudSessionRequired)
    ));
}

#[test]
fn a_refused_session_leaves_the_workspace_unlinked() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let state = Arc::new(CloudState::default());
    state.refuse_session.store(true, Ordering::SeqCst);
    let runtime = runtime(directory.path().join("workspace.db"), &state, false);

    assert!(matches!(
        runtime.connect("token".into(), cloud()),
        Err(SyncRuntimeError::Provision(
            ProvisionFailure::SessionExpired
        ))
    ));
    assert_eq!(runtime.linked_workspace_id().expect("linked"), None);
    assert_eq!(runtime.status(), SyncStatus::LocalOnly);
}

#[test]
fn a_new_runtime_stays_local_only_and_inert() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let database_path = directory.path().join("workspace.db");
    let state = Arc::new(CloudState::default());
    let runtime = runtime(database_path.clone(), &state, true);

    assert_eq!(runtime.status(), SyncStatus::LocalOnly);
    runtime.notify_local_commit();
    runtime.notify_focus();
    runtime.notify_remote_change();
    runtime.request_refresh();
    runtime.set_online(false);
    runtime.set_visibility(false, false);
    runtime.set_wake_channel_connected(true);
    assert_eq!(runtime.wake_channel_url(), None);
    assert!(matches!(
        runtime.connect("with\nnewline".into(), cloud()),
        Err(SyncRuntimeError::InvalidSession)
    ));
    assert!(matches!(
        runtime.refresh_session("token"),
        Err(SyncRuntimeError::NotConnected)
    ));
    runtime.shutdown();
    assert_eq!(runtime.status(), SyncStatus::LocalOnly);
    assert_eq!(state.provisions.load(Ordering::SeqCst), 0);
    assert!(!database_path.exists());
}

#[test]
fn a_session_runs_the_platform_wake_channel_until_it_stops() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let state = Arc::new(CloudState::default());
    let runtime = runtime(directory.path().join("workspace.db"), &state, true);

    runtime.connect("token".into(), cloud()).expect("connect");
    let url = runtime.wake_channel_url().expect("wake url");
    assert!(url.starts_with("https://sync.skriuw.app/v1/workspaces/workspace-1/events"));
    let deadline = Instant::now() + Duration::from_secs(10);
    while state.wake_connects.load(Ordering::SeqCst) < 2 {
        assert!(Instant::now() < deadline, "listener never retried");
        thread::sleep(Duration::from_millis(5));
    }

    runtime.refresh_session("refreshed").expect("refresh");
    let deadline = Instant::now() + Duration::from_secs(10);
    while !state
        .tokens
        .lock()
        .expect("tokens")
        .iter()
        .any(|token| token == "refreshed")
    {
        assert!(Instant::now() < deadline, "listener kept the old session");
        thread::sleep(Duration::from_millis(5));
    }

    runtime.pause();
    thread::sleep(Duration::from_millis(50));
    let settled = state.wake_connects.load(Ordering::SeqCst);
    thread::sleep(Duration::from_millis(100));
    assert_eq!(state.wake_connects.load(Ordering::SeqCst), settled);
    assert_eq!(runtime.wake_channel_url(), None);
}

#[test]
fn connect_is_refused_while_suspended_for_maintenance() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let database_path = directory.path().join("workspace.db");
    let state = Arc::new(CloudState::default());
    let runtime = runtime(database_path.clone(), &state, false);

    let suspension = runtime.suspend_for_maintenance();
    let nested = runtime.suspend_for_maintenance();
    drop(nested);
    assert!(matches!(
        runtime.connect("token".into(), cloud()),
        Err(SyncRuntimeError::MaintenanceInProgress)
    ));
    assert!(!database_path.exists());
    assert_eq!(runtime.status(), SyncStatus::LocalOnly);

    drop(suspension);
    assert!(!database_path.exists());
}

#[test]
fn workspace_calls_are_refused_while_suspended_for_maintenance() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let database_path = directory.path().join("workspace.db");
    let state = Arc::new(CloudState::default());
    let runtime = runtime(database_path.clone(), &state, false);

    let suspension = runtime.suspend_for_maintenance();
    let refusals = [
        runtime.linked_workspace_id().map(|_| ()),
        runtime.recovery_view().map(|_| ()),
        runtime.retry_blocked_operation("blocked").map(|_| ()),
        runtime.discard_blocked_operation("blocked").map(|_| ()),
        runtime.encryption_state().map(|_| ()),
        runtime.enable_encryption(&[0; 20]).map(|_| ()),
        runtime.unlock_encryption("code").map(|_| ()),
    ];
    for refusal in refusals {
        assert!(matches!(
            refusal,
            Err(SyncRuntimeError::MaintenanceInProgress)
        ));
    }
    assert!(!database_path.exists());

    drop(suspension);
    assert_eq!(runtime.linked_workspace_id().expect("linked id"), None);
    assert!(
        runtime
            .recovery_view()
            .expect("recovery view")
            .blocked
            .is_empty()
    );
    assert!(!runtime.encryption_state().expect("encryption").enabled);
    assert!(runtime.retry_blocked_operation("missing").is_err());
    assert!(database_path.exists());
}

#[test]
fn an_unopenable_database_is_reported_as_recovery() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let database_path = directory.path().join("workspace.db");
    std::fs::write(&database_path, b"not a database").expect("write");
    let state = Arc::new(CloudState::default());
    let runtime = runtime(database_path, &state, false);

    assert!(matches!(
        runtime.recovery_view(),
        Err(SyncRuntimeError::OpenWorkspace(_))
    ));
    assert!(matches!(
        runtime.connect("token".into(), cloud()),
        Err(SyncRuntimeError::OpenWorkspace(_))
    ));
}

#[test]
fn suspension_waits_for_an_open_workspace_connection_to_close() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let state = Arc::new(CloudState::default());
    let runtime = Arc::new(runtime(
        directory.path().join("workspace.db"),
        &state,
        false,
    ));
    let (opened_sender, opened) = mpsc::channel();
    let (release, released) = mpsc::channel::<()>();
    let closed = Arc::new(AtomicBool::new(false));

    let reader = {
        let runtime = Arc::clone(&runtime);
        let closed = Arc::clone(&closed);
        thread::spawn(move || {
            runtime
                .with_workspace(|_| {
                    opened_sender.send(()).expect("signal opened");
                    released.recv().expect("release");
                    closed.store(true, Ordering::SeqCst);
                    Ok(())
                })
                .expect("reader");
        })
    };
    opened.recv().expect("reader opened");
    let suspender = {
        let runtime = Arc::clone(&runtime);
        let closed = Arc::clone(&closed);
        thread::spawn(move || {
            let _suspension = runtime.suspend_for_maintenance();
            closed.load(Ordering::SeqCst)
        })
    };
    thread::sleep(Duration::from_millis(50));
    assert!(
        !suspender.is_finished(),
        "suspension skipped the open connection"
    );
    release.send(()).expect("release reader");
    reader.join().expect("reader thread");
    assert!(suspender.join().expect("suspender thread"));
}
