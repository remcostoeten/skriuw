#[allow(dead_code)]
mod support;

use std::sync::Arc;

use skriuw_domain::{ClientSyncOperation, SyncOperationPayload, SyncPushRequest};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{NewSyncConnection, SyncRecovery, WorkspaceStorage, WorkspaceSyncQueue};
use skriuw_sync::{
    BLOCKED_OPERATION_REASON_ASSET_CONTENT_MISSING, BLOCKED_REASON_LOG_TRUNCATED,
    BLOCKED_REASON_REJECTED_BATCH, BLOCKED_REASON_REJECTED_PULL, SyncBackoffConfig,
    SyncCancellation, SyncClock, SyncCycleConfig, SyncCycleOutcome, SyncCycleState, SyncStatus,
    SyncTransport, run_sync_cycle,
};
use support::{
    FakeAssetStore, FakeClock, FakeServer, FakeTransport, PullFault, PushFault, attach_image,
    create_folder, create_note, move_into, rename_node, save_document, save_large_document,
    superseded_history,
};

const WORKSPACE: &str = "workspace-1";

struct Device {
    storage: SqliteWorkspace,
    transport: Arc<FakeTransport>,
    assets: Arc<FakeAssetStore>,
    clock: Arc<FakeClock>,
    state: SyncCycleState,
    cancellation: SyncCancellation,
    config: SyncCycleConfig,
}

impl Device {
    fn open(server: &Arc<FakeServer>, device_id: &str, clock: &Arc<FakeClock>) -> Self {
        Self::with_storage(
            SqliteWorkspace::open_in_memory().expect("open database"),
            server,
            device_id,
            clock,
        )
    }

    fn with_storage(
        storage: SqliteWorkspace,
        server: &Arc<FakeServer>,
        device_id: &str,
        clock: &Arc<FakeClock>,
    ) -> Self {
        Self {
            storage,
            transport: FakeTransport::new(server, device_id),
            assets: FakeAssetStore::new(),
            clock: Arc::clone(clock),
            state: SyncCycleState::new(SyncBackoffConfig {
                base_delay_ms: 1_000,
                max_delay_ms: 60_000,
                jitter_seed: 11,
            }),
            cancellation: SyncCancellation::new(),
            config: SyncCycleConfig::default(),
        }
    }

    fn connect(&self, device_id: &str) {
        self.storage
            .connect_sync(&NewSyncConnection {
                workspace_id: WORKSPACE.into(),
                device_id: device_id.into(),
                connected_at: self.clock.now_ms().max(1),
                observed_server_sequence: 0,
            })
            .expect("connect sync");
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

    /// Drives cycles the way the coordinator does: `pending` and
    /// `rehydrating` run again at once, `retrying` and `blocked` wait for the
    /// reported deadline, everything else settles.
    fn settle(&mut self) -> SyncStatus {
        for _ in 0..12 {
            let outcome = self.cycle();
            match outcome.status {
                SyncStatus::Pending | SyncStatus::Rehydrating => {}
                SyncStatus::Retrying { .. } | SyncStatus::Blocked { .. } => {
                    if outcome.retry_at_ms.is_none() {
                        return outcome.status;
                    }
                    self.advance_past(&outcome);
                }
                settled => return settled,
            }
        }
        panic!("sync did not settle within the cycle budget");
    }

    fn advance_past(&self, outcome: &SyncCycleOutcome) {
        if let Some(retry_at) = outcome.retry_at_ms {
            let delta = retry_at - self.clock.now_ms();
            if delta > 0 {
                self.clock.advance(delta + 1);
            }
        }
    }

    fn cursor(&self) -> u64 {
        self.storage
            .sync_connection()
            .expect("read connection")
            .expect("active connection")
            .observed_server_sequence
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

    fn markdown(&self, note_id: &str) -> String {
        self.storage
            .bootstrap()
            .expect("bootstrap")
            .documents
            .iter()
            .find(|document| document.note_id == note_id)
            .expect("document present")
            .markdown
            .clone()
    }

    fn revision(&self, note_id: &str) -> i64 {
        self.storage
            .bootstrap()
            .expect("bootstrap")
            .documents
            .iter()
            .find(|document| document.note_id == note_id)
            .expect("document present")
            .revision
    }

    fn blocked_reasons(&self) -> Vec<String> {
        self.storage
            .blocked_sync_operations()
            .expect("blocked operations")
            .into_iter()
            .map(|row| row.reason_code)
            .collect()
    }

    /// Every replicated fact the two devices are expected to agree on. Node
    /// ranks are excluded on purpose: placements are anchor-based, so sibling
    /// order converges while the absolute numbers are recomputed per device.
    fn replicated_shape(&self) -> String {
        let bootstrap = self.storage.bootstrap().expect("bootstrap");
        let mut lines = bootstrap
            .nodes
            .iter()
            .map(|node| {
                format!(
                    "node {} kind={:?} parent={:?} title={} pinned={:?} deleted={:?}",
                    node.id, node.kind, node.parent_id, node.title, node.pinned_at, node.deleted_at
                )
            })
            .chain(bootstrap.documents.iter().map(|document| {
                format!(
                    "doc {} words={} markdown={}",
                    document.note_id, document.word_count, document.markdown
                )
            }))
            .chain(
                bootstrap
                    .tags
                    .iter()
                    .map(|tag| format!("tag {} {} {:?}", tag.id, tag.name, tag.color)),
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

/// A shared note that both devices hold at the same server state, so a
/// scenario can start from a converged pair.
fn shared_note(server: &Arc<FakeServer>, clock: &Arc<FakeClock>) -> (Device, Device) {
    let mut device_a = Device::open(server, "device-a", clock);
    device_a.connect("device-a");
    device_a.apply(vec![create_note("note-shared", "Shared", 1)]);
    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);
    let mut device_b = Device::open(server, "device-b", clock);
    device_b.connect("device-b");
    assert_eq!(device_b.cycle().status, SyncStatus::UpToDate);
    (device_a, device_b)
}

#[test]
fn local_only_mode_performs_no_network_calls() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut device = Device::open(&server, "device-a", &clock);

    device.apply(vec![create_note("note-1", "Local note", 1)]);
    let outcome = device.cycle();

    assert_eq!(outcome.status, SyncStatus::LocalOnly);
    assert_eq!(outcome.retry_at_ms, None);
    assert_eq!(device.transport.total_calls(), 0);
    assert_eq!(server.log_len(), 0);
}

#[test]
fn connected_idle_workspace_reports_up_to_date() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut device = Device::open(&server, "device-a", &clock);
    device.connect("device-a");

    let outcome = device.cycle();

    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert!(!outcome.workspace_changed());
    assert_eq!(device.transport.push_calls(), 0);
    assert_eq!(device.transport.pull_calls(), 1);
}

#[test]
fn offline_edits_commit_locally_and_upload_after_restart() {
    let directory = tempfile::tempdir().expect("temp directory");
    let database_path = directory.path().join("workspace.db");
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);

    {
        let mut device = Device::with_storage(
            SqliteWorkspace::open(&database_path).expect("open database"),
            &server,
            "device-a",
            &clock,
        );
        device.connect("device-a");
        device.apply(vec![create_note("note-1", "Offline first", 1)]);
        device.apply(vec![create_note("note-2", "Offline second", 2)]);
        device.transport.script_push_fault(PushFault::Transient);
        let outcome = device.cycle();
        assert!(matches!(outcome.status, SyncStatus::Retrying { .. }));
        assert_eq!(server.log_len(), 0);
        assert_eq!(device.note_titles(), ["Offline first", "Offline second"]);
        device.advance_past(&outcome);
    }

    let mut restarted = Device::with_storage(
        SqliteWorkspace::open(&database_path).expect("reopen database"),
        &server,
        "device-a",
        &clock,
    );
    let outcome = restarted.cycle();

    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert_eq!(server.log_len(), 2);
    assert_eq!(restarted.cursor(), 2);
}

#[test]
fn acknowledgement_loss_retries_the_same_operation_identity() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut device = Device::open(&server, "device-a", &clock);
    device.connect("device-a");
    device.apply(vec![create_note("note-1", "Once only", 1)]);

