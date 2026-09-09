//! End-to-end replication with encryption on.
//!
//! Every scenario drives the same `run_sync_cycle` the desktop coordinator
//! and the browser worker drive, against the in-memory service stand-in, and
//! asserts two things at once: the devices converge on identical plaintext,
//! and nothing the service can read ever contains it.

#[allow(dead_code)]
mod support;

use std::sync::Arc;

use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{NewSyncConnection, WorkspaceStorage, WorkspaceSyncQueue};
use skriuw_sync::{
    BLOCKED_REASON_ENCRYPTION_KEY_REQUIRED, BLOCKED_REASON_SEALED_CONTENT_UNREADABLE,
    CheckpointPublication, CheckpointPublicationConfig, CheckpointPublicationState,
    SyncBackoffConfig, SyncCancellation, SyncClock, SyncCycleConfig, SyncCycleOutcome,
    SyncCycleState, SyncStatus, derive_workspace_seal, new_recovery_code,
    run_checkpoint_publication, run_sync_cycle,
};
use support::{
    FakeAssetStore, FakeClock, FakeServer, FakeTransport, attach_image, create_note, save_document,
    save_large_document,
};

const WORKSPACE: &str = "workspace-1";
const SECRET_TITLE: &str = "Gerbrandy street lease";
const SECRET_BODY: &str = "monthly rent is 1450 euro, deposit paid 2026-02-01";
const RECOVERY_CODE: &str = "0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ";
const OTHER_RECOVERY_CODE: &str = "ZYXW-VTSR-QPNM-KJHG-FEDC-BA98-7654-3210";

struct Device {
    storage: SqliteWorkspace,
    transport: Arc<FakeTransport>,
    assets: Arc<FakeAssetStore>,
    clock: Arc<FakeClock>,
    state: SyncCycleState,
    checkpoints: CheckpointPublicationState,
    cancellation: SyncCancellation,
    config: SyncCycleConfig,
}

impl Device {
    fn open(server: &Arc<FakeServer>, device_id: &str, clock: &Arc<FakeClock>) -> Self {
        let device = Self {
            storage: SqliteWorkspace::open_in_memory().expect("open database"),
            transport: FakeTransport::new(server, device_id),
            assets: FakeAssetStore::new(),
            clock: Arc::clone(clock),
            state: SyncCycleState::new(SyncBackoffConfig {
                base_delay_ms: 1_000,
                max_delay_ms: 60_000,
                jitter_seed: 11,
            }),
            checkpoints: CheckpointPublicationState::new(),
            cancellation: SyncCancellation::new(),
            config: SyncCycleConfig::default(),
        };
        device
            .storage
            .connect_sync(&NewSyncConnection {
                workspace_id: WORKSPACE.into(),
                device_id: device_id.into(),
                connected_at: device.clock.now_ms().max(1),
                observed_server_sequence: 0,
            })
            .expect("connect sync");
        device
    }

    fn encrypt_with(&self, recovery_code: &str) {
        let seal = derive_workspace_seal(WORKSPACE, recovery_code, self.clock.now_ms())
            .expect("derive workspace seal");
        self.storage
            .set_workspace_seal(&seal)
            .expect("store workspace seal");
    }

    fn apply(&self, operations: Vec<skriuw_domain::WorkspaceOperationEnvelope>) {
        self.storage
            .apply_operations(&operations)
            .expect("apply operations");
    }

    fn cycle(&mut self) -> SyncCycleOutcome {
        run_sync_cycle(
            &self.storage,
            self.transport.as_ref(),
            self.assets.as_ref(),
            self.clock.as_ref(),
            &self.cancellation,
            &mut self.state,
            &self.config,
        )
    }

    fn publish_checkpoint(&mut self) -> Option<SyncCycleOutcome> {
        run_checkpoint_publication(
            &CheckpointPublication {
                queue: &self.storage,
                workspace: &self.storage,
                transport: self.transport.as_ref(),
                clock: self.clock.as_ref(),
                cancellation: &self.cancellation,
                cycle_config: &self.config,
                config: &CheckpointPublicationConfig::default(),
            },
            &mut self.state.backoff,
            &mut self.checkpoints,
        )
    }

    fn settle(&mut self) -> SyncStatus {
        for _ in 0..12 {
            let outcome = self.cycle();
            match outcome.status {
                SyncStatus::Pending | SyncStatus::Rehydrating => {}
                SyncStatus::Retrying { .. } | SyncStatus::Blocked { .. } => {
                    let Some(retry_at) = outcome.retry_at_ms else {
                        return outcome.status;
                    };
                    let delta = retry_at - self.clock.now_ms();
                    if delta > 0 {
                        self.clock.advance(delta + 1);
                    }
                    if matches!(outcome.status, SyncStatus::Blocked { .. }) {
                        return outcome.status;
                    }
                }
                settled => return settled,
            }
        }
        panic!("sync did not settle within the cycle budget");
    }

