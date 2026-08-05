use std::{fmt, sync::Arc};

use skriuw_domain::{
    HistoryHeader, OperationAck, ReplicatedWorkspaceOperation, SearchHit, SyncAcceptedOperation,
    SyncPushRequest, WorkspaceArchive, WorkspaceOperationEnvelope, WorkspaceSnapshot,
};
use thiserror::Error;

pub const MAX_DIAGNOSTIC_MESSAGE_BYTES: usize = 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticContext {
    Runtime,
    Storage,
    Sync,
    History,
    Backup,
    Recovery,
    Integrity,
}

impl DiagnosticContext {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Runtime => "runtime",
            Self::Storage => "storage",
            Self::Sync => "sync",
            Self::History => "history",
            Self::Backup => "backup",
            Self::Recovery => "recovery",
            Self::Integrity => "integrity",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticCategory {
    Unavailable,
    InvalidInput,
    NotFound,
    Conflict,
    AlreadyExists,
    Backend,
    Internal,
}

impl DiagnosticCategory {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Unavailable => "unavailable",
            Self::InvalidInput => "invalid_input",
            Self::NotFound => "not_found",
            Self::Conflict => "conflict",
            Self::AlreadyExists => "already_exists",
            Self::Backend => "backend",
            Self::Internal => "internal",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    pub context: DiagnosticContext,
    pub category: DiagnosticCategory,
    message: String,
}

impl Diagnostic {
    #[must_use]
    pub fn new(
        context: DiagnosticContext,
        category: DiagnosticCategory,
        message: impl AsRef<str>,
    ) -> Self {
        Self {
            context,
            category,
            message: bounded_diagnostic_message(message.as_ref()),
        }
    }

    #[must_use]
    pub fn message(&self) -> &str {
        &self.message
    }
}

impl fmt::Display for Diagnostic {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "{}.{}: {}",
            self.context.as_str(),
            self.category.as_str(),
            self.message
        )
    }
}

impl std::error::Error for Diagnostic {}

fn bounded_diagnostic_message(message: &str) -> String {
    let mut bounded = String::with_capacity(message.len().min(MAX_DIAGNOSTIC_MESSAGE_BYTES));
    let mut previous_was_space = true;
    for character in message.chars() {
        let is_space = character.is_whitespace() || character.is_control();
        if is_space && previous_was_space {
            continue;
        }
        let character = if is_space { ' ' } else { character };
        if bounded.len() + character.len_utf8() > MAX_DIAGNOSTIC_MESSAGE_BYTES {
            break;
        }
        bounded.push(character);
        previous_was_space = is_space;
    }
    while bounded.ends_with(' ') {
        bounded.pop();
    }
    if bounded.is_empty() {
        "operation failed".into()
    } else {
        bounded
    }
}

#[derive(Debug, Clone, Error)]
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
    #[error("target already exists: {0}")]
    AlreadyExists(String),
    #[error("storage backend failed: {0}")]
    Backend(String),
}

impl StorageError {
    #[must_use]
    pub fn diagnostic(&self, context: DiagnosticContext) -> Diagnostic {
        match self {
            Self::UnsupportedProtocol(version) => Diagnostic::new(
                context,
                DiagnosticCategory::InvalidInput,
                format!("unsupported workspace protocol version {version}"),
            ),
            Self::NotFound(_) => Diagnostic::new(
                context,
                DiagnosticCategory::NotFound,
                "requested entity was not found",
            ),
            Self::RevisionConflict {
                expected, current, ..
            } => Diagnostic::new(
                context,
                DiagnosticCategory::Conflict,
                format!("revision conflict: expected {expected}, current {current}"),
            ),
            Self::InvalidOperation(_) => Diagnostic::new(
                context,
                DiagnosticCategory::InvalidInput,
                "workspace operation is invalid",
            ),
            Self::AlreadyExists(_) => Diagnostic::new(
                context,
                DiagnosticCategory::AlreadyExists,
                "target already exists",
            ),
            Self::Backend(_) => Diagnostic::new(
                context,
                DiagnosticCategory::Backend,
                "storage backend failed",
            ),
        }
    }
}

pub trait WorkspaceStorage: Send + Sync {
    fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError>;

    fn load_sidebar_expansion(&self) -> Result<Option<Vec<String>>, StorageError> {
        Ok(None)
    }

