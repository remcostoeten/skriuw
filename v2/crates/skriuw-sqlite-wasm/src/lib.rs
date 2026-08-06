//! Browser-local SQLite boundary for Skriuw.
//!
//! The renderer sends versioned requests to one dedicated worker. On WASM the
//! worker installs the durable OPFS sync-access-handle pool VFS, opens one
//! `SqliteWorkspace`, and reuses the native adapter's domain validation, SQL,
//! migrations, transactions, FTS, and portable archive implementation.
//! Database and OPFS handles never cross this crate's worker boundary.

mod assets;
mod protocol;
mod runtime;
mod sync;

#[cfg(target_arch = "wasm32")]
mod wasm;

use std::sync::Arc;

use skriuw_domain::{OperationAck, SearchHit, WorkspaceOperationEnvelope, WorkspaceSnapshot};
use skriuw_storage::{StorageError, WorkspaceStorage};

pub use assets::BrowserAssetStore;
pub use protocol::*;
pub use runtime::{BrowserWorkerRuntime, WorkerLifecycle, decode_request};
pub use sync::{
    BrowserSyncEnvironment, BrowserSyncRuntime, ProgressReportingTransport, SyncProgressObserver,
    SyncTransportFactory,
};

/// Compatibility request set used by native parity tests. Production browser
/// traffic uses [`BrowserWorkerRequest`] and [`BrowserWorkerRuntime`].
#[derive(Debug)]
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

#[derive(Debug)]
pub enum WorkerResponse {
    Bootstrap(Box<Result<WorkspaceSnapshot, StorageError>>),
    SidebarExpansion(Result<Option<Vec<String>>, StorageError>),
    Unit(Result<(), StorageError>),
    PaneLayout(Result<Option<String>, StorageError>),
    Operation(Result<OperationAck, StorageError>),
    OperationBatches(Result<Vec<Result<OperationAck, StorageError>>, StorageError>),
    Search(Result<Vec<SearchHit>, StorageError>),
}

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

    pub fn dispatch(&self, request: WorkerRequest) -> WorkerResponse {
        match request {
            WorkerRequest::Bootstrap => {
                WorkerResponse::Bootstrap(Box::new(self.backend.bootstrap()))
            }
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