    device.transport.script_push_fault(PushFault::DropResponse);
    let outcome = device.cycle();
    assert!(matches!(outcome.status, SyncStatus::Retrying { .. }));
    assert_eq!(server.log_len(), 1);

    device.advance_past(&outcome);
    let outcome = device.cycle();

    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert_eq!(server.log_len(), 1);
    assert_eq!(server.operation_ids().len(), 1);
    assert_eq!(device.cursor(), 1);
}

#[test]
fn lost_acknowledgement_resolves_through_local_echo_without_reapplying() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut device = Device::open(&server, "device-a", &clock);
    device.connect("device-a");
    device.apply(vec![create_note("note-1", "Echoed", 1)]);

    device.transport.script_push_fault(PushFault::DropResponse);
    let retrying = device.cycle();
    assert!(matches!(retrying.status, SyncStatus::Retrying { .. }));

    let outcome = device.cycle();

    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert!(
        !outcome.workspace_changed(),
        "a local echo is not a remote change"
    );
    assert_eq!(device.cursor(), 1);
    assert_eq!(device.note_titles(), ["Echoed"]);

    device.advance_past(&retrying);
    assert_eq!(device.cycle().status, SyncStatus::UpToDate);
    assert_eq!(server.log_len(), 1);
}

#[test]
fn pull_duplicates_never_reapply_content() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);
    writer.connect("device-a");
    let mut reader = Device::open(&server, "device-b", &clock);
    reader.connect("device-b");

    writer.apply(vec![create_note("note-1", "First", 1)]);
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);
    let first_pull = reader.cycle();
    assert_eq!(first_pull.status, SyncStatus::UpToDate);
    assert_eq!(first_pull.changes.note_ids, ["note-1"]);
    assert!(first_pull.changes.structure_changed);
    assert!(!first_pull.changes.full);
    assert_eq!(reader.cursor(), 1);

    writer.apply(vec![create_note("note-2", "Second", 2)]);
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);

    reader.transport.script_pull_fault(PullFault::Overlap);
    let outcome = reader.cycle();

    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert_eq!(
        outcome.changes.note_ids,
        ["note-2"],
        "the duplicate first note contributes no change"
    );
    assert_eq!(reader.cursor(), 2);
    assert_eq!(reader.note_titles(), ["First", "Second"]);
}

#[test]
fn cursor_gaps_and_malformed_responses_are_rejected_pulls_that_keep_the_cursor() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);
    writer.connect("device-a");
    let mut reader = Device::open(&server, "device-b", &clock);
    reader.connect("device-b");

    writer.apply(vec![create_note("note-1", "One", 1)]);
    writer.apply(vec![create_note("note-2", "Two", 2)]);
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);

    reader.transport.script_pull_fault(PullFault::Gap);
    let gap = reader.cycle();
    assert_eq!(
        blocked_reason(&gap.status),
        Some(BLOCKED_REASON_REJECTED_PULL)
    );
    assert!(
        blocked_detail(&gap.status).is_some_and(|detail| detail.contains("server sequence")),
        "the block names the gap: {:?}",
        gap.status
    );
    assert_eq!(reader.cursor(), 0);

    reader.transport.script_pull_fault(PullFault::WrongProtocol);
    reader.advance_past(&gap);
    let malformed = reader.cycle();
    assert_eq!(
        blocked_reason(&malformed.status),
        Some(BLOCKED_REASON_REJECTED_PULL)
    );
    assert_eq!(reader.cursor(), 0);

    reader.advance_past(&malformed);
    assert_eq!(reader.cycle().status, SyncStatus::UpToDate);
    assert_eq!(reader.cursor(), 2);
    assert_eq!(reader.note_titles(), ["One", "Two"]);
}

