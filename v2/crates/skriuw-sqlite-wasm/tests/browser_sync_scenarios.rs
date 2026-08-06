//! Browser worker sync parity against the deterministic fake transport.
//!
//! A browser device here is the real worker runtime dispatching the versioned
//! worker protocol over a real SQLite backend, with the sync commands driven
//! exactly as the JavaScript scheduler drives them. A native device runs
//! `run_sync_cycle` directly, as the desktop coordinator does. Both must
//! observe identical replication behavior: same server log, same converged
//! workspace, same ordering, idempotency, local-echo, and blocking rules.

#[allow(dead_code)]
#[path = "../../skriuw-sync/tests/support/mod.rs"]
mod support;

use std::sync::Arc;

use skriuw_domain::{SyncPullResponse, SyncPushRequest, SyncPushResponse, WorkspaceCheckpoint};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_sqlite_wasm::{
    BrowserStorageErrorCode, BrowserSyncEnvironment, BrowserSyncRuntime, BrowserWorkerCommand,
    BrowserWorkerOutcome, BrowserWorkerRequest, BrowserWorkerResponse, BrowserWorkerRuntime,
    BrowserWorkerValue, WORKER_PROTOCOL_VERSION,
};
use skriuw_storage::{WorkspaceStorage, WorkspaceSyncQueue};
use skriuw_sync::{
    SyncBackoff, SyncBackoffConfig, SyncCancellation, SyncClock, SyncCycleConfig, SyncStatus,
    SyncTransport, TransportError, run_sync_cycle,
};
use support::{
    FakeAssetStore, FakeClock, FakeServer, FakeTransport, PullFault, PushFault, attach_image,
    create_note, rename_node,
};

const WORKSPACE: &str = "workspace-1";
const BASE_URL: &str = "http://localhost:8787";

struct SharedTransport(Arc<FakeTransport>);

