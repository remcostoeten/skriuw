use std::{
    mem,
    sync::{
        Arc, Mutex,
        mpsc::{self, Receiver, Sender, TryRecvError},
    },
    thread::{self, JoinHandle},
};

use skriuw_domain::{OperationAck, SearchHit, WorkspaceOperationEnvelope, WorkspaceSnapshot};
use skriuw_storage::{StorageError, WorkspaceStorage};
use thiserror::Error;

const MAX_SAVE_BATCH_REQUESTS: usize = 64;

#[derive(Debug, Error)]
pub enum RuntimeError {
    #[error("storage runtime is unavailable")]
    Unavailable,
    #[error("storage worker terminated abnormally")]
    WorkerFailure,
    #[error(transparent)]
    Storage(#[from] StorageError),
}

pub struct Completion<T> {
    receiver: Receiver<Result<T, StorageError>>,
}

impl<T> Completion<T> {
    pub fn wait(self) -> Result<T, RuntimeError> {
        self.receiver
            .recv()
            .map_err(|_| RuntimeError::Unavailable)?
            .map_err(RuntimeError::Storage)
    }
}

#[derive(Clone)]
pub struct WorkspaceRuntime {
    shared: Arc<RuntimeShared>,
}

impl WorkspaceRuntime {
    #[must_use]
    pub fn spawn(storage: impl WorkspaceStorage + 'static) -> Self {
        let (sender, receiver) = mpsc::channel();
        let worker = thread::Builder::new()
            .name("skriuw-storage".into())
            .spawn(move || run(storage, receiver))
            .expect("storage runtime thread must start");
        Self {
            shared: Arc::new(RuntimeShared {
                sender: Mutex::new(Some(sender)),
                worker: Mutex::new(WorkerState::Running(worker)),
            }),
        }
    }

    pub fn bootstrap(&self) -> Result<Completion<WorkspaceSnapshot>, RuntimeError> {
        let (sender, receiver) = mpsc::channel();
        self.shared.submit(Request::Bootstrap { sender })?;
        Ok(Completion { receiver })
    }

    pub fn apply_operations(
        &self,
        operations: Vec<WorkspaceOperationEnvelope>,
    ) -> Result<Completion<OperationAck>, RuntimeError> {
        let (sender, receiver) = mpsc::channel();
        self.shared.submit(Request::Apply { operations, sender })?;
        Ok(Completion { receiver })
    }

    pub fn search(
        &self,
        query: impl Into<String>,
        limit: usize,
    ) -> Result<Completion<Vec<SearchHit>>, RuntimeError> {
        let (sender, receiver) = mpsc::channel();
        self.shared.submit(Request::Search {
            query: query.into(),
            limit,
            sender,
        })?;
        Ok(Completion { receiver })
    }

    pub fn shutdown(&self) -> Result<(), RuntimeError> {
        self.shared.stop_accepting();
        self.shared.join_worker()
    }
}

struct RuntimeShared {
    sender: Mutex<Option<Sender<Request>>>,
    worker: Mutex<WorkerState>,
}

enum WorkerState {
    Running(JoinHandle<()>),
    Succeeded,
    Failed,
}

impl RuntimeShared {
    fn submit(&self, request: Request) -> Result<(), RuntimeError> {
        let sender = self.sender.lock().map_err(|_| RuntimeError::Unavailable)?;
        sender
            .as_ref()
            .ok_or(RuntimeError::Unavailable)?
            .send(request)
            .map_err(|_| RuntimeError::Unavailable)
    }

    fn stop_accepting(&self) {
        if let Ok(mut sender) = self.sender.lock() {
            sender.take();
        }
    }

