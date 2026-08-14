#[allow(dead_code)]
mod support;

use std::sync::Arc;

use skriuw_domain::{ClientSyncOperation, SyncOperationPayload, SyncPushRequest};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{NewSyncConnection, SyncRecovery, WorkspaceStorage, WorkspaceSyncQueue};
use skriuw_sync::{
    SyncBackoff, SyncBackoffConfig, SyncCancellation, SyncClock, SyncCycleConfig, SyncCycleOutcome,
    SyncStatus, SyncTransport, run_sync_cycle,
};
use support::{
    FakeAssetStore, FakeClock, FakeServer, FakeTransport, PullFault, PushFault, attach_image,
    create_note, rename_node, save_document, save_large_document,
};

const WORKSPACE: &str = "workspace-1";

struct Device {
    storage: SqliteWorkspace,
    transport: Arc<FakeTransport>,
    assets: Arc<FakeAssetStore>,
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
    let first_pull = reader.cycle();
    assert_eq!(first_pull.status, SyncStatus::UpToDate);
    assert!(first_pull.workspace_changed);
    assert_eq!(reader.cursor(), 1);

    writer.apply(vec![create_note("note-2", "Second", 2)]);
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);

    reader.transport.script_pull_fault(PullFault::Overlap);
    let outcome = reader.cycle();

    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert!(outcome.workspace_changed);
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
                    "Survives conflict",
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
fn concurrent_document_edits_preserve_both_versions_and_resolve() {
    let directory = tempfile::tempdir().expect("temp directory");
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);

    let mut device_a = Device::with_storage(
        SqliteWorkspace::open(directory.path().join("device-a.db")).expect("open device a"),
        &server,
        "device-a",
        &clock,
    );
    device_a.connect("device-a");
    device_a.apply(vec![create_note("note-shared", "Shared", 1)]);
    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);

    let mut device_b = Device::with_storage(
        SqliteWorkspace::open(directory.path().join("device-b.db")).expect("open device b"),
        &server,
        "device-b",
        &clock,
    );
    device_b.connect("device-b");
    assert_eq!(device_b.cycle().status, SyncStatus::UpToDate);

    let base_revision = device_b.storage.bootstrap().expect("bootstrap b").documents[0].revision;

    device_a.apply(vec![save_document(
        "note-shared",
        base_revision,
        "Edited on device A",
        2,
    )]);
    device_b.apply(vec![save_document(
        "note-shared",
        base_revision,
        "Edited on device B",
        2,
    )]);

    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);
    let outcome_b = device_b.cycle();
    assert_eq!(outcome_b.status, SyncStatus::Conflict { open_conflicts: 1 });

    let conflicts_b = device_b.storage.document_conflicts().expect("conflicts b");
    assert_eq!(conflicts_b.len(), 1);
    assert_eq!(conflicts_b[0].note_id, "note-shared");
    let versions = device_b
        .storage
        .document_conflict_versions(&conflicts_b[0].conflict_id)
        .expect("versions b");
    assert_eq!(versions.remote.markdown, "Edited on device A");
    assert_eq!(
        versions.local.expect("local version").markdown,
        "Edited on device B",
    );

    let acknowledgement = device_b
        .storage
        .resolve_document_conflict(&skriuw_domain::ResolveDocumentConflict {
            conflict_id: conflicts_b[0].conflict_id.clone(),
            choice: skriuw_domain::DocumentConflictResolutionChoice::KeepRemote,
            at: 3,
        })
        .expect("resolve on b");
    assert!(acknowledgement.is_some());

    assert_eq!(device_b.cycle().status, SyncStatus::UpToDate);

    let outcome_a = device_a.cycle();
    assert_eq!(outcome_a.status, SyncStatus::Conflict { open_conflicts: 1 });
    let conflicts_a = device_a.storage.document_conflicts().expect("conflicts a");
    assert_eq!(conflicts_a.len(), 1);
    let versions_a = device_a
        .storage
        .document_conflict_versions(&conflicts_a[0].conflict_id)
        .expect("versions a");
    assert_eq!(versions_a.remote.markdown, "Edited on device B");

    device_a
        .storage
        .resolve_document_conflict(&skriuw_domain::ResolveDocumentConflict {
            conflict_id: conflicts_a[0].conflict_id.clone(),
            choice: skriuw_domain::DocumentConflictResolutionChoice::KeepLocal,
            at: 4,
        })
        .expect("resolve on a");

    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);
    assert_eq!(device_b.cycle().status, SyncStatus::UpToDate);
    assert_eq!(device_a.cycle().status, SyncStatus::UpToDate);

    let markdown_a = device_a.storage.bootstrap().expect("bootstrap a").documents[0]
        .markdown
        .clone();
    let markdown_b = device_b.storage.bootstrap().expect("bootstrap b").documents[0]
        .markdown
        .clone();
    assert_eq!(markdown_a, "Edited on device A");
    assert_eq!(markdown_a, markdown_b);
    assert!(
        device_a
            .storage
            .sync_conflicts()
            .expect("open a")
            .is_empty()
    );
    assert!(
        device_b
            .storage
            .sync_conflicts()
            .expect("open b")
            .is_empty()
    );
    assert_eq!(
        device_a
            .storage
            .document_conflicts()
            .expect("records a")
            .len(),
        1
    );
    assert_eq!(
        device_b
            .storage
            .document_conflicts()
            .expect("records b")
            .len(),
        1
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
    assert_eq!(reader.cycle().status, SyncStatus::UpToDate);

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
    assert!(
        reader
            .storage
            .sync_conflicts()
            .expect("conflicts")
            .is_empty()
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

    assert_eq!(outcome.status, SyncStatus::UpToDate);
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
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);
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
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);
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
    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);
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

    assert_eq!(writer.cycle().status, SyncStatus::UpToDate);
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