impl SyncTransport for SharedTransport {
    fn push(
        &self,
        workspace_id: &str,
        request: &SyncPushRequest,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPushResponse, TransportError> {
        self.0.push(workspace_id, request, cancellation)
    }

    fn pull(
        &self,
        workspace_id: &str,
        after_server_sequence: u64,
        limit: usize,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPullResponse, TransportError> {
        self.0
            .pull(workspace_id, after_server_sequence, limit, cancellation)
    }

    fn has_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<bool, TransportError> {
        self.0.has_chunk(workspace_id, digest, cancellation)
    }

    fn put_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        bytes: &[u8],
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.0.put_chunk(workspace_id, digest, bytes, cancellation)
    }

    fn get_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Vec<u8>, TransportError> {
        self.0.get_chunk(workspace_id, digest, cancellation)
    }

    fn latest_checkpoint(
        &self,
        workspace_id: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Option<WorkspaceCheckpoint>, TransportError> {
        self.0.latest_checkpoint(workspace_id, cancellation)
    }

    fn publish_checkpoint(
        &self,
        workspace_id: &str,
        checkpoint: &WorkspaceCheckpoint,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.0
            .publish_checkpoint(workspace_id, checkpoint, cancellation)
    }

    fn acknowledge(
        &self,
        workspace_id: &str,
        device_id: &str,
        server_sequence: u64,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.0
            .acknowledge(workspace_id, device_id, server_sequence, cancellation)
    }
}

struct BrowserDevice {
    runtime: BrowserWorkerRuntime<SqliteWorkspace>,
    sync: BrowserSyncRuntime,
    transport: Arc<FakeTransport>,
    assets: Arc<FakeAssetStore>,
    clock: Arc<FakeClock>,
    device_id: String,
    next_request_id: u64,
}

impl BrowserDevice {
    fn open(server: &Arc<FakeServer>, device_id: &str, clock: &Arc<FakeClock>) -> Self {
        let mut runtime = BrowserWorkerRuntime::new();
        runtime
            .initialize(SqliteWorkspace::open_in_memory().expect("open database"))
            .expect("initialize worker runtime");
        Self {
            runtime,
            sync: BrowserSyncRuntime::new(),
            transport: FakeTransport::new(server, device_id),
            assets: FakeAssetStore::new(),
            clock: Arc::clone(clock),
            device_id: device_id.into(),
            next_request_id: 1,
        }
    }

    fn dispatch(&mut self, command: BrowserWorkerCommand) -> BrowserWorkerResponse {
        let request = BrowserWorkerRequest {
            protocol_version: WORKER_PROTOCOL_VERSION,
            request_id: self.next_request_id,
            command,
        };
        self.next_request_id += 1;
        let transport = Arc::clone(&self.transport);
        let factory = move |_token: &str,
                            _base_url: &str|
              -> Result<
            Box<dyn SyncTransport>,
            skriuw_sqlite_wasm::BrowserStorageError,
        > { Ok(Box::new(SharedTransport(Arc::clone(&transport)))) };
        let environment = BrowserSyncEnvironment {
            clock: self.clock.as_ref(),
            assets: self.assets.as_ref(),
            transport_factory: &factory,
        };
        self.runtime
            .dispatch_with_sync(request, &mut self.sync, &environment)
    }

    fn expect_value(&mut self, command: BrowserWorkerCommand) -> BrowserWorkerValue {
        match self.dispatch(command).outcome {
            BrowserWorkerOutcome::Ok(value) => value,
            BrowserWorkerOutcome::Error(error) => panic!("unexpected worker failure: {error:?}"),
        }
    }

    fn connect(&mut self) -> SyncStatus {
        let device_id = self.device_id.clone();
        match self.expect_value(BrowserWorkerCommand::SyncConnect {
            token: "session-token".into(),
            base_url: BASE_URL.into(),
            workspace_id: WORKSPACE.into(),
            device_id,
        }) {
            BrowserWorkerValue::SyncStatus(status) => status,
            other => panic!("unexpected value: {other:?}"),
        }
    }

    fn cycle(&mut self) -> (SyncStatus, Option<i64>) {
        match self.expect_value(BrowserWorkerCommand::SyncCycle) {
            BrowserWorkerValue::SyncCycle(report) => (report.status, report.retry_at_ms),
            other => panic!("unexpected value: {other:?}"),
        }
    }

    /// Drives cycles the way the JavaScript scheduler does: `pending` retries
    /// immediately, `retrying` and `blocked` wait until the reported retry
    /// deadline, everything else settles.
    fn settle(&mut self) -> SyncStatus {
        for _ in 0..12 {
            let (status, retry_at_ms) = self.cycle();
            match status {
                SyncStatus::Pending => {}
                SyncStatus::Retrying { .. } | SyncStatus::Blocked { .. } => {
                    let Some(retry_at) = retry_at_ms else {
                        return status;
                    };
                    let delta = retry_at - self.clock.now_ms();
                    if delta > 0 {
                        self.clock.advance(delta + 1);
                    }
                }
                settled => return settled,
            }
        }
        panic!("browser sync did not settle within the cycle budget");
    }

    fn apply(&mut self, operations: Vec<skriuw_domain::WorkspaceOperationEnvelope>) {
        match self.expect_value(BrowserWorkerCommand::ApplyOperations { operations }) {
            BrowserWorkerValue::Operation(_) => {}
            other => panic!("unexpected value: {other:?}"),
        }
    }

    fn note_titles(&mut self) -> Vec<String> {
        match self.expect_value(BrowserWorkerCommand::Bootstrap) {
            BrowserWorkerValue::Bootstrap(snapshot) => {
                let mut titles = snapshot
                    .nodes
                    .iter()
                    .map(|node| node.title.clone())
                    .collect::<Vec<_>>();
                titles.sort();
                titles
            }
            other => panic!("unexpected value: {other:?}"),
        }
    }

    fn runtime_backend(&self) -> &SqliteWorkspace {
        self.runtime
            .backend()
            .expect("browser device backend is available")
    }
}

struct NativeDevice {
    storage: SqliteWorkspace,
    transport: Arc<FakeTransport>,
    assets: Arc<FakeAssetStore>,
    clock: Arc<FakeClock>,
    backoff: SyncBackoff,
    cancellation: SyncCancellation,
    config: SyncCycleConfig,
}

impl NativeDevice {
    fn open(server: &Arc<FakeServer>, device_id: &str, clock: &Arc<FakeClock>) -> Self {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .connect_sync(&skriuw_storage::NewSyncConnection {
                workspace_id: WORKSPACE.into(),
                device_id: device_id.into(),
                connected_at: clock.now_ms().max(1),
                observed_server_sequence: 0,
            })
            .expect("connect sync");
        Self {
            storage,
            transport: FakeTransport::new(server, device_id),
            assets: FakeAssetStore::new(),
            clock: Arc::clone(clock),
            backoff: SyncBackoff::new(SyncBackoffConfig {
                base_delay_ms: 1_000,
                max_delay_ms: 60_000,
                jitter_seed: 11,
            }),
            cancellation: SyncCancellation::new(),
            config: SyncCycleConfig::default(),
        }
    }

    fn settle(&mut self) -> SyncStatus {
        for _ in 0..12 {
            let outcome = run_sync_cycle(
                &self.storage,
                self.transport.as_ref(),
                self.assets.as_ref(),
                self.clock.as_ref(),
                &self.cancellation,
                &mut self.backoff,
                &self.config,
            );
            match outcome.status {
                SyncStatus::Pending => {}
                SyncStatus::Retrying { .. } | SyncStatus::Blocked { .. } => {
                    let Some(retry_at) = outcome.retry_at_ms else {
                        return outcome.status;
                    };
                    let delta = retry_at - self.clock.now_ms();
                    if delta > 0 {
                        self.clock.advance(delta + 1);
                    }
                }
                settled => return settled,
            }
        }
        panic!("native sync did not settle within the cycle budget");
    }

    fn note_titles(&self) -> Vec<String> {
        let mut titles = self
            .storage
            .bootstrap()
            .expect("bootstrap")
            .nodes
            .iter()
            .map(|node| node.title.clone())
            .collect::<Vec<_>>();
        titles.sort();
        titles
    }
}

#[test]
fn browser_and_native_devices_converge_identically() {
    let server = FakeServer::new(WORKSPACE);
    let clock = FakeClock::at(1_000);
    let mut native = NativeDevice::open(&server, "native-device", &clock);
    let mut browser = BrowserDevice::open(&server, "browser-device", &clock);

    native
        .storage
        .apply_operations(&[create_note("n-1", "Native note", 1_000)])
        .expect("apply native note");
    assert_eq!(native.settle(), SyncStatus::UpToDate);

    assert_eq!(browser.connect(), SyncStatus::Connecting);
    assert_eq!(browser.settle(), SyncStatus::UpToDate);
    browser.apply(vec![create_note("n-2", "Browser note", 1_100)]);
    assert_eq!(browser.settle(), SyncStatus::UpToDate);
    assert_eq!(native.settle(), SyncStatus::UpToDate);

    assert_eq!(native.note_titles(), vec!["Browser note", "Native note"]);
    assert_eq!(browser.note_titles(), native.note_titles());
    assert_eq!(server.operation_ids().len(), 2);
}

#[test]
fn browser_local_echo_of_own_operations_does_not_duplicate_state() {
    let server = FakeServer::new(WORKSPACE);
    let clock = FakeClock::at(1_000);
    let mut browser = BrowserDevice::open(&server, "browser-device", &clock);

    browser.connect();
    browser.apply(vec![
        create_note("n-1", "Echoed", 1_000),
        rename_node("n-1", "Echoed twice", 1_050),
    ]);
    assert_eq!(browser.settle(), SyncStatus::UpToDate);
    assert_eq!(browser.settle(), SyncStatus::UpToDate);

    assert_eq!(browser.note_titles(), vec!["Echoed twice"]);
    assert_eq!(server.operation_ids().len(), 2);
    let cursor = browser
        .runtime_backend()
        .sync_connection()
        .expect("read connection")
        .expect("active connection")
        .observed_server_sequence;
    assert_eq!(cursor, 2);
}

#[test]
fn ack_loss_retries_idempotently_without_duplicating_the_log() {
    let server = FakeServer::new(WORKSPACE);
    let clock = FakeClock::at(1_000);
    let mut browser = BrowserDevice::open(&server, "browser-device", &clock);

    browser.connect();
    browser.apply(vec![create_note("n-1", "Survives ack loss", 1_000)]);
    browser.transport.script_push_fault(PushFault::DropResponse);
    assert_eq!(browser.settle(), SyncStatus::UpToDate);

    assert_eq!(server.operation_ids().len(), 1);
    assert_eq!(browser.note_titles(), vec!["Survives ack loss"]);
}

#[test]
fn pull_gaps_are_rejected_and_overlapping_pages_apply_idempotently() {
    let server = FakeServer::new(WORKSPACE);
    let clock = FakeClock::at(1_000);
    let mut native = NativeDevice::open(&server, "native-device", &clock);
    let mut browser = BrowserDevice::open(&server, "browser-device", &clock);

    native
        .storage
        .apply_operations(&[
            create_note("n-1", "First", 1_000),
            create_note("n-2", "Second", 1_010),
        ])
        .expect("apply native notes");
    assert_eq!(native.settle(), SyncStatus::UpToDate);

    browser.connect();
    browser.transport.script_pull_fault(PullFault::Gap);
    let settled = browser.settle();
    assert_eq!(settled, SyncStatus::UpToDate, "recovers after the gap page");

    browser.transport.script_pull_fault(PullFault::Overlap);
    assert_eq!(browser.settle(), SyncStatus::UpToDate);
    assert_eq!(browser.note_titles(), vec!["First", "Second"]);
}

#[test]
fn session_expiry_pauses_and_reconnect_resumes_from_durable_state() {
    let server = FakeServer::new(WORKSPACE);
    let clock = FakeClock::at(1_000);
    let mut browser = BrowserDevice::open(&server, "browser-device", &clock);

    browser.connect();
    browser.apply(vec![create_note("n-1", "Waits for auth", 1_000)]);
    browser.transport.script_push_fault(PushFault::AuthExpired);
    assert_eq!(browser.settle(), SyncStatus::AuthenticationRequired);
    assert_eq!(server.log_len(), 0, "nothing was accepted while expired");

    match browser.expect_value(BrowserWorkerCommand::SyncStatus) {
        BrowserWorkerValue::SyncStatus(status) => {
            assert_eq!(status, SyncStatus::AuthenticationRequired);
        }
        other => panic!("unexpected value: {other:?}"),
    }

    assert_eq!(browser.connect(), SyncStatus::Connecting);
    assert_eq!(browser.settle(), SyncStatus::UpToDate);
    assert_eq!(server.operation_ids().len(), 1);
}

#[test]
fn fresh_browser_device_hydrates_from_checkpoint_and_replays_the_tail() {
    let server = FakeServer::new(WORKSPACE);
    let clock = FakeClock::at(1_000);
    let mut seeder = BrowserDevice::open(&server, "seed-device", &clock);
    seeder.connect();
    seeder.apply(vec![create_note("n-1", "Checkpointed note", 1_000)]);
    assert_eq!(seeder.settle(), SyncStatus::UpToDate);
    assert!(
        server.latest_checkpoint_sequence().is_some(),
        "the converged device published a checkpoint"
    );
    seeder.apply(vec![create_note("n-2", "Tail note", 1_100)]);
    assert_eq!(seeder.settle(), SyncStatus::UpToDate);

    let mut fresh = BrowserDevice::open(&server, "fresh-device", &clock);
    fresh.connect();

    fresh
        .transport
        .script_checkpoint_fetch_fault(TransportError::Transient("network unreachable".into()));
    assert_eq!(
        fresh.settle(),
        SyncStatus::UpToDate,
        "an interrupted hydration resumes on the next scheduled cycle"
    );
    assert_eq!(fresh.note_titles(), vec!["Checkpointed note", "Tail note"]);
    assert!(
        fresh.transport.pull_calls() > 0,
        "the ordered log tail was replayed after hydration"
    );
}

#[test]
fn discarded_checkpoint_content_blocks_hydration_in_a_restartable_state() {
    let server = FakeServer::new(WORKSPACE);
    let clock = FakeClock::at(1_000);
    let mut seeder = BrowserDevice::open(&server, "seed-device", &clock);
    seeder.connect();
    seeder.apply(vec![create_note("n-1", "Checkpointed note", 1_000)]);
    assert_eq!(seeder.settle(), SyncStatus::UpToDate);
    server.discard_checkpoint_chunks();

    let mut fresh = BrowserDevice::open(&server, "fresh-device", &clock);
    fresh.connect();
    let (status, retry_at) = fresh.cycle();
    assert_eq!(
        status,
        SyncStatus::Blocked {
            reason: "rejected_checkpoint".into()
        }
    );
    assert!(retry_at.is_some());
    assert_eq!(
        fresh.note_titles(),
        Vec::<String>::new(),
        "nothing partial applied"
    );
    let cursor = fresh
        .runtime_backend()
        .sync_connection()
        .expect("read connection")
        .expect("active connection")
        .observed_server_sequence;
    assert_eq!(cursor, 0, "the durable state stays restartable");
}

#[test]
fn missing_local_asset_bytes_block_the_operation_visibly() {
    let server = FakeServer::new(WORKSPACE);
    let clock = FakeClock::at(1_000);
    let mut browser = BrowserDevice::open(&server, "browser-device", &clock);

    browser.connect();
    let image_bytes = b"image-bytes-not-stored".to_vec();
    browser.apply(vec![
        create_note("n-1", "Holds an image", 1_000),
        attach_image("img-1", "n-1", &image_bytes, 1_050),
    ]);
    assert_eq!(browser.settle(), SyncStatus::UpToDate);

    let blocked = browser
        .runtime_backend()
        .blocked_sync_operations()
        .expect("read blocked operations");
    assert_eq!(blocked.len(), 1);
    assert_eq!(blocked[0].reason_code, "asset_content_missing");
    assert_eq!(server.operation_ids().len(), 1, "the note still replicated");
}

#[test]
fn replicated_image_assets_arrive_in_the_receiving_asset_store() {
    let server = FakeServer::new(WORKSPACE);
    let clock = FakeClock::at(1_000);
    let mut sender = BrowserDevice::open(&server, "sender-device", &clock);
    sender.connect();
    sender.apply(vec![create_note("n-1", "Holds an image", 1_000)]);
    assert_eq!(sender.settle(), SyncStatus::UpToDate);

    let image_bytes = b"replicated-image-bytes".to_vec();
    let digest = sender.assets.put(&image_bytes);
    sender.apply(vec![attach_image("img-1", "n-1", &image_bytes, 1_050)]);
    assert_eq!(sender.settle(), SyncStatus::UpToDate);

    let mut receiver = BrowserDevice::open(&server, "receiver-device", &clock);
    receiver.connect();
    assert_eq!(receiver.settle(), SyncStatus::UpToDate);
    assert_eq!(
        receiver.assets.get(&digest),
        Some(image_bytes),
        "asset bytes travelled the content-addressed path"
    );
}

#[test]
fn sync_lifecycle_commands_report_connection_and_reject_misuse() {
    let server = FakeServer::new(WORKSPACE);
    let clock = FakeClock::at(1_000);
    let mut browser = BrowserDevice::open(&server, "browser-device", &clock);

    match browser.expect_value(BrowserWorkerCommand::SyncConnection) {
        BrowserWorkerValue::SyncConnection(None) => {}
        other => panic!("unexpected value: {other:?}"),
    }
    match browser.expect_value(BrowserWorkerCommand::SyncStatus) {
        BrowserWorkerValue::SyncStatus(SyncStatus::LocalOnly) => {}
        other => panic!("unexpected value: {other:?}"),
    }
    let cycle = browser.dispatch(BrowserWorkerCommand::SyncCycle);
    assert!(matches!(
        cycle.outcome,
        BrowserWorkerOutcome::Error(error)
            if error.code == BrowserStorageErrorCode::InvalidRequest
    ));

    browser.connect();
    match browser.expect_value(BrowserWorkerCommand::SyncConnection) {
        BrowserWorkerValue::SyncConnection(Some(connection)) => {
            assert_eq!(connection.workspace_id, WORKSPACE);
            assert_eq!(connection.device_id, "browser-device");
            assert_eq!(connection.observed_server_sequence, 0);
        }
        other => panic!("unexpected value: {other:?}"),
    }

    match browser.expect_value(BrowserWorkerCommand::SyncDisconnect) {
        BrowserWorkerValue::SyncStatus(SyncStatus::AuthenticationRequired) => {}
        other => panic!("unexpected value: {other:?}"),
    }

    let mismatched = browser.dispatch(BrowserWorkerCommand::SyncConnect {
        token: "session-token".into(),
        base_url: BASE_URL.into(),
        workspace_id: "different-workspace".into(),
        device_id: "browser-device".into(),
    });
    assert!(matches!(
        mismatched.outcome,
        BrowserWorkerOutcome::Error(error)
            if error.code == BrowserStorageErrorCode::InvalidRequest
    ));

    let untrusted = browser.dispatch(BrowserWorkerCommand::SyncConnect {
        token: "session-token".into(),
        base_url: "https://evil.example".into(),
        workspace_id: WORKSPACE.into(),
        device_id: "browser-device".into(),
    });
    assert!(matches!(
        untrusted.outcome,
        BrowserWorkerOutcome::Error(error)
            if error.code == BrowserStorageErrorCode::InvalidRequest
    ));
}