    fn join_worker(&self) -> Result<(), RuntimeError> {
        let mut worker = self
            .worker
            .lock()
            .map_err(|_| RuntimeError::WorkerFailure)?;
        *worker = match mem::replace(&mut *worker, WorkerState::Failed) {
            WorkerState::Running(handle) => {
                if handle.join().is_ok() {
                    WorkerState::Succeeded
                } else {
                    WorkerState::Failed
                }
            }
            finished => finished,
        };
        match *worker {
            WorkerState::Succeeded => Ok(()),
            WorkerState::Running(_) | WorkerState::Failed => Err(RuntimeError::WorkerFailure),
        }
    }
}

impl Drop for RuntimeShared {
    fn drop(&mut self) {
        if let Ok(sender) = self.sender.get_mut() {
            sender.take();
        }
        if let Ok(worker) = self.worker.get_mut()
            && let WorkerState::Running(handle) = mem::replace(worker, WorkerState::Failed)
        {
            let _ = handle.join();
        }
    }
}

enum Request {
    Bootstrap {
        sender: Sender<Result<WorkspaceSnapshot, StorageError>>,
    },
    Apply {
        operations: Vec<WorkspaceOperationEnvelope>,
        sender: Sender<Result<OperationAck, StorageError>>,
    },
    Search {
        query: String,
        limit: usize,
        sender: Sender<Result<Vec<SearchHit>, StorageError>>,
    },
}

fn run(storage: impl WorkspaceStorage, receiver: Receiver<Request>) {
    let mut pending = None;
    loop {
        let request = match pending.take() {
            Some(request) => request,
            None => match receiver.recv() {
                Ok(request) => request,
                Err(_) => break,
            },
        };
        match request {
            Request::Bootstrap { sender } => {
                let _ = sender.send(storage.bootstrap());
            }
            Request::Apply { operations, sender } if is_save_only(&operations) => {
                let mut batches = vec![operations];
                let mut senders = vec![sender];
                while batches.len() < MAX_SAVE_BATCH_REQUESTS {
                    match receiver.try_recv() {
                        Ok(Request::Apply { operations, sender }) if is_save_only(&operations) => {
                            batches.push(operations);
                            senders.push(sender);
                        }
                        Ok(request) => {
                            pending = Some(request);
                            break;
                        }
                        Err(TryRecvError::Empty | TryRecvError::Disconnected) => break,
                    }
                }
                send_batch_results(storage.apply_operation_batches(&batches), senders);
            }
            Request::Apply { operations, sender } => {
                let _ = sender.send(storage.apply_operations(&operations));
            }
            Request::Search {
                query,
                limit,
                sender,
            } => {
                let _ = sender.send(storage.search(&query, limit));
            }
        }
    }
}

fn is_save_only(operations: &[WorkspaceOperationEnvelope]) -> bool {
    !operations.is_empty()
        && operations.iter().all(|envelope| {
            matches!(
                envelope.operation,
                skriuw_domain::WorkspaceOperation::SaveDocument { .. }
            )
        })
}

fn send_batch_results(
    results: Result<Vec<Result<OperationAck, StorageError>>, StorageError>,
    senders: Vec<Sender<Result<OperationAck, StorageError>>>,
) {
    match results {
        Ok(results) if results.len() == senders.len() => {
            for (sender, result) in senders.into_iter().zip(results) {
                let _ = sender.send(result);
            }
        }
        Ok(_) => {
            let error = StorageError::Backend(
                "storage adapter returned the wrong number of batch results".into(),
            );
            for sender in senders {
                let _ = sender.send(Err(error.clone()));
            }
        }
        Err(error) => {
            for sender in senders {
                let _ = sender.send(Err(error.clone()));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{
            Arc, Barrier, Mutex,
            atomic::{AtomicBool, AtomicUsize, Ordering},
            mpsc::{self, Receiver, Sender},
        },
        thread,
        time::Duration,
    };

    use serde_json::json;
    use skriuw_domain::{
        EntityRevision, NodePlacement, OperationAck, SearchHit, WorkspaceOperation,
        WorkspaceOperationEnvelope, WorkspaceSnapshot,
    };
    use skriuw_sqlite::SqliteWorkspace;
    use skriuw_storage::{StorageError, WorkspaceStorage};

    use super::{RuntimeError, WorkspaceRuntime};

    fn op(operation: WorkspaceOperation) -> WorkspaceOperationEnvelope {
        WorkspaceOperationEnvelope::v1(operation)
    }

    fn create_note(id: &str, title: &str) -> WorkspaceOperationEnvelope {
        op(WorkspaceOperation::CreateNote {
            id: id.into(),
            title: title.into(),
            placement: NodePlacement::last(None),
            document_json: json!({"type": "doc", "content": []}),
            markdown: title.into(),
            at: 1,
        })
    }

    fn save_document(note_id: &str, expected_revision: i64) -> WorkspaceOperationEnvelope {
        op(WorkspaceOperation::SaveDocument {
            note_id: note_id.into(),
            document_json: json!({"type": "doc", "revision": expected_revision + 1}),
            markdown: format!("revision {}", expected_revision + 1),
            word_count: 2,
            expected_revision,
            at: expected_revision + 1,
        })
    }

    fn sqlite_runtime() -> WorkspaceRuntime {
        WorkspaceRuntime::spawn(SqliteWorkspace::open_in_memory().expect("open database"))
    }

    #[test]
    fn preserves_fifo_request_order() {
        let runtime = sqlite_runtime();
        let create = runtime
            .apply_operations(vec![create_note("note-1", "Original")])
            .expect("submit create");
        let rename = runtime
            .apply_operations(vec![op(WorkspaceOperation::RenameNode {
                id: "note-1".into(),
                title: "Renamed".into(),
                at: 2,
            })])
            .expect("submit rename");

        rename.wait().expect("rename after create");
        create.wait().expect("create note");
        let snapshot = runtime
            .bootstrap()
            .expect("submit bootstrap")
            .wait()
            .expect("bootstrap");

        assert_eq!(snapshot.nodes[0].title, "Renamed");
    }

    #[test]
    fn continues_after_failed_request() {
        let runtime = sqlite_runtime();
        runtime
            .apply_operations(vec![op(WorkspaceOperation::RenameNode {
                id: "missing".into(),
                title: "Nope".into(),
                at: 1,
            })])
            .expect("submit invalid rename")
            .wait()
            .expect_err("missing note");

        runtime
            .apply_operations(vec![create_note("note-1", "Recovered")])
            .expect("submit create")
            .wait()
            .expect("create after failure");
        let snapshot = runtime
            .bootstrap()
            .expect("submit bootstrap")
            .wait()
            .expect("bootstrap");

        assert_eq!(snapshot.nodes[0].title, "Recovered");
    }

    #[test]
    fn serializes_concurrent_callers() {
        let active = Arc::new(AtomicUsize::new(0));
        let maximum = Arc::new(AtomicUsize::new(0));
        let calls = Arc::new(Mutex::new(Vec::new()));
        let runtime = WorkspaceRuntime::spawn(ProbeStorage {
            active: Arc::clone(&active),
            maximum: Arc::clone(&maximum),
            calls: Arc::clone(&calls),
        });
        let barrier = Arc::new(Barrier::new(9));
        let mut threads = Vec::new();

        for index in 0..8 {
            let runtime = runtime.clone();
            let barrier = Arc::clone(&barrier);
            threads.push(thread::spawn(move || {
                barrier.wait();
                runtime
                    .search(index.to_string(), 1)
                    .expect("submit search")
                    .wait()
                    .expect("search");
            }));
        }

        barrier.wait();
        for thread in threads {
            thread.join().expect("caller thread");
        }

        assert_eq!(maximum.load(Ordering::SeqCst), 1);
        assert_eq!(calls.lock().expect("calls lock").len(), 8);
    }

    #[test]
    fn drains_accepted_requests_before_shutdown_returns() {
        let (started, started_signals) = mpsc::channel();
        let (permits, permit_signals) = mpsc::channel();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let runtime = WorkspaceRuntime::spawn(GateStorage {
            started,
            permits: Mutex::new(permit_signals),
            calls: Arc::clone(&calls),
        });

        let first = runtime.search("first", 1).expect("submit first");
        started_signals.recv().expect("first started");
        let second = runtime.search("second", 1).expect("submit second");
        let third = runtime.search("third", 1).expect("submit third");

        let shutdown = {
            let runtime = runtime.clone();
            thread::spawn(move || runtime.shutdown())
        };
        for _ in 0..3 {
            permits.send(()).expect("send permit");
        }

        shutdown
            .join()
            .expect("shutdown thread")
            .expect("shutdown drains queue");
        first.wait().expect("first completion");
        second.wait().expect("second completion");
        third.wait().expect("third completion");
        assert_eq!(
            *calls.lock().expect("calls lock"),
            vec![
                "first".to_string(),
                "second".to_string(),
                "third".to_string()
            ]
        );
        assert!(matches!(
            runtime.search("late", 1),
            Err(RuntimeError::Unavailable)
        ));
    }

    #[test]
    fn rejects_new_submissions_after_shutdown() {
        let runtime = sqlite_runtime();
        runtime.shutdown().expect("shutdown");

        assert!(matches!(
            runtime.apply_operations(vec![create_note("note-1", "Rejected")]),
            Err(RuntimeError::Unavailable)
        ));
        assert!(matches!(
            runtime.bootstrap(),
            Err(RuntimeError::Unavailable)
        ));
        assert!(matches!(
            runtime.search("query", 1),
            Err(RuntimeError::Unavailable)
        ));
    }

    #[test]
    fn clones_share_shutdown_state() {
        let runtime = sqlite_runtime();
        let clone = runtime.clone();

        clone.shutdown().expect("shutdown through clone");

        assert!(matches!(
            runtime.search("query", 1),
            Err(RuntimeError::Unavailable)
        ));
        runtime.shutdown().expect("repeated shutdown on original");
        clone.shutdown().expect("repeated shutdown on clone");
    }

    #[test]
    fn concurrent_shutdowns_join_worker_once() {
        let (started, started_signals) = mpsc::channel();
        let (permits, permit_signals) = mpsc::channel();
        let runtime = WorkspaceRuntime::spawn(GateStorage {
            started,
            permits: Mutex::new(permit_signals),
            calls: Arc::new(Mutex::new(Vec::new())),
        });

        let pending = runtime.search("busy", 1).expect("submit busy search");
        started_signals.recv().expect("busy search started");

        let mut shutdowns = Vec::new();
        for _ in 0..4 {
            let runtime = runtime.clone();
            shutdowns.push(thread::spawn(move || runtime.shutdown()));
        }
        permits.send(()).expect("send permit");

        for shutdown in shutdowns {
            shutdown
                .join()
                .expect("shutdown thread")
                .expect("concurrent shutdown");
        }
        pending.wait().expect("pending completion resolves");
    }

    #[test]
    fn final_drop_joins_worker() {
        let dropped = Arc::new(AtomicBool::new(false));
        let runtime = WorkspaceRuntime::spawn(DropProbeStorage {
            dropped: Arc::clone(&dropped),
        });
        let clone = runtime.clone();

        drop(runtime);
        assert!(!dropped.load(Ordering::SeqCst));

        drop(clone);
        assert!(dropped.load(Ordering::SeqCst));
    }

    #[test]
    fn surfaces_worker_panic_as_runtime_error() {
        let runtime = WorkspaceRuntime::spawn(PanickingStorage);

        let completion = runtime.search("boom", 1).expect("submit search");
        assert!(matches!(completion.wait(), Err(RuntimeError::Unavailable)));
        assert!(matches!(
            runtime.shutdown(),
            Err(RuntimeError::WorkerFailure)
        ));
        assert!(matches!(
            runtime.shutdown(),
            Err(RuntimeError::WorkerFailure)
        ));
    }

    #[test]
    fn batches_queued_saves_and_drains_them_during_shutdown() {
        let (started, started_signals) = mpsc::channel();
        let (release, release_signals) = mpsc::channel();
        let batch_sizes = Arc::new(Mutex::new(Vec::new()));
        let events = Arc::new(Mutex::new(Vec::new()));
        let runtime = WorkspaceRuntime::spawn(BatchProbeStorage {
            gate_started: started,
            gate_release: Mutex::new(release_signals),
            batch_sizes: Arc::clone(&batch_sizes),
            events: Arc::clone(&events),
        });
        let gate = runtime.search("gate", 1).expect("submit gate");
        started_signals.recv().expect("gate started");
        let saves = (1..=3)
            .map(|revision| {
                runtime
                    .apply_operations(vec![save_document("note-1", revision)])
                    .expect("submit save")
            })
            .collect::<Vec<_>>();
        let shutdown = {
            let runtime = runtime.clone();
            thread::spawn(move || runtime.shutdown())
        };

        release.send(()).expect("release gate");
        gate.wait().expect("gate completion");
        for (index, save) in saves.into_iter().enumerate() {
            let acknowledgement = save.wait().expect("save completion");
            assert_eq!(
                acknowledgement.revisions[0].revision,
                i64::try_from(index).expect("revision index") + 2
            );
        }
        shutdown.join().expect("shutdown thread").expect("shutdown");

        assert_eq!(*batch_sizes.lock().expect("batch sizes"), [3]);
        assert_eq!(*events.lock().expect("events"), ["search:gate", "batch:3"]);
    }

    #[test]
    fn non_save_request_is_a_fifo_batch_barrier() {
        let (started, started_signals) = mpsc::channel();
        let (release, release_signals) = mpsc::channel();
        let batch_sizes = Arc::new(Mutex::new(Vec::new()));
        let events = Arc::new(Mutex::new(Vec::new()));
        let runtime = WorkspaceRuntime::spawn(BatchProbeStorage {
            gate_started: started,
            gate_release: Mutex::new(release_signals),
            batch_sizes: Arc::clone(&batch_sizes),
            events: Arc::clone(&events),
        });
        let gate = runtime.search("gate", 1).expect("submit gate");
        started_signals.recv().expect("gate started");
        let first = runtime
            .apply_operations(vec![save_document("note-1", 1)])
            .expect("submit first save");
        let barrier = runtime.search("barrier", 1).expect("submit barrier");
        let second = runtime
            .apply_operations(vec![save_document("note-1", 2)])
            .expect("submit second save");

        release.send(()).expect("release gate");
        gate.wait().expect("gate completion");
        first.wait().expect("first save");
        barrier.wait().expect("barrier search");
        second.wait().expect("second save");
        runtime.shutdown().expect("shutdown");

        assert_eq!(*batch_sizes.lock().expect("batch sizes"), [1, 1]);
        assert_eq!(
            *events.lock().expect("events"),
            ["search:gate", "batch:1", "search:barrier", "batch:1"]
        );
    }

    #[test]
    fn caps_each_save_batch_without_reordering_completions() {
        let (started, started_signals) = mpsc::channel();
        let (release, release_signals) = mpsc::channel();
        let batch_sizes = Arc::new(Mutex::new(Vec::new()));
        let events = Arc::new(Mutex::new(Vec::new()));
        let runtime = WorkspaceRuntime::spawn(BatchProbeStorage {
            gate_started: started,
            gate_release: Mutex::new(release_signals),
            batch_sizes: Arc::clone(&batch_sizes),
            events,
        });
        let gate = runtime.search("gate", 1).expect("submit gate");
        started_signals.recv().expect("gate started");
        let saves = (1..=70)
            .map(|revision| {
                runtime
                    .apply_operations(vec![save_document("note-1", revision)])
                    .expect("submit save")
            })
            .collect::<Vec<_>>();

        release.send(()).expect("release gate");
        gate.wait().expect("gate completion");
        for (index, save) in saves.into_iter().enumerate() {
            assert_eq!(
                save.wait().expect("save completion").revisions[0].revision,
                i64::try_from(index).expect("revision index") + 2
            );
        }
        runtime.shutdown().expect("shutdown");

        assert_eq!(*batch_sizes.lock().expect("batch sizes"), [64, 6]);
    }

    struct ProbeStorage {
        active: Arc<AtomicUsize>,
        maximum: Arc<AtomicUsize>,
        calls: Arc<Mutex<Vec<String>>>,
    }

    impl WorkspaceStorage for ProbeStorage {
        fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError> {
            unreachable!()
        }

        fn apply_operations(
            &self,
            _operations: &[WorkspaceOperationEnvelope],
        ) -> Result<OperationAck, StorageError> {
            unreachable!()
        }

        fn search(&self, query: &str, _limit: usize) -> Result<Vec<SearchHit>, StorageError> {
            let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
            self.maximum.fetch_max(active, Ordering::SeqCst);
            thread::sleep(Duration::from_millis(2));
            self.calls.lock().expect("calls lock").push(query.into());
            self.active.fetch_sub(1, Ordering::SeqCst);
            Ok(Vec::new())
        }
    }

    struct GateStorage {
        started: Sender<String>,
        permits: Mutex<Receiver<()>>,
        calls: Arc<Mutex<Vec<String>>>,
    }

    impl WorkspaceStorage for GateStorage {
        fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError> {
            unreachable!()
        }

        fn apply_operations(
            &self,
            _operations: &[WorkspaceOperationEnvelope],
        ) -> Result<OperationAck, StorageError> {
            unreachable!()
        }

        fn search(&self, query: &str, _limit: usize) -> Result<Vec<SearchHit>, StorageError> {
            self.started.send(query.into()).expect("report start");
            self.permits
                .lock()
                .expect("permits lock")
                .recv()
                .expect("receive permit");
            self.calls.lock().expect("calls lock").push(query.into());
            Ok(Vec::new())
        }
    }

    struct DropProbeStorage {
        dropped: Arc<AtomicBool>,
    }

    impl Drop for DropProbeStorage {
        fn drop(&mut self) {
            self.dropped.store(true, Ordering::SeqCst);
        }
    }

    impl WorkspaceStorage for DropProbeStorage {
        fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError> {
            unreachable!()
        }

        fn apply_operations(
            &self,
            _operations: &[WorkspaceOperationEnvelope],
        ) -> Result<OperationAck, StorageError> {
            unreachable!()
        }

        fn search(&self, _query: &str, _limit: usize) -> Result<Vec<SearchHit>, StorageError> {
            unreachable!()
        }
    }

    struct PanickingStorage;

    impl WorkspaceStorage for PanickingStorage {
        fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError> {
            unreachable!()
        }

        fn apply_operations(
            &self,
            _operations: &[WorkspaceOperationEnvelope],
        ) -> Result<OperationAck, StorageError> {
            unreachable!()
        }

        fn search(&self, _query: &str, _limit: usize) -> Result<Vec<SearchHit>, StorageError> {
            panic!("expected storage panic")
        }
    }

    struct BatchProbeStorage {
        gate_started: Sender<()>,
        gate_release: Mutex<Receiver<()>>,
        batch_sizes: Arc<Mutex<Vec<usize>>>,
        events: Arc<Mutex<Vec<String>>>,
    }

    impl WorkspaceStorage for BatchProbeStorage {
        fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError> {
            unreachable!()
        }

        fn apply_operations(
            &self,
            operations: &[WorkspaceOperationEnvelope],
        ) -> Result<OperationAck, StorageError> {
            self.events.lock().expect("events").push("apply".into());
            Ok(save_acknowledgement(operations))
        }

        fn apply_operation_batches(
            &self,
            batches: &[Vec<WorkspaceOperationEnvelope>],
        ) -> Result<Vec<Result<OperationAck, StorageError>>, StorageError> {
            self.batch_sizes
                .lock()
                .expect("batch sizes")
                .push(batches.len());
            self.events
                .lock()
                .expect("events")
                .push(format!("batch:{}", batches.len()));
            Ok(batches
                .iter()
                .map(|operations| Ok(save_acknowledgement(operations)))
                .collect())
        }

        fn search(&self, query: &str, _limit: usize) -> Result<Vec<SearchHit>, StorageError> {
            if query == "gate" {
                self.gate_started.send(()).expect("report gate");
                self.gate_release
                    .lock()
                    .expect("gate release")
                    .recv()
                    .expect("receive gate release");
            }
            self.events
                .lock()
                .expect("events")
                .push(format!("search:{query}"));
            Ok(Vec::new())
        }
    }

    fn save_acknowledgement(operations: &[WorkspaceOperationEnvelope]) -> OperationAck {
        let revisions = operations
            .iter()
            .filter_map(|envelope| match &envelope.operation {
                WorkspaceOperation::SaveDocument {
                    note_id,
                    expected_revision,
                    ..
                } => Some(EntityRevision {
                    id: note_id.clone(),
                    revision: expected_revision + 1,
                }),
                _ => None,
            })
            .collect();
        OperationAck {
            applied: operations.len(),
            revisions,
            rank_changes: Vec::new(),
        }
    }
}
