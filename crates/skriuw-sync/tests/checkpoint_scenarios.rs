#[allow(dead_code)]
mod support;

use std::sync::Arc;

use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{
    NewSyncConnection, WorkspaceMaintenance, WorkspaceStorage, WorkspaceSyncQueue,
};
use skriuw_sync::{
    BLOCKED_REASON_LOG_TRUNCATED, BLOCKED_REASON_LOG_TRUNCATED_WITHOUT_CHECKPOINT,
    BLOCKED_REASON_REJECTED_CHECKPOINT, CheckpointPublication, CheckpointPublicationConfig,
    CheckpointPublicationState, SyncBackoffConfig, SyncCancellation, SyncClock, SyncCycleConfig,
    SyncCycleOutcome, SyncCycleState, SyncStatus, TransportError, run_checkpoint_publication,
    run_sync_cycle,
};
use support::{
    FakeAssetStore, FakeClock, FakeServer, FakeTransport, PullFault, PushFault, create_note,
    save_document,
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
    checkpoint_config: CheckpointPublicationConfig,
    checkpoint_state: CheckpointPublicationState,
}

impl Device {
    fn open(server: &Arc<FakeServer>, device_id: &str, clock: &Arc<FakeClock>) -> Self {
        Self {
            storage: SqliteWorkspace::open_in_memory().expect("open database"),
            transport: FakeTransport::new(server, device_id),
            assets: FakeAssetStore::new(),
            clock: Arc::clone(clock),
            state: SyncCycleState::new(SyncBackoffConfig {
                base_delay_ms: 1_000,
                max_delay_ms: 60_000,
                jitter_seed: 7,
            }),
            cancellation: SyncCancellation::new(),
            config: SyncCycleConfig::default(),
            checkpoint_config: CheckpointPublicationConfig::default(),
            checkpoint_state: CheckpointPublicationState::new(),
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

    fn publish_checkpoints(&mut self) -> Option<SyncCycleOutcome> {
        run_checkpoint_publication(
            &CheckpointPublication {
                queue: &self.storage,
                workspace: &self.storage,
                transport: self.transport.as_ref(),
                clock: self.clock.as_ref(),
                cancellation: &self.cancellation,
                cycle_config: &self.config,
                config: &self.checkpoint_config,
            },
            &mut self.state.backoff,
            &mut self.checkpoint_state,
        )
    }

    /// One coordinator wake: the cycle followed by due checkpoint
    /// publication, repeated while the outcome asks to run again at once.
    fn settle(&mut self) -> SyncCycleOutcome {
        for _ in 0..12 {
            let outcome = self.cycle();
            match outcome.status {
                SyncStatus::Pending | SyncStatus::Rehydrating => {}
                SyncStatus::UpToDate => {
                    assert_eq!(self.publish_checkpoints(), None);
                    return outcome;
                }
                _ => return outcome,
            }
        }
        panic!("sync did not settle within the cycle budget");
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
}

fn blocked_reason(status: &SyncStatus) -> Option<&str> {
    match status {
        SyncStatus::Blocked { reason, .. } => Some(reason.as_str()),
        _ => None,
    }
}

fn seed_publisher(server: &Arc<FakeServer>, clock: &Arc<FakeClock>, notes: usize) -> Device {
    let mut publisher = Device::open(server, "device-a", clock);
    publisher.connect("device-a");
    for index in 1..=notes {
        publisher.apply(vec![create_note(
            &format!("note-{index}"),
            &format!("Note {index}"),
            1,
        )]);
    }
    assert_eq!(publisher.cycle().status, SyncStatus::UpToDate);
    assert_eq!(publisher.publish_checkpoints(), None);
    publisher
}

#[test]
fn new_device_hydrates_from_the_latest_checkpoint_and_pulls_only_the_tail() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut publisher = seed_publisher(&server, &clock, 3);
    assert_eq!(server.latest_checkpoint_sequence(), Some(3));
    assert_eq!(server.acknowledged_sequence("device-a"), Some(3));

    publisher.apply(vec![create_note("note-4", "Note 4", 1)]);
    assert_eq!(publisher.cycle().status, SyncStatus::UpToDate);

    let mut fresh = Device::open(&server, "device-b", &clock);
    fresh.connect("device-b");
    let outcome = fresh.cycle();

    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert!(
        outcome.changes.full,
        "a hydration demands a full renderer reload"
    );
    assert_eq!(fresh.cursor(), 4);
    assert_eq!(fresh.note_titles(), publisher.note_titles());
    assert_eq!(fresh.transport.checkpoint_fetch_calls(), 1);
    assert_eq!(
        fresh.transport.pull_calls(),
        1,
        "only the tail after the checkpoint should be replayed"
    );
    assert_eq!(server.acknowledged_sequence("device-b"), Some(4));
}

#[test]
fn hydration_is_refused_while_local_work_is_pending() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let publisher = seed_publisher(&server, &clock, 2);
    assert_eq!(server.latest_checkpoint_sequence(), Some(2));

    let mut existing = Device::open(&server, "device-b", &clock);
    existing.apply(vec![create_note("local-note", "Kept local note", 1)]);
    existing.connect("device-b");
    let outcome = existing.cycle();

    assert_eq!(outcome.status, SyncStatus::UpToDate);
    assert_eq!(
        existing.transport.checkpoint_fetch_calls(),
        0,
        "a device with pending local operations must not consult checkpoints"
    );
    assert!(
        existing
            .note_titles()
            .contains(&"Kept local note".to_string()),
        "hydration must never discard local work"
    );
    assert_eq!(server.log_len(), 3);
    drop(publisher);
}

#[test]
fn publication_waits_for_the_operation_interval_after_the_first_checkpoint() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut publisher = Device::open(&server, "device-a", &clock);
    publisher.checkpoint_config = CheckpointPublicationConfig {
        publish_interval_operations: 4,
    };
    publisher.connect("device-a");