#[test]
fn unappliable_remote_operations_are_superseded_while_later_operations_proceed() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let foreign = FakeTransport::new(&server, "device-c");
    let request = SyncPushRequest::v1(
        "device-c",
        vec![
            ClientSyncOperation {
                operation_id: "op-orphan".into(),
                client_sequence: 1,
                base_server_sequence: 0,
                payload: SyncOperationPayload::inline(rename_node(
                    "missing-note",
                    "Never created",
                    1,
                )),
            },
            ClientSyncOperation {
                operation_id: "op-valid".into(),
                client_sequence: 2,
                base_server_sequence: 0,
                payload: SyncOperationPayload::inline(create_note(
                    "note-c",
                    "Survives the orphan",
                    2,
                )),
            },
        ],
    );
    foreign
        .push(WORKSPACE, &request, &SyncCancellation::new())
        .expect("seed foreign operations");

    let mut device = Device::open(&server, "device-a", &clock);
    device.connect("device-a");
    let outcome = device.cycle();

    assert_eq!(
        outcome.status,
        SyncStatus::UpToDate,
        "an operation that cannot apply never asks the user anything"
    );
    assert_eq!(device.cursor(), 2);
    assert_eq!(device.note_titles(), ["Survives the orphan"]);
    assert!(outcome.changes.structure_changed);

    device.apply(vec![create_note("note-later", "Still syncing", 3)]);
    assert_eq!(device.cycle().status, SyncStatus::UpToDate);
    assert_eq!(server.log_len(), 3);
}

#[test]
fn pull_transport_failures_retry_or_pause_without_advancing() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);
    writer.connect("device-a");
    writer.apply(vec![create_note("note-1", "Remote", 1)]);
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);

    let mut reader = Device::open(&server, "device-b", &clock);
    reader.connect("device-b");

    reader.transport.script_pull_fault(PullFault::Transient);
    let transient = reader.cycle();
    assert!(matches!(transient.status, SyncStatus::Retrying { .. }));
    assert_eq!(reader.cursor(), 0);

    reader.transport.script_pull_fault(PullFault::AuthExpired);
    reader.advance_past(&transient);
    let expired = reader.cycle();
    assert_eq!(expired.status, SyncStatus::AuthenticationRequired);
    assert_eq!(reader.cursor(), 0);

    assert_eq!(reader.cycle().status, SyncStatus::UpToDate);
    assert_eq!(reader.cursor(), 1);
    assert_eq!(reader.note_titles(), ["Remote"]);
}

#[test]
fn token_expiry_mid_pull_keeps_the_applied_page_and_resumes_from_it() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);
    writer.connect("device-a");
    writer.apply(vec![create_note("note-1", "First page", 1)]);
    writer.apply(vec![create_note("note-2", "Second page", 2)]);
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);

    let mut reader = Device::open(&server, "device-b", &clock);
    reader.config.pull_batch_limit = 1;
    reader.connect("device-b");
    reader.transport.script_pull_fault(PullFault::Pass);
    reader.transport.script_pull_fault(PullFault::AuthExpired);

    let expired = reader.cycle();
    assert_eq!(expired.status, SyncStatus::AuthenticationRequired);
    assert_eq!(
        reader.cursor(),
        1,
        "the page applied before expiry stays applied and the cursor stops there"
    );
    assert_eq!(reader.note_titles(), ["First page"]);
    assert_eq!(expired.changes.note_ids, ["note-1"]);

    let resumed = reader.cycle();
    assert_eq!(resumed.status, SyncStatus::UpToDate);
    assert_eq!(reader.cursor(), 2);
    assert_eq!(reader.note_titles(), ["First page", "Second page"]);
}

#[test]
fn expired_sessions_pause_and_resume_after_refresh() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut device = Device::open(&server, "device-a", &clock);
    device.connect("device-a");
    device.apply(vec![create_note("note-1", "Paused", 1)]);

    device.transport.script_push_fault(PushFault::AuthExpired);
    let outcome = device.cycle();

    assert_eq!(outcome.status, SyncStatus::AuthenticationRequired);
    assert_eq!(outcome.retry_at_ms, None);
    assert_eq!(server.log_len(), 0);
    assert_eq!(
        device.transport.pull_calls(),
        0,
        "an expired session never pulls with the dead token"
    );

    let outcome = device.cycle();
    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert_eq!(server.log_len(), 1);
}

#[test]
fn rate_limit_hints_set_a_durable_retry_time_that_refresh_clears() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut device = Device::open(&server, "device-a", &clock);
    device.connect("device-a");
    device.apply(vec![create_note("note-1", "Limited", 1)]);

    device
        .transport
        .script_push_fault(PushFault::RateLimited(120_000));
    let outcome = device.cycle();

    let retry_at = outcome.retry_at_ms.expect("retry time");
    assert!(retry_at >= clock.now_ms() + 120_000);
    assert!(matches!(outcome.status, SyncStatus::Retrying { .. }));

    clock.advance(1_000);
    let early = device.cycle();
    assert_eq!(server.log_len(), 0);
    assert_eq!(
        early.status,
        SyncStatus::Retrying {
            next_attempt_at: retry_at
        },
        "a delayed outbox row is never reported as up to date"
    );
    assert_eq!(
        device.storage.next_sync_attempt_at().expect("next attempt"),
        Some(retry_at)
    );

    let cleared = device
        .storage
        .reset_sync_retry_times(clock.now_ms())
        .expect("reset retry times");
    assert_eq!(cleared, 1);
    assert_eq!(device.cycle().status, SyncStatus::UpToDate);
    assert_eq!(server.log_len(), 1);
}

#[test]
fn cancellation_releases_the_claim_without_losing_work() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut device = Device::open(&server, "device-a", &clock);
    device.connect("device-a");
    device.apply(vec![create_note("note-1", "Cancelled", 1)]);

    device.cancellation.interrupt();
    let outcome = device.cycle();
    assert_eq!(outcome.status, SyncStatus::Pending);
    assert_eq!(server.log_len(), 0);

    device.cancellation.clear_interrupt();
    clock.advance(1);
    assert_eq!(device.cycle().status, SyncStatus::UpToDate);
    assert_eq!(server.log_len(), 1);
}