    fn shape(&self) -> String {
        let bootstrap = self.storage.bootstrap().expect("bootstrap");
        let mut lines = bootstrap
            .nodes
            .iter()
            .map(|node| format!("node {} {}", node.id, node.title))
            .chain(
                bootstrap
                    .documents
                    .iter()
                    .map(|document| format!("doc {} {}", document.note_id, document.markdown)),
            )
            .collect::<Vec<_>>();
        lines.sort();
        lines.join("\n")
    }
}

fn blocked_reason(status: &SyncStatus) -> Option<&str> {
    match status {
        SyncStatus::Blocked { reason, .. } => Some(reason.as_str()),
        _ => None,
    }
}

fn blocked_detail(status: &SyncStatus) -> Option<&str> {
    match status {
        SyncStatus::Blocked { detail, .. } => detail.as_deref(),
        _ => None,
    }
}

#[test]
fn recovery_codes_are_shown_in_groups_and_derive_a_stable_key() {
    let code = new_recovery_code(&[7; 20]).expect("format recovery code");
    assert_eq!(code.len(), 39);
    let first = derive_workspace_seal(WORKSPACE, &code, 10).expect("derive");
    let again = derive_workspace_seal(WORKSPACE, &code.to_lowercase(), 20).expect("derive");
    assert_eq!(first.key_id, again.key_id);
    assert_eq!(first.key_material, again.key_material);
    assert!(
        derive_workspace_seal(WORKSPACE, "not-a-code", 10)
            .expect_err("malformed code")
            .contains("recovery code")
    );
}

#[test]
fn two_devices_converge_with_encryption_on_and_the_service_reads_nothing() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);

    let mut device_a = Device::open(&server, "device-a", &clock);
    device_a.encrypt_with(RECOVERY_CODE);
    let image_bytes = SECRET_BODY.repeat(4).into_bytes();
    device_a.assets.put(&image_bytes);
    device_a.apply(vec![
        create_note("note-1", SECRET_TITLE, 1),
        save_document("note-1", 1, SECRET_BODY, 2),
        save_large_document("note-1", 2, 2_000_000, 3),
        attach_image("image-1", "note-1", &image_bytes, 4),
    ]);
    assert_eq!(device_a.settle(), SyncStatus::UpToDate);

    let mut device_b = Device::open(&server, "device-b", &clock);
    device_b.encrypt_with(RECOVERY_CODE);
    assert_eq!(device_b.settle(), SyncStatus::UpToDate);

    assert_eq!(device_a.shape(), device_b.shape());
    assert!(device_b.shape().contains(SECRET_TITLE));
    assert_eq!(
        device_b.assets.get(&support::digest(&image_bytes)),
        Some(image_bytes)
    );

    let readable = server.readable_state();
    assert!(!readable.contains(SECRET_TITLE));
    assert!(!readable.contains(SECRET_BODY));
    assert!(!readable.contains("note-1"));
    assert!(!readable.contains("save_document"));
    assert!(readable.contains("sealed"));
}

#[test]
fn a_device_without_the_key_parks_visibly_instead_of_applying_ciphertext() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);

    let mut device_a = Device::open(&server, "device-a", &clock);
    device_a.encrypt_with(RECOVERY_CODE);
    device_a.apply(vec![create_note("note-1", SECRET_TITLE, 1)]);
    assert_eq!(device_a.settle(), SyncStatus::UpToDate);

    let mut device_b = Device::open(&server, "device-b", &clock);
    let status = device_b.settle();
    assert_eq!(
        blocked_reason(&status),
        Some(BLOCKED_REASON_ENCRYPTION_KEY_REQUIRED)
    );
    assert!(blocked_detail(&status).is_some_and(|detail| detail.contains("recovery code")));
    assert_eq!(device_b.shape(), "");

    device_b.encrypt_with(RECOVERY_CODE);
    assert_eq!(device_b.settle(), SyncStatus::UpToDate);
    assert_eq!(device_a.shape(), device_b.shape());
}