    publisher.apply(vec![create_note("note-1", "Note 1", 1)]);
    assert_eq!(publisher.cycle().status, SyncStatus::UpToDate);
    assert_eq!(publisher.publish_checkpoints(), None);
    assert_eq!(server.latest_checkpoint_sequence(), Some(1));
    assert_eq!(publisher.transport.checkpoint_publish_calls(), 1);

    for index in 2..=4 {
        publisher.apply(vec![create_note(
            &format!("note-{index}"),
            &format!("Note {index}"),
            1,
        )]);
    }
    assert_eq!(publisher.cycle().status, SyncStatus::UpToDate);
    assert_eq!(publisher.publish_checkpoints(), None);
    assert_eq!(
        server.latest_checkpoint_sequence(),
        Some(1),
        "three operations past the checkpoint stay below the interval"
    );
    assert_eq!(publisher.transport.checkpoint_publish_calls(), 1);

    publisher.apply(vec![create_note("note-5", "Note 5", 1)]);
    assert_eq!(publisher.cycle().status, SyncStatus::UpToDate);
    assert_eq!(publisher.publish_checkpoints(), None);
    assert_eq!(server.latest_checkpoint_sequence(), Some(5));
    assert_eq!(publisher.transport.checkpoint_publish_calls(), 2);
}

#[test]
fn publish_failure_surfaces_without_breaking_later_cycles() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut publisher = Device::open(&server, "device-a", &clock);
    publisher.connect("device-a");
    publisher.apply(vec![create_note("note-1", "Note 1", 1)]);
    assert_eq!(publisher.cycle().status, SyncStatus::UpToDate);

    publisher
        .transport
        .script_checkpoint_publish_fault(TransportError::Transient("network unreachable".into()));
    let failure = publisher.publish_checkpoints().expect("failure surfaces");
    assert!(
        matches!(failure.status, SyncStatus::Retrying { .. }),
        "unexpected status: {:?}",
        failure.status
    );
    assert!(failure.retry_at_ms.is_some());
    assert_eq!(server.latest_checkpoint_sequence(), None);

    publisher.apply(vec![create_note("note-2", "Note 2", 1)]);
    assert_eq!(publisher.cycle().status, SyncStatus::UpToDate);
    assert_eq!(publisher.publish_checkpoints(), None);
    assert_eq!(server.latest_checkpoint_sequence(), Some(2));
}