#[test]
fn pull_after_a_failed_push_still_receives_remote_changes() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);
    writer.connect("device-a");
    writer.apply(vec![create_note("note-remote", "From the writer", 1)]);
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);

    let mut reader = Device::open(&server, "device-b", &clock);
    reader.connect("device-b");
    reader.apply(vec![create_note("note-local", "Cannot upload yet", 1)]);
    reader.transport.script_push_fault(PushFault::Transient);

    let outcome = reader.cycle();

    assert!(
        matches!(outcome.status, SyncStatus::Retrying { .. }),
        "the failed push is reported: {:?}",
        outcome.status
    );
    assert_eq!(
        reader.note_titles(),
        ["Cannot upload yet", "From the writer"],
        "the pull still ran after the failed push"
    );
    assert_eq!(reader.cursor(), 1);
    assert_eq!(outcome.changes.note_ids, ["note-remote"]);
    assert_eq!(server.log_len(), 1);

    reader.advance_past(&outcome);
    assert_eq!(reader.cycle().status, SyncStatus::UpToDate);
    assert_eq!(server.log_len(), 2);
}

#[test]
fn two_databases_exchange_operations_after_offline_edits_and_restart() {
    let directory = tempfile::tempdir().expect("temp directory");
    let path_a = directory.path().join("device-a.db");
    let path_b = directory.path().join("device-b.db");
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);

    {
        let device_a = Device::with_storage(
            SqliteWorkspace::open(&path_a).expect("open device a"),
            &server,
            "device-a",
            &clock,
        );
        device_a.connect("device-a");
        device_a.apply(vec![create_note("note-a", "From device A", 1)]);
        let device_b = Device::with_storage(
            SqliteWorkspace::open(&path_b).expect("open device b"),
            &server,
            "device-b",
            &clock,
        );
        device_b.connect("device-b");
        device_b.apply(vec![create_note("note-b", "From device B", 1)]);
    }

    let mut device_a = Device::with_storage(
        SqliteWorkspace::open(&path_a).expect("reopen device a"),
        &server,
        "device-a",
        &clock,
    );
    let mut device_b = Device::with_storage(
        SqliteWorkspace::open(&path_b).expect("reopen device b"),
        &server,
        "device-b",
        &clock,
    );

    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);
    assert_eq!(device_b.cycle().status, SyncStatus::UpToDate);
    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);

    assert_eq!(device_a.note_titles(), ["From device A", "From device B"]);
    assert_eq!(device_b.note_titles(), ["From device A", "From device B"]);
    assert_eq!(server.log_len(), 2);
    assert_eq!(device_a.replicated_shape(), device_b.replicated_shape());
}

/// The local-first onboarding order: write locally, sign in second, add a
/// device third. Nothing concurrent happens, so nothing may be preserved as
/// superseded — the devices simply agree. Documents seeded from an existing
/// workspace arrive as `CreateNote`, which restarts the receiving device's
/// revision counter, so this converges only while merge decisions ignore
/// that counter.
#[test]
fn a_workspace_written_before_the_first_sign_in_converges_on_a_second_device() {
    let directory = tempfile::tempdir().expect("temp directory");
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);

    let mut device_a = Device::with_storage(
        SqliteWorkspace::open(directory.path().join("device-a.db")).expect("open device a"),
        &server,
        "device-a",
        &clock,
    );
    device_a.apply(vec![create_folder("folder-1", "Projects", 1)]);
    device_a.apply(vec![create_note("note-1", "First", 1)]);
    device_a.apply(vec![create_note("note-2", "Second", 1)]);
    device_a.apply(vec![move_into("note-1", "folder-1", 2)]);
    device_a.apply(vec![save_document("note-1", 1, "First body", 3)]);
    device_a.apply(vec![save_document("note-2", 1, "Second body", 3)]);
    device_a.apply(vec![save_document("note-1", 2, "First body revised", 4)]);

    device_a.connect("device-a");
    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);

    let mut device_b = Device::with_storage(
        SqliteWorkspace::open(directory.path().join("device-b.db")).expect("open device b"),
        &server,
        "device-b",
        &clock,
    );
    device_b.connect("device-b");
    assert_eq!(device_b.cycle().status, SyncStatus::UpToDate);
    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);
    assert_eq!(device_a.replicated_shape(), device_b.replicated_shape());

    device_a.apply(vec![save_document("note-1", 3, "Edited on device A", 5)]);
    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);
    assert_eq!(device_b.cycle().status, SyncStatus::UpToDate);
    device_a.apply(vec![save_document(
        "note-1",
        4,
        "Edited again on device A",
        6,
    )]);
    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);
    assert_eq!(device_b.cycle().status, SyncStatus::UpToDate);

    assert_eq!(device_b.markdown("note-1"), "Edited again on device A");
    assert_eq!(device_a.replicated_shape(), device_b.replicated_shape());
    for device in [&device_a, &device_b] {
        assert!(
            superseded_history(&device.storage).is_empty(),
            "sequential editing must not preserve a superseded body"
        );
    }
}

/// The reverse direction of the same path: the device that joined second is
/// the one editing, so the origin device has to accept a write whose revision
/// number it never issued.
#[test]
fn the_joining_device_can_edit_a_seeded_note_back_to_the_origin() {
    let directory = tempfile::tempdir().expect("temp directory");
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);

    let mut device_a = Device::with_storage(
        SqliteWorkspace::open(directory.path().join("device-a.db")).expect("open device a"),
        &server,
        "device-a",
        &clock,
    );
    device_a.apply(vec![create_note("note-1", "Shared", 1)]);
    device_a.apply(vec![save_document("note-1", 1, "Written offline", 2)]);
    device_a.connect("device-a");
    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);

    let mut device_b = Device::with_storage(
        SqliteWorkspace::open(directory.path().join("device-b.db")).expect("open device b"),
        &server,
        "device-b",
        &clock,
    );
    device_b.connect("device-b");
    assert_eq!(device_b.cycle().status, SyncStatus::UpToDate);

    let revision_b = device_b.revision("note-1");
    device_b.apply(vec![save_document(
        "note-1",
        revision_b,
        "Edited on device B",
        3,
    )]);
    assert_eq!(device_b.cycle().status, SyncStatus::UpToDate);
    let outcome_a = device_a.cycle();
    assert_eq!(outcome_a.status, SyncStatus::UpToDate);
    assert_eq!(outcome_a.changes.note_ids, ["note-1"]);
    assert!(!outcome_a.changes.structure_changed);

    assert_eq!(device_a.markdown("note-1"), "Edited on device B");
}

