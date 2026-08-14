use skriuw_domain::HistoryHeader;
use skriuw_storage::{
    Diagnostic, DiagnosticCategory, DiagnosticContext, HistoryCache, HistoryMaterialization,
    HistoryQueue, PendingHistoryRevision, StorageError,
};
use thiserror::Error;

const INITIAL_RETRY_DELAY_MS: i64 = 1_000;
const MAX_RETRY_DELAY_MS: i64 = 6 * 60 * 60 * 1_000;

#[derive(Debug, Error)]
#[error("{message}")]
pub struct MaterializationError {
    message: String,
}

impl MaterializationError {
    #[must_use]
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    #[must_use]
    pub fn diagnostic(&self) -> Diagnostic {
        Diagnostic::new(
            DiagnosticContext::History,
            DiagnosticCategory::Backend,
            "history materialization failed",
        )
    }
}

pub trait HistoryMaterializer: Send + Sync {
    fn materialize(
        &self,
        item: &PendingHistoryRevision,
    ) -> Result<HistoryMaterialization, MaterializationError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryVersion {
    pub header: HistoryHeader,
    pub revision: i64,
    pub markdown: String,
}

#[derive(Debug, Error)]
pub enum HistoryReadError {
    #[error("history version not found: {0}")]
    NotFound(String),
    #[error("history backend failed: {0}")]
    Backend(String),
}

impl HistoryReadError {
    #[must_use]
    pub fn backend(error: impl Into<String>) -> Self {
        Self::Backend(error.into())
    }

    #[must_use]
    pub fn diagnostic(&self) -> Diagnostic {
        match self {
            Self::NotFound(_) => Diagnostic::new(
                DiagnosticContext::History,
                DiagnosticCategory::NotFound,
                "history version was not found",
            ),
            Self::Backend(_) => Diagnostic::new(
                DiagnosticContext::History,
                DiagnosticCategory::Backend,
                "history backend failed",
            ),
        }
    }
}

pub trait HistoryReader: Send + Sync {
    fn list_headers(&self) -> Result<Vec<HistoryHeader>, HistoryReadError>;