    fn save_sidebar_expansion(&self, _folder_ids: &[String]) -> Result<(), StorageError> {
        Ok(())
    }

    fn load_pane_layout(&self) -> Result<Option<String>, StorageError> {
        Ok(None)
    }

    fn save_pane_layout(&self, _layout_json: &str) -> Result<(), StorageError> {
        Ok(())
    }

    fn apply_operations(
        &self,
        operations: &[WorkspaceOperationEnvelope],
    ) -> Result<OperationAck, StorageError>;

    fn apply_operation_batches(
        &self,
        batches: &[Vec<WorkspaceOperationEnvelope>],
    ) -> Result<Vec<Result<OperationAck, StorageError>>, StorageError> {
        Ok(batches
            .iter()
            .map(|operations| self.apply_operations(operations))
            .collect())
    }

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
        retry_at_ms: i64,
        diagnostic: &Diagnostic,
    ) -> Result<(), StorageError>;
}

pub trait HistoryCache: Send + Sync {
    fn replace_history_headers(&self, headers: &[HistoryHeader]) -> Result<usize, StorageError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewSyncConnection {
    pub workspace_id: String,
    pub device_id: String,
    pub connected_at: i64,
    pub observed_server_sequence: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncConnection {
    pub workspace_id: String,
    pub device_id: String,
    pub connected_at: i64,
    pub observed_server_sequence: u64,
    pub next_client_sequence: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PendingSyncBatch {
    pub workspace_id: String,
    pub request: SyncPushRequest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockedSyncOperation {
    pub id: String,
    pub operation_type: String,
    pub reason_code: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncConflict {
    pub id: String,
    pub operation_id: String,
    pub operation_type: String,
    pub server_sequence: u64,
    pub reason_code: String,
    pub subreason: Option<String>,
    pub message: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RemoteSyncApplyOutcome {
    Applied(OperationAck),
    LocalEcho,
    Conflict(SyncConflict),
    Duplicate,
    NoOp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncTombstone {
    pub entity_kind: String,
    pub entity_id: String,
    pub scope_id: String,
    pub root_id: Option<String>,
    pub operation_id: Option<String>,
    pub server_sequence: Option<u64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentConflictSummary {
    pub conflict_id: String,
    pub note_id: String,
    pub remote_title: Option<String>,
    pub local_title: Option<String>,
    pub reason_code: String,
    pub subreason: Option<String>,
    pub server_sequence: u64,
    pub created_at: i64,
    pub local_version_available: bool,
    pub resolved_choice: Option<String>,
    pub resolved_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentConflictVersion {
    pub title: Option<String>,
    pub document_json: String,
    pub markdown: String,
    pub revision: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentConflictVersions {
    pub conflict_id: String,
    pub note_id: String,
    pub remote: DocumentConflictVersion,
    pub local: Option<DocumentConflictVersion>,
}

pub trait WorkspaceSyncQueue: Send + Sync {
    fn sync_connection(&self) -> Result<Option<SyncConnection>, StorageError>;

    fn connect_sync(&self, connection: &NewSyncConnection) -> Result<SyncConnection, StorageError>;

    fn disconnect_sync(&self, disconnected_at: i64) -> Result<(), StorageError>;

    fn claim_sync_operations(
        &self,
        worker_id: &str,
        now_ms: i64,
        lease_ms: i64,
        limit: usize,
    ) -> Result<Option<PendingSyncBatch>, StorageError>;

    fn acknowledge_sync_operations(
        &self,
        worker_id: &str,
        accepted: &[SyncAcceptedOperation],
    ) -> Result<(), StorageError>;

    fn release_sync_operations(
        &self,
        worker_id: &str,
        operation_ids: &[String],
        retry_at_ms: i64,
        diagnostic: &Diagnostic,
    ) -> Result<(), StorageError>;

    fn blocked_sync_operations(&self) -> Result<Vec<BlockedSyncOperation>, StorageError>;

    /// Reports whether any locally committed operation is still queued for
    /// upload, so checkpoint hydration and publication can refuse to run over
    /// unpushed local work without claiming a lease.
    fn has_pending_sync_operations(&self) -> Result<bool, StorageError>;

    fn apply_remote_operations(
        &self,
        operations: &[ReplicatedWorkspaceOperation],
        received_at: i64,
    ) -> Result<Vec<RemoteSyncApplyOutcome>, StorageError>;

    fn sync_conflicts(&self) -> Result<Vec<SyncConflict>, StorageError>;

    fn sync_tombstones(&self) -> Result<Vec<SyncTombstone>, StorageError>;

    fn document_conflicts(&self) -> Result<Vec<DocumentConflictSummary>, StorageError>;

    fn document_conflict_versions(
        &self,
        conflict_id: &str,
    ) -> Result<DocumentConflictVersions, StorageError>;

    fn resolve_document_conflict(
        &self,
        request: &skriuw_domain::ResolveDocumentConflict,
    ) -> Result<Option<OperationAck>, StorageError>;

    /// Initialize a freshly connected device from a verified checkpoint so it
    /// only replays the ordered tail after `checkpoint_server_sequence`.
    fn hydrate_from_checkpoint(
        &self,
        archive: &WorkspaceArchive,
        checkpoint_server_sequence: u64,
    ) -> Result<ImportSummary, StorageError>;
}

impl<T> WorkspaceStorage for Arc<T>
where
    T: WorkspaceStorage + ?Sized,
{
    fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError> {
        self.as_ref().bootstrap()
    }

    fn load_sidebar_expansion(&self) -> Result<Option<Vec<String>>, StorageError> {
        self.as_ref().load_sidebar_expansion()
    }

    fn save_sidebar_expansion(&self, folder_ids: &[String]) -> Result<(), StorageError> {
        self.as_ref().save_sidebar_expansion(folder_ids)
    }

    fn load_pane_layout(&self) -> Result<Option<String>, StorageError> {
        self.as_ref().load_pane_layout()
    }

    fn save_pane_layout(&self, layout_json: &str) -> Result<(), StorageError> {
        self.as_ref().save_pane_layout(layout_json)
    }

    fn apply_operations(
        &self,
        operations: &[WorkspaceOperationEnvelope],
    ) -> Result<OperationAck, StorageError> {
        self.as_ref().apply_operations(operations)
    }

    fn apply_operation_batches(
        &self,
        batches: &[Vec<WorkspaceOperationEnvelope>],
    ) -> Result<Vec<Result<OperationAck, StorageError>>, StorageError> {
        self.as_ref().apply_operation_batches(batches)
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
        retry_at_ms: i64,
        diagnostic: &Diagnostic,
    ) -> Result<(), StorageError> {
        self.as_ref()
            .release_history_revision(worker_id, item_id, retry_at_ms, diagnostic)
    }
}

impl<T> WorkspaceSyncQueue for Arc<T>
where
    T: WorkspaceSyncQueue + ?Sized,
{
    fn sync_connection(&self) -> Result<Option<SyncConnection>, StorageError> {
        self.as_ref().sync_connection()
    }

    fn connect_sync(&self, connection: &NewSyncConnection) -> Result<SyncConnection, StorageError> {
        self.as_ref().connect_sync(connection)
    }

    fn disconnect_sync(&self, disconnected_at: i64) -> Result<(), StorageError> {
        self.as_ref().disconnect_sync(disconnected_at)
    }

    fn claim_sync_operations(
        &self,
        worker_id: &str,
        now_ms: i64,
        lease_ms: i64,
        limit: usize,
    ) -> Result<Option<PendingSyncBatch>, StorageError> {
        self.as_ref()
            .claim_sync_operations(worker_id, now_ms, lease_ms, limit)
    }

    fn acknowledge_sync_operations(
        &self,
        worker_id: &str,
        accepted: &[SyncAcceptedOperation],
    ) -> Result<(), StorageError> {
        self.as_ref()
            .acknowledge_sync_operations(worker_id, accepted)
    }

    fn release_sync_operations(
        &self,
        worker_id: &str,
        operation_ids: &[String],
        retry_at_ms: i64,
        diagnostic: &Diagnostic,
    ) -> Result<(), StorageError> {
        self.as_ref()
            .release_sync_operations(worker_id, operation_ids, retry_at_ms, diagnostic)
    }

    fn blocked_sync_operations(&self) -> Result<Vec<BlockedSyncOperation>, StorageError> {
        self.as_ref().blocked_sync_operations()
    }

    fn has_pending_sync_operations(&self) -> Result<bool, StorageError> {
        self.as_ref().has_pending_sync_operations()
    }

    fn apply_remote_operations(
        &self,
        operations: &[ReplicatedWorkspaceOperation],
        received_at: i64,
    ) -> Result<Vec<RemoteSyncApplyOutcome>, StorageError> {
        self.as_ref()
            .apply_remote_operations(operations, received_at)
    }

    fn sync_conflicts(&self) -> Result<Vec<SyncConflict>, StorageError> {
        self.as_ref().sync_conflicts()
    }

    fn sync_tombstones(&self) -> Result<Vec<SyncTombstone>, StorageError> {
        self.as_ref().sync_tombstones()
    }

    fn document_conflicts(&self) -> Result<Vec<DocumentConflictSummary>, StorageError> {
        self.as_ref().document_conflicts()
    }

    fn document_conflict_versions(
        &self,
        conflict_id: &str,
    ) -> Result<DocumentConflictVersions, StorageError> {
        self.as_ref().document_conflict_versions(conflict_id)
    }

    fn resolve_document_conflict(
        &self,
        request: &skriuw_domain::ResolveDocumentConflict,
    ) -> Result<Option<OperationAck>, StorageError> {
        self.as_ref().resolve_document_conflict(request)
    }

    fn hydrate_from_checkpoint(
        &self,
        archive: &WorkspaceArchive,
        checkpoint_server_sequence: u64,
    ) -> Result<ImportSummary, StorageError> {
        self.as_ref()
            .hydrate_from_checkpoint(archive, checkpoint_server_sequence)
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

#[cfg(test)]
mod tests {
    use super::{
        Diagnostic, DiagnosticCategory, DiagnosticContext, MAX_DIAGNOSTIC_MESSAGE_BYTES,
        StorageError,
    };

    #[test]
    fn bounds_utf8_diagnostic_messages_and_normalizes_controls() {
        let message = format!("\n\t{}\r\n", "é".repeat(600));
        let diagnostic = Diagnostic::new(
            DiagnosticContext::History,
            DiagnosticCategory::Backend,
            message,
        );

        assert_eq!(diagnostic.message().len(), MAX_DIAGNOSTIC_MESSAGE_BYTES);
        assert_eq!(diagnostic.message().chars().count(), 512);
        assert!(!diagnostic.message().contains(char::is_control));
        assert_eq!(
            diagnostic.to_string(),
            format!("history.backend: {}", diagnostic.message())
        );
    }

    #[test]
    fn replaces_empty_diagnostic_messages() {
        let diagnostic = Diagnostic::new(
            DiagnosticContext::Runtime,
            DiagnosticCategory::Internal,
            "\n\t",
        );

        assert_eq!(diagnostic.message(), "operation failed");
    }

    #[test]
    fn maps_storage_errors_without_exposing_backend_details() {
        let backend = StorageError::Backend("/private/workspace.sqlite: disk failure".into())
            .diagnostic(DiagnosticContext::Backup);
        let conflict = StorageError::RevisionConflict {
            id: "secret-note-id".into(),
            expected: 4,
            current: 5,
        }
        .diagnostic(DiagnosticContext::Storage);

        assert_eq!(backend.context, DiagnosticContext::Backup);
        assert_eq!(backend.category, DiagnosticCategory::Backend);
        assert_eq!(backend.message(), "storage backend failed");
        assert_eq!(conflict.category, DiagnosticCategory::Conflict);
        assert_eq!(
            conflict.message(),
            "revision conflict: expected 4, current 5"
        );
        assert!(!conflict.to_string().contains("secret-note-id"));
    }

    #[test]
    fn assigns_stable_storage_categories() {
        let cases = [
            (
                StorageError::UnsupportedProtocol(2),
                DiagnosticCategory::InvalidInput,
            ),
            (
                StorageError::NotFound("note-1".into()),
                DiagnosticCategory::NotFound,
            ),
            (
                StorageError::RevisionConflict {
                    id: "note-1".into(),
                    expected: 1,
                    current: 2,
                },
                DiagnosticCategory::Conflict,
            ),
            (
                StorageError::InvalidOperation("invalid".into()),
                DiagnosticCategory::InvalidInput,
            ),
            (
                StorageError::AlreadyExists("target".into()),
                DiagnosticCategory::AlreadyExists,
            ),
            (
                StorageError::Backend("detail".into()),
                DiagnosticCategory::Backend,
            ),
        ];

        for (error, expected) in cases {
            assert_eq!(
                error.diagnostic(DiagnosticContext::Storage).category,
                expected
            );
        }
    }
}