/// An edit that has not reached the log yet is invisible to the remote
/// author, so the local body stays and the incoming body is preserved to
/// history. Once the local write is pushed it carries the greater server
/// sequence and every device converges on it.
#[test]
fn an_unpushed_local_edit_wins_over_an_incoming_write_and_preserves_it() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let (mut device_a, mut device_b) = shared_note(&server, &clock);

    let revision = device_b.revision("note-shared");
    device_a.apply(vec![save_document(
        "note-shared",
        device_a.revision("note-shared"),
        "Edited on device A",
        2,
    )]);
    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);

    device_b.apply(vec![save_document(
        "note-shared",
        revision,
        "Edited on device B",
        2,
    )]);
    device_b.transport.script_push_fault(PushFault::Transient);
    let failed_push = device_b.cycle();
    assert!(
        matches!(failed_push.status, SyncStatus::Retrying { .. }),
        "expected the failed push to retry, got {:?}",
        failed_push.status
    );
    assert_eq!(
        device_b.markdown("note-shared"),
        "Edited on device B",
        "an unpushed local edit is never fast-forwarded over"
    );
    assert_eq!(
        superseded_history(&device_b.storage),
        [("note-shared".to_string(), "Edited on device A".to_string())],
        "the incoming body is preserved to history with provenance superseded"
    );

    device_b.advance_past(&failed_push);
    assert_eq!(device_b.cycle().status, SyncStatus::UpToDate);
    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);
    assert_eq!(device_a.markdown("note-shared"), "Edited on device B");
    assert_eq!(device_a.replicated_shape(), device_b.replicated_shape());
}

fn offline_editors_reconnect(first_is_a: bool) {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let (mut device_a, mut device_b) = shared_note(&server, &clock);

    device_a.apply(vec![save_document(
        "note-shared",
        device_a.revision("note-shared"),
        "Offline edit on A",
        2,
    )]);
    device_b.apply(vec![save_document(
        "note-shared",
        device_b.revision("note-shared"),
        "Offline edit on B",
        2,
    )]);

    {
        let (first, second) = if first_is_a {
            (&mut device_a, &mut device_b)
        } else {
            (&mut device_b, &mut device_a)
        };
        assert_eq!(first.settle(), SyncStatus::UpToDate);
        assert_eq!(second.settle(), SyncStatus::UpToDate);
        assert_eq!(first.settle(), SyncStatus::UpToDate);
    }
    let second = if first_is_a { &device_b } else { &device_a };

    let winner = if first_is_a {
        "Offline edit on B"
    } else {
        "Offline edit on A"
    };
    let loser = if first_is_a {
        "Offline edit on A"
    } else {
        "Offline edit on B"
    };
    assert_eq!(
        device_a.markdown("note-shared"),
        winner,
        "the later server-ordered write wins everywhere"
    );
    assert_eq!(device_b.markdown("note-shared"), winner);
    assert_eq!(device_a.replicated_shape(), device_b.replicated_shape());
    assert_eq!(
        superseded_history(&second.storage),
        [("note-shared".to_string(), loser.to_string())],
        "the losing body is preserved on the device that outranked it"
    );
    assert_eq!(server.log_len(), 3);
}

#[test]
fn two_offline_editors_converge_when_a_reconnects_first() {
    offline_editors_reconnect(true);
}

#[test]
fn two_offline_editors_converge_when_b_reconnects_first() {
    offline_editors_reconnect(false);
}

#[test]
fn offline_edits_on_both_devices_converge_when_both_reconnect_at_once() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let (mut device_a, mut device_b) = shared_note(&server, &clock);

    device_a.apply(vec![save_document(
        "note-shared",
        device_a.revision("note-shared"),
        "Offline edit on A",
        2,
    )]);
    device_b.apply(vec![save_document(
        "note-shared",
        device_b.revision("note-shared"),
        "Offline edit on B",
        2,
    )]);
    // Both push before either pulls: each device acknowledges its own write
    // before it sees the other's, which is the ack-before-echo window.
    device_a.transport.script_pull_fault(PullFault::Transient);
    device_b.transport.script_pull_fault(PullFault::Transient);
    assert!(matches!(
        device_a.cycle().status,
        SyncStatus::Retrying { .. }
    ));
    assert!(matches!(
        device_b.cycle().status,
        SyncStatus::Retrying { .. }
    ));
    assert_eq!(server.log_len(), 3);

    assert_eq!(device_a.settle(), SyncStatus::UpToDate);
    assert_eq!(device_b.settle(), SyncStatus::UpToDate);

    assert_eq!(device_a.markdown("note-shared"), "Offline edit on B");
    assert_eq!(device_b.markdown("note-shared"), "Offline edit on B");
    assert_eq!(device_a.replicated_shape(), device_b.replicated_shape());
    assert_eq!(
        superseded_history(&device_b.storage),
        [("note-shared".to_string(), "Offline edit on A".to_string())]
    );
}

