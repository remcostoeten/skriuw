use std::{fmt, sync::Arc};

use skriuw_domain::{
    HistoryHeader, OperationAck, SearchHit, WorkspaceArchive, WorkspaceOperationEnvelope,
    WorkspaceSnapshot,
};
use thiserror::Error;

pub const MAX_DIAGNOSTIC_MESSAGE_BYTES: usize = 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticContext {
    Runtime,
    Storage,
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
        diagnostic: &Diagnostic,
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
        diagnostic: &Diagnostic,
    ) -> Result<(), StorageError> {
        self.as_ref()
            .release_history_revision(worker_id, item_id, diagnostic)
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
