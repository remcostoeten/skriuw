#[allow(dead_code)]
mod support;

use std::sync::Arc;

use skriuw_domain::{ClientSyncOperation, SyncOperationPayload, SyncPushRequest};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{NewSyncConnection, WorkspaceStorage, WorkspaceSyncQueue};
use skriuw_sync::{
    SyncBackoff, SyncBackoffConfig, SyncCancellation, SyncClock, SyncCycleConfig, SyncCycleOutcome,
    SyncStatus, SyncTransport, run_sync_cycle,
};
use support::{
    FakeClock, FakeServer, FakeTransport, PullFault, PushFault, create_note, rename_node,
    save_large_document,
};

const WORKSPACE: &str = "workspace-1";

struct Device {
    storage: SqliteWorkspace,
    transport: Arc<FakeTransport>,
    clock: Arc<FakeClock>,
    backoff: SyncBackoff,
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
            self.clock.as_ref(),
            &self.cancellation,
            &mut self.backoff,
            &self.config,
        )
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
    let ids = server.operation_ids();
    assert_eq!(ids.len(), 1);
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
    assert_eq!(device.cursor(), 1);
    assert_eq!(device.note_titles(), ["Echoed"]);
    assert!(
        device
            .storage
            .sync_conflicts()
            .expect("conflicts")
            .is_empty()
    );

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
    assert_eq!(reader.cycle().status, SyncStatus::UpToDate);
    assert_eq!(reader.cursor(), 1);

    writer.apply(vec![create_note("note-2", "Second", 2)]);
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);

    reader.transport.script_pull_fault(PullFault::Overlap);
    let outcome = reader.cycle();

    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert_eq!(reader.cursor(), 2);
    assert_eq!(reader.note_titles(), ["First", "Second"]);
    assert!(
        reader
            .storage
            .sync_conflicts()
            .expect("conflicts")
            .is_empty()
    );
}

#[test]
fn cursor_gaps_and_malformed_responses_do_not_advance_the_cursor() {
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
    assert!(matches!(gap.status, SyncStatus::Retrying { .. }));
    assert_eq!(reader.cursor(), 0);

    reader.transport.script_pull_fault(PullFault::WrongProtocol);
    reader.advance_past(&gap);
    let malformed = reader.cycle();
    assert!(matches!(malformed.status, SyncStatus::Retrying { .. }));
    assert_eq!(reader.cursor(), 0);

    reader.advance_past(&malformed);
    assert_eq!(reader.cycle().status, SyncStatus::UpToDate);
    assert_eq!(reader.cursor(), 2);
    assert_eq!(reader.note_titles(), ["One", "Two"]);
}

#[test]
fn semantic_conflicts_stay_durable_while_later_operations_proceed() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let foreign = FakeTransport::new(&server, "device-c");
    let request = SyncPushRequest::v1(
        "device-c",
        vec![
            ClientSyncOperation {
                operation_id: "op-conflict".into(),
                client_sequence: 1,
                base_server_sequence: 0,
                payload: SyncOperationPayload::Inline {
                    operation: rename_node("missing-note", "Never created", 1),
                },
            },
            ClientSyncOperation {
                operation_id: "op-valid".into(),
                client_sequence: 2,
                base_server_sequence: 0,
                payload: SyncOperationPayload::Inline {
                    operation: create_note("note-c", "Survives conflict", 2),
                },
            },
        ],
    );
    foreign
        .push(WORKSPACE, &request, &SyncCancellation::new())
        .expect("seed foreign operations");

    let mut device = Device::open(&server, "device-a", &clock);
    device.connect("device-a");
    let outcome = device.cycle();

    assert_eq!(outcome.status, SyncStatus::Conflict { open_conflicts: 1 });
    assert_eq!(device.cursor(), 2);
    assert_eq!(device.note_titles(), ["Survives conflict"]);
    let conflicts = device.storage.sync_conflicts().expect("conflicts");
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].operation_id, "op-conflict");
    assert_eq!(conflicts[0].reason_code, "missing_dependency");

    device.apply(vec![create_note("note-later", "Still syncing", 3)]);
    let outcome = device.cycle();
    assert_eq!(outcome.status, SyncStatus::Conflict { open_conflicts: 1 });
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

    let outcome = device.cycle();
    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert_eq!(server.log_len(), 1);
}

#[test]
fn rate_limit_hints_set_a_durable_retry_time() {
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
    assert!(matches!(
        early.status,
        SyncStatus::UpToDate | SyncStatus::Retrying { .. }
    ));

    device.advance_past(&outcome);
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
    assert!(
        device_a
            .storage
            .sync_conflicts()
            .expect("conflicts")
            .is_empty()
    );
    assert!(
        device_b
            .storage
            .sync_conflicts()
            .expect("conflicts")
            .is_empty()
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

    for _ in 0..4 {
        let outcome = writer.cycle();
        writer.advance_past(&outcome);
    }

    assert_eq!(writer.storage.blocked_sync_operations().unwrap().len(), 0);
    assert_eq!(server.operation_ids().len(), 3);
    assert!(
        server.stored_chunks() >= 2,
        "a 1.5 MiB document must occupy more than one canonical chunk"
    );

    let mut reader = Device::open(&server, "device-b", &clock);
    reader.connect("device-b");
    for _ in 0..4 {
        let outcome = reader.cycle();
        reader.advance_past(&outcome);
    }

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
    for _ in 0..3 {
        let outcome = writer.cycle();
        writer.advance_past(&outcome);
    }
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