#[test]
fn three_devices_converge_across_the_ack_before_echo_window() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let (mut device_a, mut device_b) = shared_note(&server, &clock);
    let mut device_c = Device::open(&server, "device-c", &clock);
    device_c.connect("device-c");
    assert_eq!(device_c.cycle().status, SyncStatus::UpToDate);

    // B pushes and is acknowledged, but its pull fails before the echo lands.
    device_b.apply(vec![save_document(
        "note-shared",
        device_b.revision("note-shared"),
        "Edited on B",
        2,
    )]);
    device_b.transport.script_pull_fault(PullFault::Transient);
    assert!(matches!(
        device_b.cycle().status,
        SyncStatus::Retrying { .. }
    ));
    assert_eq!(server.log_len(), 2);

    // A writes concurrently and lands above B's write.
    device_a.apply(vec![save_document(
        "note-shared",
        device_a.revision("note-shared"),
        "Edited on A",
        2,
    )]);
    assert_eq!(device_a.settle(), SyncStatus::UpToDate);
    assert_eq!(server.log_len(), 3);

    assert_eq!(device_c.settle(), SyncStatus::UpToDate);
    assert_eq!(device_b.settle(), SyncStatus::UpToDate);
    assert_eq!(device_a.settle(), SyncStatus::UpToDate);

    for device in [&device_a, &device_b, &device_c] {
        assert_eq!(device.markdown("note-shared"), "Edited on A");
    }
    assert_eq!(device_a.replicated_shape(), device_b.replicated_shape());
    assert_eq!(device_a.replicated_shape(), device_c.replicated_shape());
    assert_eq!(
        superseded_history(&device_a.storage),
        [("note-shared".to_string(), "Edited on B".to_string())],
        "A outranked B's write and preserved it"
    );
    assert!(
        superseded_history(&device_c.storage).is_empty(),
        "C applied both writes in order and superseded nothing"
    );
}

#[test]
fn log_truncated_with_a_non_empty_outbox_blocks_then_recovers_after_the_push() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let (mut device_a, mut device_b) = shared_note(&server, &clock);

    device_b.apply(vec![create_note("note-b", "Written on B", 2)]);
    device_b.transport.script_push_fault(PushFault::Transient);
    device_a.apply(vec![create_note("note-a", "Written on A", 2)]);
    assert_eq!(device_a.settle(), SyncStatus::UpToDate);
    server.compact_through(2);

    let blocked = device_b.cycle();
    assert_eq!(
        blocked_reason(&blocked.status),
        Some(BLOCKED_REASON_LOG_TRUNCATED),
        "a device with unsent work cannot be rebuilt: {:?}",
        blocked.status
    );
    assert!(blocked_detail(&blocked.status).is_some());
    assert_eq!(device_b.cursor(), 1);
    assert_eq!(server.log_len(), 1 + 1);

    device_b.advance_past(&blocked);
    let pushed = device_b.cycle();
    assert_eq!(
        pushed.status,
        SyncStatus::Rehydrating,
        "with the outbox drained the device asks to be rebuilt: {:?}",
        pushed.status
    );
    assert_eq!(server.log_len(), 3);
    assert!(
        server.latest_checkpoint_sequence().is_none(),
        "no checkpoint has been published yet"
    );
    let without_checkpoint = device_b.cycle();
    assert_eq!(
        blocked_reason(&without_checkpoint.status),
        Some("log_truncated_without_checkpoint")
    );
}

#[test]
fn oversized_pull_responses_halve_the_page_limit_until_a_page_succeeds() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);
    writer.connect("device-a");
    writer.apply(vec![create_note("note-1", "One", 1)]);
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);

    let mut reader = Device::open(&server, "device-b", &clock);
    reader.config.pull_batch_limit = 8;
    reader.connect("device-b");
    reader.transport.script_pull_fault(PullFault::TooLarge);
    reader.transport.script_pull_fault(PullFault::TooLarge);

    let first = reader.cycle();
    assert!(matches!(first.status, SyncStatus::Retrying { .. }));
    reader.advance_past(&first);
    let second = reader.cycle();
    assert!(matches!(second.status, SyncStatus::Retrying { .. }));
    reader.advance_past(&second);
    assert_eq!(reader.cycle().status, SyncStatus::UpToDate);
    assert_eq!(reader.cycle().status, SyncStatus::UpToDate);

    assert_eq!(
        reader.transport.pull_limits(),
        [8, 4, 2, 8],
        "the page shrinks after every oversized answer and restores after success"
    );
    assert_eq!(reader.note_titles(), ["One"]);
}

#[test]
fn three_identical_rejections_park_the_batch_as_cloud_rejected() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut device = Device::open(&server, "device-a", &clock);
    device.connect("device-a");
    device.apply(vec![create_note("note-1", "Rejected", 1)]);

    for attempt in 1..=2 {
        device.transport.script_push_fault(PushFault::Rejected);
        let outcome = device.cycle();
        assert_eq!(
            blocked_reason(&outcome.status),
            Some(BLOCKED_REASON_REJECTED_BATCH),
            "attempt {attempt}: {:?}",
            outcome.status
        );
        assert!(device.blocked_reasons().is_empty());
        device.advance_past(&outcome);
    }
    device.transport.script_push_fault(PushFault::Rejected);
    let third = device.cycle();
    device.advance_past(&third);

    assert_eq!(device.blocked_reasons(), ["cloud_rejected"]);
    assert_eq!(server.log_len(), 0);
    assert!(
        !device
            .storage
            .has_pending_sync_operations()
            .expect("pending")
            || device.cycle().status != SyncStatus::UpToDate,
        "a parked batch stays visible instead of reading as up to date"
    );
}

#[test]
fn a_busy_local_database_is_a_short_retry_and_a_backend_failure_a_visible_block() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut device = Device::open(&server, "device-a", &clock);
    device.connect("device-a");
    let config = device.config.clone();
    let busy = skriuw_sync::classify_storage_failure(
        device.clock.as_ref(),
        &mut device.state.backoff,
        &config,
        &skriuw_storage::StorageError::Busy("database is locked".into()),
    );
    assert!(matches!(busy.status, SyncStatus::Retrying { .. }));
    assert!(busy.retry_at_ms.expect("retry") < clock.now_ms() + 60_000);

    let backend = skriuw_sync::classify_storage_failure(
        device.clock.as_ref(),
        &mut device.state.backoff,
        &config,
        &skriuw_storage::StorageError::Backend("disk I/O error".into()),
    );
    assert_eq!(blocked_reason(&backend.status), Some("storage_failure"));
    assert!(blocked_detail(&backend.status).is_some_and(|detail| detail.contains("disk I/O")));
    assert_eq!(
        backend.retry_at_ms,
        Some(clock.now_ms() + config.blocked_retry_delay_ms)
    );
}

