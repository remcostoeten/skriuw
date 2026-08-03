//! Browser storage boundary for Skriuw.
//!
//! SQLite-WASM must live in a dedicated worker because SQLite's WASM bindings
//! are not thread-safe and OPFS synchronous access handles are worker-only.
//! This crate deliberately keeps the worker protocol independent from the
//! browser transport: a web worker can call [`WorkerStorage::dispatch`] for
//! each `postMessage` request, while tests can exercise the exact same request
//! and response mapping with an in-process backend.
//!
//! The OPFS VFS and SQL implementation are the next layer. Until that is
//! wired, [`BrowserWorkspace::from_backend`] provides the complete boundary
//! against any `WorkspaceStorage` implementation (including the memory
//! adapter used by fixtures). No renderer code should depend on the concrete
//! backend behind this boundary.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use skriuw_domain::{OperationAck, SearchHit, WorkspaceOperationEnvelope, WorkspaceSnapshot};
use skriuw_storage::{StorageError, WorkspaceStorage};

/// The stable operation set sent over the browser worker transport.
#[derive(Debug, Serialize, Deserialize)]
pub enum WorkerRequest {
    Bootstrap,
    LoadSidebarExpansion,
    SaveSidebarExpansion(Vec<String>),
    LoadPaneLayout,
    SavePaneLayout(String),
    ApplyOperations(Vec<WorkspaceOperationEnvelope>),
    ApplyOperationBatches(Vec<Vec<WorkspaceOperationEnvelope>>),
    Search { query: String, limit: usize },
}

/// Responses returned by [`WorkerStorage::dispatch`].
#[derive(Debug)]
pub enum WorkerResponse {
    Bootstrap(Result<WorkspaceSnapshot, StorageError>),
    SidebarExpansion(Result<Option<Vec<String>>, StorageError>),
    Unit(Result<(), StorageError>),
    PaneLayout(Result<Option<String>, StorageError>),
    Operation(Result<OperationAck, StorageError>),
    OperationBatches(Result<Vec<Result<OperationAck, StorageError>>, StorageError>),
    Search(Result<Vec<SearchHit>, StorageError>),
}

/// Worker-owned storage facade.
///
/// `Arc` is used here so the facade can be moved into the worker loop while
/// preserving the `Send + Sync` contract expected by the runtime. The actual
/// SQLite connection should be constructed inside the worker and supplied as
/// the backend once the OPFS VFS is available.
pub struct WorkerStorage {
    backend: Arc<dyn WorkspaceStorage>,
}

impl WorkerStorage {
    #[must_use]
    pub fn new(backend: impl WorkspaceStorage + 'static) -> Self {
        Self {
            backend: Arc::new(backend),
        }
    }

    #[must_use]
    pub fn from_shared(backend: Arc<dyn WorkspaceStorage>) -> Self {
        Self { backend }
    }

    /// Dispatch one complete request. The browser transport can serialize the
    /// returned response and resolve the matching promise on the renderer.
    pub fn dispatch(&self, request: WorkerRequest) -> WorkerResponse {
        match request {
            WorkerRequest::Bootstrap => WorkerResponse::Bootstrap(self.backend.bootstrap()),
            WorkerRequest::LoadSidebarExpansion => {
                WorkerResponse::SidebarExpansion(self.backend.load_sidebar_expansion())
            }
            WorkerRequest::SaveSidebarExpansion(folder_ids) => {
                WorkerResponse::Unit(self.backend.save_sidebar_expansion(&folder_ids))
            }
            WorkerRequest::LoadPaneLayout => {
                WorkerResponse::PaneLayout(self.backend.load_pane_layout())
            }
            WorkerRequest::SavePaneLayout(layout) => {
                WorkerResponse::Unit(self.backend.save_pane_layout(&layout))
            }
            WorkerRequest::ApplyOperations(operations) => {
                WorkerResponse::Operation(self.backend.apply_operations(&operations))
            }
            WorkerRequest::ApplyOperationBatches(batches) => {
                WorkerResponse::OperationBatches(self.backend.apply_operation_batches(&batches))
            }
            WorkerRequest::Search { query, limit } => {
                WorkerResponse::Search(self.backend.search(&query, limit))
            }
        }
    }
}

/// Browser-facing workspace handle. This name is intentionally the seam that
/// the renderer bridge will consume; `from_backend` keeps the first milestone
/// testable before OPFS and the WASM SQLite VFS are connected.
pub struct BrowserWorkspace {
    worker: WorkerStorage,
}

impl BrowserWorkspace {
    #[must_use]
    pub fn from_backend(backend: impl WorkspaceStorage + 'static) -> Self {
        Self {
            worker: WorkerStorage::new(backend),
        }
    }

    #[must_use]
    pub fn worker(&self) -> &WorkerStorage {
        &self.worker
    }
}

#[cfg(test)]
mod tests {
    use super::{BrowserWorkspace, WorkerRequest, WorkerResponse};
    use skriuw_domain::{OperationAck, WorkspaceSnapshot};
    use skriuw_storage::{StorageError, WorkspaceStorage};

    struct ProbeStorage;

    impl WorkspaceStorage for ProbeStorage {
        fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError> {
            Err(StorageError::Backend("probe bootstrap".into()))
        }

        fn apply_operations(
            &self,
            operations: &[skriuw_domain::WorkspaceOperationEnvelope],
        ) -> Result<OperationAck, StorageError> {
            Ok(OperationAck {
                applied: operations.len(),
                revisions: Vec::new(),
                rank_changes: Vec::new(),
            })
        }

        fn search(
            &self,
            _query: &str,
            _limit: usize,
        ) -> Result<Vec<skriuw_domain::SearchHit>, StorageError> {
            Ok(Vec::new())
        }
    }

    #[test]
    fn dispatch_preserves_backend_errors() {
        let workspace = BrowserWorkspace::from_backend(ProbeStorage);
        let response = workspace.worker().dispatch(WorkerRequest::Bootstrap);
        assert!(matches!(
            response,
            WorkerResponse::Bootstrap(Err(StorageError::Backend(message)))
                if message == "probe bootstrap"
        ));
    }

    #[test]
    fn dispatches_operation_batches_through_worker_boundary() {
        let workspace = BrowserWorkspace::from_backend(ProbeStorage);
        let response = workspace
            .worker()
            .dispatch(WorkerRequest::ApplyOperationBatches(vec![
                Vec::new(),
                Vec::new(),
            ]));
        assert!(matches!(
            response,
            WorkerResponse::OperationBatches(Ok(results)) if results.len() == 2
        ));
    }
}