#[test]
fn hydration_failure_from_missing_checkpoint_content_stays_visible() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let _publisher = seed_publisher(&server, &clock, 2);
    server.discard_checkpoint_chunks();

    let mut fresh = Device::open(&server, "device-b", &clock);
    fresh.connect("device-b");
    let outcome = fresh.cycle();

    assert_eq!(
        blocked_reason(&outcome.status),
        Some(BLOCKED_REASON_REJECTED_CHECKPOINT)
    );
    assert!(matches!(
        &outcome.status,
        SyncStatus::Blocked { detail: Some(detail), .. } if !detail.is_empty()
    ));
    assert!(outcome.retry_at_ms.is_some());
    assert_eq!(
        fresh.cursor(),
        0,
        "a failed hydration must not move the cursor"
    );
    assert!(fresh.note_titles().is_empty());
}

#[test]
fn checkpoint_fetch_failure_during_publication_retries() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut publisher = Device::open(&server, "device-a", &clock);
    publisher.connect("device-a");
    publisher.apply(vec![create_note("note-1", "Note 1", 1)]);
    assert_eq!(publisher.cycle().status, SyncStatus::UpToDate);

    publisher
        .transport
        .script_checkpoint_fetch_fault(TransportError::Server {
            retry_after_ms: Some(2_000),
        });
    let failure = publisher.publish_checkpoints().expect("failure surfaces");
    assert!(matches!(failure.status, SyncStatus::Retrying { .. }));

    assert_eq!(publisher.publish_checkpoints(), None);
    assert_eq!(server.latest_checkpoint_sequence(), Some(1));
}

#[test]
fn export_maintenance_stays_available_to_the_publisher() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let publisher = seed_publisher(&server, &clock, 1);
    publisher
        .storage
        .export_archive(clock.now_ms())
        .expect("export still available after publication");
}