    fn read_version(
        &self,
        note_id: &str,
        version_id: &str,
    ) -> Result<HistoryVersion, HistoryReadError>;
}

#[derive(Debug, Error)]
pub enum HistoryRebuildError {
    #[error(transparent)]
    Reader(#[from] HistoryReadError),
    #[error(transparent)]
    Storage(#[from] StorageError),
}

impl HistoryRebuildError {
    #[must_use]
    pub fn diagnostic(&self) -> Diagnostic {
        match self {
            Self::Reader(error) => error.diagnostic(),
            Self::Storage(error) => error.diagnostic(DiagnosticContext::History),
        }
    }
}

pub fn rebuild_history_cache(
    reader: &impl HistoryReader,
    cache: &impl HistoryCache,
) -> Result<usize, HistoryRebuildError> {
    let headers = reader.list_headers()?;
    cache
        .replace_history_headers(&headers)
        .map_err(HistoryRebuildError::Storage)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HistoryWorkResult {
    Idle,
    Materialized {
        item_id: String,
        header: HistoryHeader,
    },
}

#[derive(Debug, Error)]
pub enum HistoryWorkerError {
    #[error("history worker id must contain 1 to 128 bytes")]
    InvalidWorkerId,
    #[error(transparent)]
    Queue(#[from] StorageError),
    #[error("history materialization failed: {0}")]
    Materialization(#[from] MaterializationError),
    #[error("history materialization failed: {materialization}; queue release failed: {release}")]
    ReleaseAfterFailure {
        materialization: String,
        release: StorageError,
    },
}

impl HistoryWorkerError {
    #[must_use]
    pub fn diagnostic(&self) -> Diagnostic {
        match self {
            Self::InvalidWorkerId => Diagnostic::new(
                DiagnosticContext::History,
                DiagnosticCategory::InvalidInput,
                "history worker id is invalid",
            ),
            Self::Queue(error) => error.diagnostic(DiagnosticContext::History),
            Self::Materialization(error) => error.diagnostic(),
            Self::ReleaseAfterFailure { .. } => Diagnostic::new(
                DiagnosticContext::History,
                DiagnosticCategory::Backend,
                "history materialization and queue release failed",
            ),
        }
    }
}

pub struct HistoryWorker<Q, M> {
    worker_id: String,
    queue: Q,
    materializer: M,
}

impl<Q, M> HistoryWorker<Q, M>
where
    Q: HistoryQueue,
    M: HistoryMaterializer,
{
    pub fn new(
        worker_id: impl Into<String>,
        queue: Q,
        materializer: M,
    ) -> Result<Self, HistoryWorkerError> {
        let worker_id = worker_id.into();
        if worker_id.trim().is_empty() || worker_id.len() > 128 {
            return Err(HistoryWorkerError::InvalidWorkerId);
        }
        Ok(Self {
            worker_id,
            queue,
            materializer,
        })
    }

    pub fn process_next(
        &self,
        now_ms: i64,
        lease_ms: i64,
    ) -> Result<HistoryWorkResult, HistoryWorkerError> {
        let Some(item) = self
            .queue
            .claim_history_revision(&self.worker_id, now_ms, lease_ms)?
        else {
            return Ok(HistoryWorkResult::Idle);
        };
        let materialization = match self.materializer.materialize(&item) {
            Ok(materialization) => materialization,
            Err(error) => {
                let diagnostic = Diagnostic::new(
                    DiagnosticContext::History,
                    DiagnosticCategory::Backend,
                    error.to_string(),
                );
                return match self.queue.release_history_revision(
                    &self.worker_id,
                    &item.id,
                    now_ms.saturating_add(retry_delay_ms(item.attempts)),
                    &diagnostic,
                ) {
                    Ok(()) => Err(HistoryWorkerError::Materialization(error)),
                    Err(release) => Err(HistoryWorkerError::ReleaseAfterFailure {
                        materialization: diagnostic.to_string(),
                        release,
                    }),
                };
            }
        };
        self.queue
            .complete_history_revision(&self.worker_id, &item.id, &materialization)?;
        let header = HistoryHeader {
            note_id: item.note_id,
            version_id: materialization.version_id,
            created_at: item.created_at,
            summary: materialization.summary,
        };
        Ok(HistoryWorkResult::Materialized {
            item_id: item.id,
            header,
        })
    }
}

fn retry_delay_ms(attempts: i64) -> i64 {
    let exponent = u32::try_from(attempts.saturating_sub(1).clamp(0, 30)).unwrap_or(30);
    INITIAL_RETRY_DELAY_MS
        .saturating_mul(1_i64 << exponent)
        .min(MAX_RETRY_DELAY_MS)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use skriuw_domain::{NodePlacement, WorkspaceOperation, WorkspaceOperationEnvelope};
    use skriuw_sqlite::{HISTORY_COALESCE_WINDOW_MS, SqliteWorkspace};
    use skriuw_storage::{
        DiagnosticCategory, DiagnosticContext, HistoryMaterialization, HistoryQueue,
        MAX_DIAGNOSTIC_MESSAGE_BYTES, PendingHistoryRevision, StorageError, WorkspaceStorage,
    };

    use super::{
        HistoryMaterializer, HistoryReadError, HistoryWorkResult, HistoryWorker,
        MaterializationError,
    };

    #[test]
    fn materializes_and_completes_history() {
        let storage = seeded_storage();
        let worker = HistoryWorker::new("worker-1", Arc::clone(&storage), StaticMaterializer)
            .expect("create worker");

        let result = worker
            .process_next(HISTORY_COALESCE_WINDOW_MS + 100, 30_000)
            .expect("process history");
        assert!(matches!(
            result,
            HistoryWorkResult::Materialized { ref header, .. }
                if header.note_id == "note-1"
                    && header.version_id == "version-1"
                    && header.created_at == 1
                    && header.summary == "Created note"
        ));

        let snapshot = storage.bootstrap().expect("bootstrap");
        assert_eq!(snapshot.history_headers.len(), 1);
        assert_eq!(snapshot.history_headers[0].version_id, "version-1");
        assert!(
            storage
                .claim_history_revision("worker-2", HISTORY_COALESCE_WINDOW_MS + 101, 30_000)
                .expect("claim history")
                .is_none()
        );
    }

    #[test]
    fn releases_failed_materialization_for_retry() {
        let storage = seeded_storage();
        let worker = HistoryWorker::new("worker-1", Arc::clone(&storage), FailingMaterializer)
            .expect("create worker");

        worker
            .process_next(HISTORY_COALESCE_WINDOW_MS + 100, 30_000)
            .expect_err("materialization failure");
        assert!(
            storage
                .claim_history_revision("worker-2", HISTORY_COALESCE_WINDOW_MS + 1_099, 30_000)
                .expect("claim before retry")
                .is_none()
        );
        let retry = storage
            .claim_history_revision("worker-2", HISTORY_COALESCE_WINDOW_MS + 1_100, 30_000)
            .expect("retry claim")
            .expect("pending revision");

        assert_eq!(retry.attempts, 2);
    }

    #[test]
    fn deferred_poison_revision_does_not_starve_later_history() {
        let storage = seeded_storage();
        storage
            .apply_operations(&[WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::CreateNote {
                    id: "note-2".into(),
                    title: "Healthy".into(),
                    placement: NodePlacement::last(None),
                    document_json: json!({"type": "doc", "content": []}),
                    markdown: "# Healthy".into(),
                    at: 2,
                },
            )])
            .expect("create healthy note");
        let worker = HistoryWorker::new("worker-1", Arc::clone(&storage), SelectiveMaterializer)
            .expect("create worker");

        worker
            .process_next(HISTORY_COALESCE_WINDOW_MS + 100, 30_000)
            .expect_err("poison revision fails");
        let result = worker
            .process_next(HISTORY_COALESCE_WINDOW_MS + 101, 30_000)
            .expect("later revision progresses");

        assert!(matches!(
            result,
            HistoryWorkResult::Materialized { ref header, .. }
                if header.note_id == "note-2"
        ));
    }

    #[test]
    fn cache_commit_failure_returns_no_publishable_header() {
        let queue = FailingCompletionQueue {
            item: Mutex::new(Some(PendingHistoryRevision {
                id: "item-1".into(),
                note_id: "note-1".into(),
                revision: 1,
                markdown: "history".into(),
                created_at: 1,
                attempts: 1,
            })),
        };
        let worker =
            HistoryWorker::new("worker-1", queue, StaticMaterializer).expect("create worker");

        let error = worker
            .process_next(100, 30_000)
            .expect_err("cache commit failure");

        assert!(matches!(error, super::HistoryWorkerError::Queue(_)));
    }

    #[test]
    fn expired_lease_can_be_recovered() {
        let storage = seeded_storage();
        let first = storage
            .claim_history_revision("worker-1", HISTORY_COALESCE_WINDOW_MS + 100, 1_000)
            .expect("first claim")
            .expect("pending revision");
        assert!(
            storage
                .claim_history_revision("worker-2", HISTORY_COALESCE_WINDOW_MS + 1_099, 1_000)
                .expect("claim before expiry")
                .is_none()
        );

        let recovered = storage
            .claim_history_revision("worker-2", HISTORY_COALESCE_WINDOW_MS + 1_100, 1_000)
            .expect("claim after expiry")
            .expect("recovered revision");

        assert_eq!(recovered.id, first.id);
        assert_eq!(recovered.attempts, 2);
    }

    #[test]
    fn persists_bounded_categorized_retry_diagnostics() {
        let released = Arc::new(Mutex::new(None));
        let queue = CapturingQueue {
            item: Mutex::new(Some(PendingHistoryRevision {
                id: "item-1".into(),
                note_id: "note-1".into(),
                revision: 1,
                markdown: "history".into(),
                created_at: 1,
                attempts: 1,
            })),
            released: Arc::clone(&released),
        };
        let worker =
            HistoryWorker::new("worker-1", queue, LargeFailingMaterializer).expect("create worker");

        let error = worker
            .process_next(100, 30_000)
            .expect_err("materialization failure");
        let persisted = released
            .lock()
            .expect("released diagnostic")
            .clone()
            .expect("persisted diagnostic");

        assert!(persisted.starts_with("history.backend: "));
        assert!(persisted.len() <= "history.backend: ".len() + MAX_DIAGNOSTIC_MESSAGE_BYTES);
        assert!(!persisted.contains(char::is_control));
        let diagnostic = error.diagnostic();
        assert_eq!(diagnostic.context, DiagnosticContext::History);
        assert_eq!(diagnostic.category, DiagnosticCategory::Backend);
        assert_eq!(diagnostic.message(), "history materialization failed");
    }

    #[test]
    fn maps_history_reads_without_exposing_backend_details() {
        let diagnostic = HistoryReadError::backend("/private/history.git: corrupt").diagnostic();

        assert_eq!(diagnostic.context, DiagnosticContext::History);
        assert_eq!(diagnostic.category, DiagnosticCategory::Backend);
        assert_eq!(diagnostic.message(), "history backend failed");
        assert!(!diagnostic.to_string().contains("/private"));
    }

    fn seeded_storage() -> Arc<SqliteWorkspace> {
        let storage = Arc::new(SqliteWorkspace::open_in_memory().expect("open database"));
        storage
            .apply_operations(&[WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::CreateNote {
                    id: "note-1".into(),
                    title: "History".into(),
                    placement: NodePlacement::last(None),
                    document_json: json!({"type": "doc", "content": []}),
                    markdown: "# History".into(),
                    at: 1,
                },
            )])
            .expect("create note");
        storage
    }

    struct StaticMaterializer;

    impl HistoryMaterializer for StaticMaterializer {
        fn materialize(
            &self,
            _item: &PendingHistoryRevision,
        ) -> Result<HistoryMaterialization, MaterializationError> {
            Ok(HistoryMaterialization {
                version_id: "version-1".into(),
                summary: "Created note".into(),
            })
        }
    }

    struct FailingMaterializer;

    impl HistoryMaterializer for FailingMaterializer {
        fn materialize(
            &self,
            _item: &PendingHistoryRevision,
        ) -> Result<HistoryMaterialization, MaterializationError> {
            Err(MaterializationError::new("history backend unavailable"))
        }
    }

    struct SelectiveMaterializer;

    impl HistoryMaterializer for SelectiveMaterializer {
        fn materialize(
            &self,
            item: &PendingHistoryRevision,
        ) -> Result<HistoryMaterialization, MaterializationError> {
            if item.note_id == "note-1" {
                return Err(MaterializationError::new("poison revision"));
            }
            Ok(HistoryMaterialization {
                version_id: format!("version-{}", item.note_id),
                summary: "Created note".into(),
            })
        }
    }

    struct LargeFailingMaterializer;

    impl HistoryMaterializer for LargeFailingMaterializer {
        fn materialize(
            &self,
            _item: &PendingHistoryRevision,
        ) -> Result<HistoryMaterialization, MaterializationError> {
            Err(MaterializationError::new(format!(
                "\n{}\t",
                "failure".repeat(300)
            )))
        }
    }

    struct CapturingQueue {
        item: Mutex<Option<PendingHistoryRevision>>,
        released: Arc<Mutex<Option<String>>>,
    }

    struct FailingCompletionQueue {
        item: Mutex<Option<PendingHistoryRevision>>,
    }

    impl HistoryQueue for FailingCompletionQueue {
        fn claim_history_revision(
            &self,
            _worker_id: &str,
            _now_ms: i64,
            _lease_ms: i64,
        ) -> Result<Option<PendingHistoryRevision>, StorageError> {
            Ok(self.item.lock().expect("queue item").take())
        }

        fn complete_history_revision(
            &self,
            _worker_id: &str,
            _item_id: &str,
            _materialization: &HistoryMaterialization,
        ) -> Result<(), StorageError> {
            Err(StorageError::Backend("cache unavailable".into()))
        }

        fn release_history_revision(
            &self,
            _worker_id: &str,
            _item_id: &str,
            _retry_at_ms: i64,
            _diagnostic: &skriuw_storage::Diagnostic,
        ) -> Result<(), StorageError> {
            unreachable!()
        }
    }

    impl HistoryQueue for CapturingQueue {
        fn claim_history_revision(
            &self,
            _worker_id: &str,
            _now_ms: i64,
            _lease_ms: i64,
        ) -> Result<Option<PendingHistoryRevision>, StorageError> {
            Ok(self.item.lock().expect("queue item").take())
        }

        fn complete_history_revision(
            &self,
            _worker_id: &str,
            _item_id: &str,
            _materialization: &HistoryMaterialization,
        ) -> Result<(), StorageError> {
            unreachable!()
        }

        fn release_history_revision(
            &self,
            _worker_id: &str,
            _item_id: &str,
            _retry_at_ms: i64,
            diagnostic: &skriuw_storage::Diagnostic,
        ) -> Result<(), StorageError> {
            *self.released.lock().expect("released diagnostic") = Some(diagnostic.to_string());
            Ok(())
        }
    }
}
