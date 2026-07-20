use std::{
    sync::mpsc::{self, Receiver, Sender},
    thread,
};

use skriuw_domain::{OperationAck, SearchHit, WorkspaceOperationEnvelope, WorkspaceSnapshot};
use skriuw_storage::{StorageError, WorkspaceStorage};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RuntimeError {
    #[error("storage runtime is unavailable")]
    Unavailable,
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
    sender: Sender<Request>,
}

impl WorkspaceRuntime {
    #[must_use]
    pub fn spawn(storage: impl WorkspaceStorage + 'static) -> Self {
        let (sender, receiver) = mpsc::channel();
        thread::Builder::new()
            .name("skriuw-storage".into())
            .spawn(move || run(storage, receiver))
            .expect("storage runtime thread must start");
        Self { sender }
    }

    pub fn bootstrap(&self) -> Result<Completion<WorkspaceSnapshot>, RuntimeError> {
        let (sender, receiver) = mpsc::channel();
        self.sender
            .send(Request::Bootstrap { sender })
            .map_err(|_| RuntimeError::Unavailable)?;
        Ok(Completion { receiver })
    }

    pub fn apply_operations(
        &self,
        operations: Vec<WorkspaceOperationEnvelope>,
    ) -> Result<Completion<OperationAck>, RuntimeError> {
        let (sender, receiver) = mpsc::channel();
        self.sender
            .send(Request::Apply { operations, sender })
            .map_err(|_| RuntimeError::Unavailable)?;
        Ok(Completion { receiver })
    }

    pub fn search(
        &self,
        query: impl Into<String>,
        limit: usize,
    ) -> Result<Completion<Vec<SearchHit>>, RuntimeError> {
        let (sender, receiver) = mpsc::channel();
        self.sender
            .send(Request::Search {
                query: query.into(),
                limit,
                sender,
            })
            .map_err(|_| RuntimeError::Unavailable)?;
        Ok(Completion { receiver })
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
    for request in receiver {
        match request {
            Request::Bootstrap { sender } => {
                let _ = sender.send(storage.bootstrap());
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

#[cfg(test)]
mod tests {
    use std::{
        sync::{
            Arc, Barrier, Mutex,
            atomic::{AtomicUsize, Ordering},
        },
        thread,
        time::Duration,
    };

    use serde_json::json;
    use skriuw_domain::{
        OperationAck, SearchHit, WorkspaceOperation, WorkspaceOperationEnvelope, WorkspaceSnapshot,
    };
    use skriuw_sqlite::SqliteWorkspace;
    use skriuw_storage::{StorageError, WorkspaceStorage};

    use super::WorkspaceRuntime;

    fn op(operation: WorkspaceOperation) -> WorkspaceOperationEnvelope {
        WorkspaceOperationEnvelope::v1(operation)
    }

    fn create_note(id: &str, title: &str) -> WorkspaceOperationEnvelope {
        op(WorkspaceOperation::CreateNote {
            id: id.into(),
            parent_id: None,
            title: title.into(),
            rank: 1024,
            document_json: json!({"type": "doc", "content": []}),
            markdown: title.into(),
            at: 1,
        })
    }

    #[test]
    fn preserves_fifo_request_order() {
        let runtime =
            WorkspaceRuntime::spawn(SqliteWorkspace::open_in_memory().expect("open database"));
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
        let runtime =
            WorkspaceRuntime::spawn(SqliteWorkspace::open_in_memory().expect("open database"));
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
}
