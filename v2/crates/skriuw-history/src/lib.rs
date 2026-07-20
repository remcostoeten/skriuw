use skriuw_domain::HistoryHeader;
use skriuw_storage::{
    HistoryCache, HistoryMaterialization, HistoryQueue, PendingHistoryRevision, StorageError,
};
use thiserror::Error;

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
    Materialized { item_id: String, version_id: String },
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
                let message = error.to_string();
                return match self.queue.release_history_revision(
                    &self.worker_id,
                    &item.id,
                    &message,
                ) {
                    Ok(()) => Err(HistoryWorkerError::Materialization(error)),
                    Err(release) => Err(HistoryWorkerError::ReleaseAfterFailure {
                        materialization: message,
                        release,
                    }),
                };
            }
        };
        self.queue
            .complete_history_revision(&self.worker_id, &item.id, &materialization)?;
        Ok(HistoryWorkResult::Materialized {
            item_id: item.id,
            version_id: materialization.version_id,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;
    use skriuw_domain::{NodePlacement, WorkspaceOperation, WorkspaceOperationEnvelope};
    use skriuw_sqlite::SqliteWorkspace;
    use skriuw_storage::{
        HistoryMaterialization, HistoryQueue, PendingHistoryRevision, WorkspaceStorage,
    };

    use super::{HistoryMaterializer, HistoryWorkResult, HistoryWorker, MaterializationError};

    #[test]
    fn materializes_and_completes_history() {
        let storage = seeded_storage();
        let worker = HistoryWorker::new("worker-1", Arc::clone(&storage), StaticMaterializer)
            .expect("create worker");

        let result = worker.process_next(100, 30_000).expect("process history");
        assert!(matches!(
            result,
            HistoryWorkResult::Materialized { ref version_id, .. } if version_id == "version-1"
        ));

        let snapshot = storage.bootstrap().expect("bootstrap");
        assert_eq!(snapshot.history_headers.len(), 1);
        assert_eq!(snapshot.history_headers[0].version_id, "version-1");
        assert!(
            storage
                .claim_history_revision("worker-2", 101, 30_000)
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
            .process_next(100, 30_000)
            .expect_err("materialization failure");
        let retry = storage
            .claim_history_revision("worker-2", 101, 30_000)
            .expect("retry claim")
            .expect("pending revision");

        assert_eq!(retry.attempts, 2);
    }

    #[test]
    fn expired_lease_can_be_recovered() {
        let storage = seeded_storage();
        let first = storage
            .claim_history_revision("worker-1", 100, 1_000)
            .expect("first claim")
            .expect("pending revision");
        assert!(
            storage
                .claim_history_revision("worker-2", 1_099, 1_000)
                .expect("claim before expiry")
                .is_none()
        );

        let recovered = storage
            .claim_history_revision("worker-2", 1_100, 1_000)
            .expect("claim after expiry")
            .expect("recovered revision");

        assert_eq!(recovered.id, first.id);
        assert_eq!(recovered.attempts, 2);
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
}