#[test]
fn oversized_operations_travel_as_chunks_and_converge_on_a_second_device() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);
    writer.connect("device-a");

    let large_bytes = skriuw_domain::MAX_INLINE_SYNC_OPERATION_BYTES + 4_096;
    writer.apply(vec![create_note("note-large", "Large", 1)]);
    writer.apply(vec![save_large_document("note-large", 1, large_bytes, 2)]);
    writer.apply(vec![rename_node("note-large", "Large renamed", 3)]);

    assert_eq!(writer.settle(), SyncStatus::UpToDate);
    assert_eq!(writer.storage.blocked_sync_operations().unwrap().len(), 0);
    assert_eq!(server.operation_ids().len(), 3);
    assert!(
        server.stored_chunks() >= 2,
        "a 1.5 MiB document must occupy more than one canonical chunk"
    );

    let mut reader = Device::open(&server, "device-b", &clock);
    reader.connect("device-b");
    assert_eq!(reader.settle(), SyncStatus::UpToDate);

    let snapshot = reader.storage.bootstrap().expect("bootstrap");
    let document = snapshot
        .documents
        .iter()
        .find(|document| document.note_id == "note-large")
        .expect("chunked document reached the second device");
    assert_eq!(document.markdown.len(), large_bytes);
    assert_eq!(
        snapshot
            .nodes
            .iter()
            .find(|node| node.id == "note-large")
            .map(|node| node.title.as_str()),
        Some("Large renamed")
    );
    assert_eq!(reader.cursor(), 3);
}

fn image_bytes(length: usize) -> Vec<u8> {
    (0..length).map(|index| (index % 251) as u8).collect()
}

#[test]
fn attached_images_converge_with_verified_asset_bytes_on_a_second_device() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);
    writer.connect("device-a");

    let bytes = image_bytes(skriuw_domain::CANONICAL_CHUNK_BYTES + 4_096);
    let content_hash = writer.assets.put(&bytes);
    writer.apply(vec![create_note("note-1", "Illustrated", 1)]);
    writer.apply(vec![attach_image("image-1", "note-1", &bytes, 2)]);

    let outcome = writer.cycle();
    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert_eq!(server.log_len(), 2);
    assert_eq!(
        server.stored_chunks(),
        2,
        "the asset must travel as canonical chunks"
    );
    assert_eq!(writer.storage.blocked_sync_operations().unwrap().len(), 0);

    let mut reader = Device::open(&server, "device-b", &clock);
    reader.connect("device-b");
    let pulled = reader.cycle();
    assert_eq!(pulled.status, SyncStatus::UpToDate);
    assert!(pulled.changes.structure_changed);

    let snapshot = reader.storage.bootstrap().expect("bootstrap");
    let image = snapshot
        .images
        .iter()
        .find(|image| image.id == "image-1")
        .expect("attached image reached the second device");
    assert_eq!(image.note_id, "note-1");
    assert_eq!(image.content_hash, content_hash);
    assert_eq!(image.byte_size, bytes.len() as i64);
    assert_eq!(
        reader.assets.get(&content_hash),
        Some(bytes),
        "asset bytes must be stored and digest-verified on the second device"
    );
    assert_eq!(reader.cursor(), 2);
}

#[test]
fn images_attached_before_connecting_replicate_to_a_second_device() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);

    let bytes = image_bytes(64 * 1024);
    let content_hash = writer.assets.put(&bytes);
    writer.apply(vec![create_note("note-1", "Illustrated early", 1)]);
    writer.apply(vec![attach_image("image-1", "note-1", &bytes, 2)]);

    writer.connect("device-a");
    let outcome = writer.cycle();
    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert_eq!(server.log_len(), 2);
    assert_eq!(writer.storage.blocked_sync_operations().unwrap().len(), 0);

    let mut reader = Device::open(&server, "device-b", &clock);
    reader.connect("device-b");
    assert_eq!(reader.cycle().status, SyncStatus::UpToDate);

    let snapshot = reader.storage.bootstrap().expect("bootstrap");
    let image = snapshot
        .images
        .iter()
        .find(|image| image.id == "image-1")
        .expect("pre-connect image reached the second device");
    assert_eq!(image.note_id, "note-1");
    assert_eq!(image.content_hash, content_hash);
    assert_eq!(
        reader.assets.get(&content_hash),
        Some(bytes),
        "asset bytes must be stored and digest-verified on the second device"
    );
    assert_eq!(reader.cursor(), 2);
}

#[test]
fn a_missing_image_blob_blocks_only_the_attach_operation() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);

    let bytes = image_bytes(4_096);
    writer.apply(vec![create_note("note-1", "Missing blob", 1)]);
    writer.apply(vec![attach_image("image-1", "note-1", &bytes, 2)]);
    writer.apply(vec![create_note("note-2", "Still syncs", 3)]);

    writer.connect("device-a");
    let outcome = writer.cycle();

    assert_eq!(
        blocked_reason(&outcome.status),
        Some(BLOCKED_OPERATION_REASON_ASSET_CONTENT_MISSING),
        "a parked row keeps the device out of up to date: {:?}",
        outcome.status
    );
    assert_eq!(
        outcome.retry_at_ms, None,
        "a parked row waits for the user or the bytes, not a timer"
    );
    assert_eq!(
        server.log_len(),
        2,
        "both notes must replicate around the blocked image"
    );
    let blocked = writer.storage.blocked_sync_operations().unwrap();
    assert_eq!(blocked.len(), 1);
    assert_eq!(blocked[0].reason_code, "asset_content_missing");
    assert_eq!(blocked[0].operation_type, "attach_image");

    writer.apply(vec![create_note("note-3", "Later work flows", 4)]);
    assert_eq!(
        blocked_reason(&writer.cycle().status),
        Some(BLOCKED_OPERATION_REASON_ASSET_CONTENT_MISSING)
    );
    assert_eq!(server.log_len(), 3);

    let mut reader = Device::open(&server, "device-b", &clock);
    reader.connect("device-b");
    assert_eq!(reader.cycle().status, SyncStatus::UpToDate);
    let snapshot = reader.storage.bootstrap().expect("bootstrap");
    assert_eq!(
        reader.note_titles(),
        ["Later work flows", "Missing blob", "Still syncs"]
    );
    assert!(
        snapshot.images.is_empty(),
        "an image with no local bytes must not replicate as metadata"
    );
}