#[test]
fn a_wrong_recovery_code_fails_loudly_and_changes_nothing() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);

    let mut device_a = Device::open(&server, "device-a", &clock);
    device_a.encrypt_with(RECOVERY_CODE);
    device_a.apply(vec![create_note("note-1", SECRET_TITLE, 1)]);
    assert_eq!(device_a.settle(), SyncStatus::UpToDate);

    let mut device_b = Device::open(&server, "device-b", &clock);
    device_b.encrypt_with(OTHER_RECOVERY_CODE);
    let status = device_b.settle();
    assert_eq!(
        blocked_reason(&status),
        Some(BLOCKED_REASON_SEALED_CONTENT_UNREADABLE)
    );
    assert!(blocked_detail(&status).is_some_and(|detail| detail.contains("this device holds key")));
    assert_eq!(device_b.shape(), "");
}

#[test]
fn tampered_ciphertext_is_refused_rather_than_applied() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);

    let mut device_a = Device::open(&server, "device-a", &clock);
    device_a.encrypt_with(RECOVERY_CODE);
    device_a.apply(vec![create_note("note-1", SECRET_TITLE, 1)]);
    assert_eq!(device_a.settle(), SyncStatus::UpToDate);
    server.tamper_with_sealed_content();

    let mut device_b = Device::open(&server, "device-b", &clock);
    device_b.encrypt_with(RECOVERY_CODE);
    let status = device_b.settle();
    assert_eq!(
        blocked_reason(&status),
        Some(BLOCKED_REASON_SEALED_CONTENT_UNREADABLE)
    );
    assert!(
        blocked_detail(&status)
            .is_some_and(|detail| detail.contains("changed after it was sealed")
                || detail.contains("does not match"))
    );
    assert_eq!(device_b.shape(), "");
}

#[test]
fn a_sealed_checkpoint_rebuilds_a_new_device_and_leaks_nothing() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);

    let mut device_a = Device::open(&server, "device-a", &clock);
    device_a.encrypt_with(RECOVERY_CODE);
    device_a.apply(vec![
        create_note("note-1", SECRET_TITLE, 1),
        save_document("note-1", 1, SECRET_BODY, 2),
    ]);
    assert_eq!(device_a.settle(), SyncStatus::UpToDate);
    assert!(device_a.publish_checkpoint().is_none());
    assert_eq!(server.latest_checkpoint_sequence(), Some(2));
    assert_eq!(
        device_a
            .storage
            .workspace_seal()
            .expect("read seal")
            .and_then(|seal| seal.sealed_checkpoint_at),
        Some(clock.now_ms())
    );

    server.compact_through(2);

    let mut device_c = Device::open(&server, "device-c", &clock);
    device_c.encrypt_with(RECOVERY_CODE);
    assert_eq!(device_c.settle(), SyncStatus::UpToDate);
    assert_eq!(device_c.shape(), device_a.shape());

    let readable = server.readable_state();
    assert!(!readable.contains(SECRET_TITLE));
    assert!(!readable.contains(SECRET_BODY));
}

#[test]
fn a_checkpoint_sealed_by_another_device_parks_a_keyless_device() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);

    let mut device_a = Device::open(&server, "device-a", &clock);
    device_a.encrypt_with(RECOVERY_CODE);
    device_a.apply(vec![create_note("note-1", SECRET_TITLE, 1)]);
    assert_eq!(device_a.settle(), SyncStatus::UpToDate);
    assert!(device_a.publish_checkpoint().is_none());

    let mut device_b = Device::open(&server, "device-b", &clock);
    let status = device_b.settle();
    assert_eq!(
        blocked_reason(&status),
        Some(BLOCKED_REASON_ENCRYPTION_KEY_REQUIRED)
    );
}

#[test]
fn enabling_encryption_seals_everything_pushed_afterwards() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);

    let mut device_a = Device::open(&server, "device-a", &clock);
    device_a.apply(vec![create_note("note-plain", "Groceries", 1)]);
    assert_eq!(device_a.settle(), SyncStatus::UpToDate);
    assert!(server.readable_state().contains("Groceries"));

    device_a.encrypt_with(RECOVERY_CODE);
    device_a.apply(vec![
        create_note("note-1", SECRET_TITLE, 2),
        save_document("note-1", 1, SECRET_BODY, 3),
    ]);
    assert_eq!(device_a.settle(), SyncStatus::UpToDate);
    assert!(device_a.publish_checkpoint().is_none());

    let readable = server.readable_state();
    assert!(!readable.contains(SECRET_TITLE));
    assert!(!readable.contains(SECRET_BODY));

    let mut device_b = Device::open(&server, "device-b", &clock);
    device_b.encrypt_with(RECOVERY_CODE);
    assert_eq!(device_b.settle(), SyncStatus::UpToDate);
    assert_eq!(device_a.shape(), device_b.shape());
    assert!(device_b.shape().contains("Groceries"));
}
