use std::sync::Arc;

use skriuw_domain::{
    HistoryHeader, OperationAck, SearchHit, WorkspaceArchive, WorkspaceOperationEnvelope,
    WorkspaceSnapshot,
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("unsupported workspace protocol version {0}")]
    UnsupportedProtocol(u16),
    #[error("entity not found: {0}")]
    NotFound(String),
    #[error("revision conflict for {id}: expected {expected}, current {current}")]
    RevisionConflict {
        id: String,
        expected: i64,
        current: i64,
    },
    #[error("invalid workspace operation: {0}")]
    InvalidOperation(String),
    #[error("storage backend failed: {0}")]
    Backend(String),
}

pub trait WorkspaceStorage: Send + Sync {
    fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError>;

    fn apply_operations(
        &self,
        operations: &[WorkspaceOperationEnvelope],
    ) -> Result<OperationAck, StorageError>;

    fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, StorageError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportSummary {
    pub nodes: usize,
    pub documents: usize,
    pub history_items: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IntegrityReport {
    pub healthy: bool,
    pub issues: Vec<String>,
}

pub trait WorkspaceMaintenance: Send + Sync {
    fn export_archive(&self, exported_at: i64) -> Result<WorkspaceArchive, StorageError>;

    fn replace_from_archive(
        &self,
        archive: &WorkspaceArchive,
    ) -> Result<ImportSummary, StorageError>;

    fn integrity_check(&self) -> Result<IntegrityReport, StorageError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingHistoryRevision {
    pub id: String,
    pub note_id: String,
    pub revision: i64,
    pub markdown: String,
    pub created_at: i64,
    pub attempts: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryMaterialization {
    pub version_id: String,
    pub summary: String,
}

pub trait HistoryQueue: Send + Sync {
    fn claim_history_revision(
        &self,
        worker_id: &str,
        now_ms: i64,
        lease_ms: i64,
    ) -> Result<Option<PendingHistoryRevision>, StorageError>;

    fn complete_history_revision(
        &self,
        worker_id: &str,
        item_id: &str,
        materialization: &HistoryMaterialization,
    ) -> Result<(), StorageError>;

    fn release_history_revision(
        &self,
        worker_id: &str,
        item_id: &str,
        error: &str,
    ) -> Result<(), StorageError>;
}

pub trait HistoryCache: Send + Sync {
    fn replace_history_headers(&self, headers: &[HistoryHeader]) -> Result<usize, StorageError>;
}

impl<T> WorkspaceStorage for Arc<T>
where
    T: WorkspaceStorage + ?Sized,
{
    fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError> {
        self.as_ref().bootstrap()
    }

    fn apply_operations(
        &self,
        operations: &[WorkspaceOperationEnvelope],
    ) -> Result<OperationAck, StorageError> {
        self.as_ref().apply_operations(operations)
    }

    fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, StorageError> {
        self.as_ref().search(query, limit)
    }
}

impl<T> WorkspaceMaintenance for Arc<T>
where
    T: WorkspaceMaintenance + ?Sized,
{
    fn export_archive(&self, exported_at: i64) -> Result<WorkspaceArchive, StorageError> {
        self.as_ref().export_archive(exported_at)
    }

    fn replace_from_archive(
        &self,
        archive: &WorkspaceArchive,
    ) -> Result<ImportSummary, StorageError> {
        self.as_ref().replace_from_archive(archive)
    }

    fn integrity_check(&self) -> Result<IntegrityReport, StorageError> {
        self.as_ref().integrity_check()
    }
}

impl<T> HistoryQueue for Arc<T>
where
    T: HistoryQueue + ?Sized,
{
    fn claim_history_revision(
        &self,
        worker_id: &str,
        now_ms: i64,
        lease_ms: i64,
    ) -> Result<Option<PendingHistoryRevision>, StorageError> {
        self.as_ref()
            .claim_history_revision(worker_id, now_ms, lease_ms)
    }

    fn complete_history_revision(
        &self,
        worker_id: &str,
        item_id: &str,
        materialization: &HistoryMaterialization,
    ) -> Result<(), StorageError> {
        self.as_ref()
            .complete_history_revision(worker_id, item_id, materialization)
    }

    fn release_history_revision(
        &self,
        worker_id: &str,
        item_id: &str,
        error: &str,
    ) -> Result<(), StorageError> {
        self.as_ref()
            .release_history_revision(worker_id, item_id, error)
    }
}

impl<T> HistoryCache for Arc<T>
where
    T: HistoryCache + ?Sized,
{
    fn replace_history_headers(&self, headers: &[HistoryHeader]) -> Result<usize, StorageError> {
        self.as_ref().replace_history_headers(headers)
    }
}