/// A device that stayed offline past the compaction horizon: its cursor sits
/// below the floor, so the log can no longer be replayed. It rebuilds from
/// the latest checkpoint, keeps the writes it made before going offline, and
/// re-applies its own acknowledged-but-never-echoed writes above the
/// checkpoint as ordinary remote operations.
#[test]
fn a_device_offline_beyond_the_compaction_horizon_rehydrates_from_the_checkpoint() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut publisher = seed_publisher(&server, &clock, 2);
    publisher.checkpoint_config = CheckpointPublicationConfig {
        publish_interval_operations: 2,
    };

    let mut stale = Device::open(&server, "device-b", &clock);
    stale.connect("device-b");
    assert_eq!(stale.settle().status, SyncStatus::UpToDate);
    assert_eq!(stale.cursor(), 2);

    stale.apply(vec![create_note(
        "note-b",
        "Written on the stale device",
        2,
    )]);
    stale.apply(vec![save_document(
        "note-1",
        stale.revision("note-1"),
        "Edited on B",
        3,
    )]);
    assert_eq!(stale.settle().status, SyncStatus::UpToDate);
    assert_eq!(stale.cursor(), 4);
    assert_eq!(publisher.settle().status, SyncStatus::UpToDate);
    assert_eq!(server.latest_checkpoint_sequence(), Some(4));

    publisher.apply(vec![create_note("note-5", "Note 5", 5)]);
    publisher.apply(vec![create_note("note-6", "Note 6", 6)]);
    assert_eq!(publisher.settle().status, SyncStatus::UpToDate);
    assert_eq!(server.latest_checkpoint_sequence(), Some(6));

    // The stale device pushes one more write above the checkpoint whose echo
    // it never receives, then the service retires the log below the
    // checkpoint while the device sits at cursor 4.
    stale.apply(vec![create_note("note-b-2", "Pushed but never echoed", 7)]);
    stale.transport.script_pull_fault(PullFault::Transient);
    assert!(matches!(stale.cycle().status, SyncStatus::Retrying { .. }));
    assert_eq!(server.log_len(), 7);
    assert_eq!(stale.cursor(), 4);
    server.compact_through(6);

    let truncated = stale.cycle();
    assert_eq!(
        truncated.status,
        SyncStatus::Rehydrating,
        "a truncated log with an empty outbox asks for a rebuild"
    );
    assert_eq!(truncated.retry_at_ms, Some(clock.now_ms()));
    assert_eq!(stale.cursor(), 4, "nothing moved before the rebuild");

    let rebuilt = stale.cycle();
    assert_eq!(rebuilt.status, SyncStatus::UpToDate, "{:?}", rebuilt.status);
    assert!(rebuilt.changes.full);
    assert_eq!(stale.cursor(), 7, "the cursor reaches the latest sequence");
    assert_eq!(stale.markdown("note-1"), "Edited on B");
    assert!(
        stale
            .note_titles()
            .contains(&"Written on the stale device".to_string()),
        "own writes inside the checkpoint survive the rebuild"
    );
    assert!(
        stale
            .note_titles()
            .contains(&"Pushed but never echoed".to_string()),
        "own writes above the checkpoint reappear through the ordered tail"
    );
    assert_eq!(
        stale
            .storage
            .sync_connection()
            .expect("connection")
            .expect("active")
            .rehydrated_through,
        6
    );

    stale.apply(vec![create_note("note-after", "After the rebuild", 8)]);
    assert_eq!(stale.settle().status, SyncStatus::UpToDate);
    assert_eq!(publisher.settle().status, SyncStatus::UpToDate);
    assert_eq!(publisher.note_titles(), stale.note_titles());
}

#[test]
fn rehydration_is_refused_while_local_work_is_waiting_and_blocked_without_a_checkpoint() {
    let clock = FakeClock::at(1_000);
    let server = FakeServer::new(WORKSPACE);
    let mut publisher = Device::open(&server, "device-a", &clock);
    publisher.connect("device-a");
    publisher.apply(vec![create_note("note-1", "Note 1", 1)]);
    assert_eq!(publisher.cycle().status, SyncStatus::UpToDate);

    let mut stale = Device::open(&server, "device-b", &clock);
    stale.connect("device-b");
    assert_eq!(stale.cycle().status, SyncStatus::UpToDate);

    publisher.apply(vec![create_note("note-2", "Note 2", 2)]);
    assert_eq!(publisher.cycle().status, SyncStatus::UpToDate);
    server.compact_through(2);

    stale.apply(vec![create_note("note-b", "Unsent", 3)]);
    stale.transport.script_push_fault(PushFault::Transient);
    let blocked = stale.cycle();
    assert_eq!(
        blocked_reason(&blocked.status),
        Some(BLOCKED_REASON_LOG_TRUNCATED)
    );
    assert_eq!(stale.cursor(), 1);

    clock.advance(blocked.retry_at_ms.expect("retry") - clock.now_ms() + 1);
    assert_eq!(stale.cycle().status, SyncStatus::Rehydrating);
    let without_checkpoint = stale.cycle();
    assert_eq!(
        blocked_reason(&without_checkpoint.status),
        Some(BLOCKED_REASON_LOG_TRUNCATED_WITHOUT_CHECKPOINT)
    );
    assert_eq!(stale.cursor(), 1);
    assert_eq!(stale.note_titles(), ["Note 1", "Unsent"]);
}