#[test]
fn a_missing_blob_block_clears_once_the_bytes_arrive_locally() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);

    let bytes = image_bytes(4_096);
    writer.apply(vec![create_note("note-1", "Missing blob", 1)]);
    writer.apply(vec![attach_image("image-1", "note-1", &bytes, 2)]);

    writer.connect("device-a");
    assert!(matches!(writer.cycle().status, SyncStatus::Blocked { .. }));
    assert_eq!(writer.storage.blocked_sync_operations().unwrap().len(), 1);
    assert_eq!(server.log_len(), 1);

    let content_hash = writer.assets.put(&bytes);
    clock.advance(10);
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);
    assert!(
        writer.storage.blocked_sync_operations().unwrap().is_empty(),
        "the block must clear on its own once the blob exists locally"
    );
    assert_eq!(server.log_len(), 2);

    let mut reader = Device::open(&server, "device-b", &clock);
    reader.connect("device-b");
    assert_eq!(reader.cycle().status, SyncStatus::UpToDate);
    let snapshot = reader.storage.bootstrap().expect("bootstrap");
    assert_eq!(
        snapshot
            .images
            .iter()
            .map(|image| image.content_hash.as_str())
            .collect::<Vec<_>>(),
        vec![content_hash.as_str()],
        "the recovered image reaches the second device"
    );
}

#[test]
fn a_user_retry_without_the_blob_stays_blocked_with_a_fresh_record() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);

    let bytes = image_bytes(4_096);
    writer.apply(vec![create_note("note-1", "Missing blob", 1)]);
    writer.apply(vec![attach_image("image-1", "note-1", &bytes, 2)]);

    writer.connect("device-a");
    assert!(matches!(writer.cycle().status, SyncStatus::Blocked { .. }));
    let first_view = writer.storage.sync_recovery_view().expect("recovery view");
    assert_eq!(first_view.blocked.len(), 1);
    let first = &first_view.blocked[0];
    assert_eq!(first.reason_code, "asset_content_missing");
    assert_eq!(first.target_id.as_deref(), Some("note-1"));

    clock.advance(10);
    writer
        .storage
        .retry_blocked_sync_operation(&first.blocked_id, clock.now_ms())
        .expect("retry the blocked operation");
    assert!(
        writer
            .storage
            .sync_recovery_view()
            .expect("recovery view")
            .blocked
            .is_empty()
    );

    assert!(matches!(writer.cycle().status, SyncStatus::Blocked { .. }));
    let second_view = writer.storage.sync_recovery_view().expect("recovery view");
    assert_eq!(
        second_view.blocked.len(),
        1,
        "the retried operation blocks again while the blob stays missing"
    );
    let second = &second_view.blocked[0];
    assert_eq!(second.reason_code, "asset_content_missing");
    assert_ne!(second.blocked_id, first.blocked_id);
    assert_eq!(
        server.log_len(),
        1,
        "the attach operation must not reach the server without its bytes"
    );
}

#[test]
fn missing_or_corrupt_asset_chunks_fail_the_pull_without_applying_the_image() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);
    writer.connect("device-a");
    let bytes = image_bytes(64 * 1024);
    let content_hash = writer.assets.put(&bytes);
    writer.apply(vec![create_note("note-1", "Illustrated", 1)]);
    writer.apply(vec![attach_image("image-1", "note-1", &bytes, 2)]);
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);

    server.corrupt_chunks();
    let mut reader = Device::open(&server, "device-b", &clock);
    reader.connect("device-b");
    let corrupt = reader.cycle();
    assert!(
        matches!(
            corrupt.status,
            SyncStatus::Retrying { .. } | SyncStatus::Blocked { .. }
        ),
        "corrupt asset content must not advance the cursor: {:?}",
        corrupt.status
    );
    assert_eq!(reader.cursor(), 0);
    assert!(
        reader
            .storage
            .bootstrap()
            .expect("bootstrap")
            .images
            .is_empty()
    );
    assert_eq!(reader.assets.get(&content_hash), None);

    server.discard_chunks();
    reader.advance_past(&corrupt);
    let missing = reader.cycle();
    assert!(
        matches!(
            missing.status,
            SyncStatus::Retrying { .. } | SyncStatus::Blocked { .. }
        ),
        "missing asset content must not advance the cursor: {:?}",
        missing.status
    );
    assert_eq!(reader.cursor(), 0);
    let snapshot = reader.storage.bootstrap().expect("bootstrap");
    assert!(
        snapshot.images.is_empty(),
        "no partial image may be applied"
    );
    assert!(snapshot.nodes.is_empty(), "no partial page may be applied");
    assert_eq!(reader.assets.get(&content_hash), None);
}

#[test]
fn a_missing_chunk_fails_the_pull_instead_of_applying_partial_content() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut writer = Device::open(&server, "device-a", &clock);
    writer.connect("device-a");
    writer.apply(vec![create_note("note-large", "Large", 1)]);
    writer.apply(vec![save_large_document(
        "note-large",
        1,
        skriuw_domain::MAX_INLINE_SYNC_OPERATION_BYTES + 4_096,
        2,
    )]);
    assert_eq!(writer.settle(), SyncStatus::UpToDate);
    server.discard_chunks();

    let mut reader = Device::open(&server, "device-b", &clock);
    reader.connect("device-b");
    let outcome = reader.cycle();

    assert!(
        matches!(
            outcome.status,
            SyncStatus::Retrying { .. } | SyncStatus::Blocked { .. }
        ),
        "unresolvable content must not advance the cursor: {:?}",
        outcome.status
    );
    let snapshot = reader.storage.bootstrap().expect("bootstrap");
    assert!(
        snapshot
            .documents
            .iter()
            .all(|document| document.markdown.is_empty()),
        "no partial content may be applied"
    );
}
