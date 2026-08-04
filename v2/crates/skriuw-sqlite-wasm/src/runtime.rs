use serde_json::Value;
use skriuw_storage::{
    DiagnosticCategory, DiagnosticContext, StorageError, WorkspaceMaintenance, WorkspaceStorage,
};

use crate::protocol::{
    BatchOutcome, BrowserImportSummary, BrowserIntegrityReport, BrowserStorageError,
    BrowserStorageErrorCode, BrowserWorkerCommand, BrowserWorkerRequest, BrowserWorkerResponse,
    BrowserWorkerValue, MAX_BATCHES_PER_REQUEST, MAX_DATABASE_NAME_BYTES, MAX_EXPANDED_FOLDER_IDS,
    MAX_LAYOUT_BYTES, MAX_OPERATIONS_PER_REQUEST, MAX_QUERY_BYTES, MAX_REQUEST_BYTES,
    WORKER_PROTOCOL_VERSION,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerLifecycle {
    Uninitialized,
    Ready,
    TerminalFailure,
    Closed,
}

pub struct BrowserWorkerRuntime<B> {
    lifecycle: WorkerLifecycle,
    backend: Option<B>,
    terminal_error: Option<BrowserStorageError>,
}

impl<B> Default for BrowserWorkerRuntime<B> {
    fn default() -> Self {
        Self::new()
    }
}

impl<B> BrowserWorkerRuntime<B> {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            lifecycle: WorkerLifecycle::Uninitialized,
            backend: None,
            terminal_error: None,
        }
    }

    #[must_use]
    pub const fn lifecycle(&self) -> WorkerLifecycle {
        self.lifecycle
    }

    pub fn initialize(&mut self, backend: B) -> Result<(), BrowserStorageError> {
        if self.lifecycle != WorkerLifecycle::Uninitialized {
            return Err(BrowserStorageError::new(
                BrowserStorageErrorCode::AlreadyInitialized,
                "The storage worker already owns a database.",
                "Reuse this worker or terminate it before opening another workspace.",
                false,
            ));
        }
        self.backend = Some(backend);
        self.lifecycle = WorkerLifecycle::Ready;
        Ok(())
    }

    pub fn fail_terminal(&mut self, error: BrowserStorageError) {
        self.backend = None;
        self.lifecycle = WorkerLifecycle::TerminalFailure;
        self.terminal_error = Some(error);
    }

    pub fn close(&mut self) {
        self.backend = None;
        self.terminal_error = None;
        self.lifecycle = WorkerLifecycle::Closed;
    }
}

impl<B> BrowserWorkerRuntime<B>
where
    B: WorkspaceStorage + WorkspaceMaintenance,
{
    pub fn dispatch(&mut self, request: BrowserWorkerRequest) -> BrowserWorkerResponse {
        let request_id = request.request_id;
        if request.protocol_version != WORKER_PROTOCOL_VERSION {
            return BrowserWorkerResponse::failure(
                request_id,
                BrowserStorageError::new(
                    BrowserStorageErrorCode::UnsupportedProtocol,
                    format!(
                        "Unsupported browser worker protocol version {}.",
                        request.protocol_version
                    ),
                    "Reload Skriuw so the renderer and storage worker use the same version.",
                    false,
                ),
            );
        }
        if request_id == 0 || request_id > 9_007_199_254_740_991 {
            return BrowserWorkerResponse::failure(
                request_id,
                BrowserStorageError::invalid(
                    "requestId must be a positive JavaScript-safe integer.",
                ),
            );
        }

        if matches!(request.command, BrowserWorkerCommand::Initialize { .. }) {
            return BrowserWorkerResponse::failure(
                request_id,
                BrowserStorageError::new(
                    BrowserStorageErrorCode::AlreadyInitialized,
                    "This worker has already completed initialization.",
                    "Reuse this worker or terminate it before opening another workspace.",
                    false,
                ),
            );
        }
        if matches!(request.command, BrowserWorkerCommand::Close) {
            return match self.lifecycle {
                WorkerLifecycle::Closed => BrowserWorkerResponse::failure(
                    request_id,
                    lifecycle_error(WorkerLifecycle::Closed, self.terminal_error.as_ref()),
                ),
                _ => {
                    self.close();
                    BrowserWorkerResponse::success(request_id, BrowserWorkerValue::Closed)
                }
            };
        }

        if let Err(error) = self.ensure_ready() {
            return BrowserWorkerResponse::failure(request_id, error);
        }
        if let Err(error) = validate_command(&request.command) {
            return BrowserWorkerResponse::failure(request_id, error);
        }

        let backend = self.backend.as_ref().expect("ready runtime owns backend");
        let outcome = match request.command {
            BrowserWorkerCommand::Initialize { .. } | BrowserWorkerCommand::Close => unreachable!(),
            BrowserWorkerCommand::Bootstrap => backend
                .bootstrap()
                .map(|snapshot| BrowserWorkerValue::Bootstrap(Box::new(snapshot)))
                .map_err(map_storage_error),
            BrowserWorkerCommand::LoadSidebarExpansion => backend
                .load_sidebar_expansion()
                .map(BrowserWorkerValue::SidebarExpansion)
                .map_err(map_storage_error),
            BrowserWorkerCommand::SaveSidebarExpansion { folder_ids } => backend
                .save_sidebar_expansion(&folder_ids)
                .map(|()| BrowserWorkerValue::Unit)
                .map_err(map_storage_error),
            BrowserWorkerCommand::LoadPaneLayout => backend
                .load_pane_layout()
                .map(BrowserWorkerValue::PaneLayout)
                .map_err(map_storage_error),
            BrowserWorkerCommand::SavePaneLayout { layout_json } => backend
                .save_pane_layout(&layout_json)
                .map(|()| BrowserWorkerValue::Unit)
                .map_err(map_storage_error),
            BrowserWorkerCommand::ApplyOperations { operations } => backend
                .apply_operations(&operations)
                .map(BrowserWorkerValue::Operation)
                .map_err(map_storage_error),
            BrowserWorkerCommand::ApplyOperationBatches { batches } => backend
                .apply_operation_batches(&batches)
                .map(|outcomes| {
                    BrowserWorkerValue::OperationBatches(
                        outcomes
                            .into_iter()
                            .map(|outcome| match outcome {
                                Ok(ack) => BatchOutcome::Ok(ack),
                                Err(error) => BatchOutcome::Error(map_storage_error(error)),
                            })
                            .collect(),
                    )
                })
                .map_err(map_storage_error),
            BrowserWorkerCommand::Search { query, limit } => backend
                .search(&query, limit)
                .map(BrowserWorkerValue::Search)
                .map_err(map_storage_error),
            BrowserWorkerCommand::ExportArchive { exported_at } => backend
                .export_archive(exported_at)
                .map(|archive| BrowserWorkerValue::Archive(Box::new(archive)))
                .map_err(map_storage_error),
            BrowserWorkerCommand::ReplaceFromArchive { archive } => backend
                .replace_from_archive(archive.as_ref())
                .map(|summary| {
                    BrowserWorkerValue::ImportSummary(BrowserImportSummary {
                        nodes: summary.nodes,
                        documents: summary.documents,
                        history_items: summary.history_items,
                    })
                })
                .map_err(map_storage_error),
            BrowserWorkerCommand::IntegrityCheck => backend
                .integrity_check()
                .map(|report| {
                    BrowserWorkerValue::Integrity(BrowserIntegrityReport {
                        healthy: report.healthy,
                        issues: report.issues,
                    })
                })
                .map_err(map_storage_error),
        };

        match outcome {
            Ok(value) => BrowserWorkerResponse::success(request_id, value),
            Err(error) => {
                if error.terminal {
                    self.fail_terminal(error.clone());
                }
                BrowserWorkerResponse::failure(request_id, error)
            }
        }
    }

    fn ensure_ready(&self) -> Result<(), BrowserStorageError> {
        if self.lifecycle == WorkerLifecycle::Ready {
            Ok(())
        } else {
            Err(lifecycle_error(
                self.lifecycle,
                self.terminal_error.as_ref(),
            ))
        }
    }
}

pub fn decode_request(json: &str) -> Result<BrowserWorkerRequest, BrowserWorkerResponse> {
    if json.len() > MAX_REQUEST_BYTES {
        return Err(BrowserWorkerResponse::failure(
            request_id_from_json(json),
            BrowserStorageError::invalid(format!(
                "Request exceeds the {MAX_REQUEST_BYTES}-byte worker limit."
            )),
        ));
    }
    serde_json::from_str(json).map_err(|_| {
        BrowserWorkerResponse::failure(
            request_id_from_json(json),
            BrowserStorageError::invalid("Malformed or unknown browser worker request."),
        )
    })
}

fn request_id_from_json(json: &str) -> u64 {
    serde_json::from_str::<Value>(json)
        .ok()
        .and_then(|value| value.get("requestId").and_then(Value::as_u64))
        .unwrap_or_default()
}

fn validate_command(command: &BrowserWorkerCommand) -> Result<(), BrowserStorageError> {
    match command {
        BrowserWorkerCommand::Initialize { database_name } => validate_database_name(database_name),
        BrowserWorkerCommand::SaveSidebarExpansion { folder_ids } => {
            if folder_ids.len() > MAX_EXPANDED_FOLDER_IDS {
                return Err(BrowserStorageError::invalid(
                    "Too many expanded folder IDs.",
                ));
            }
            if folder_ids.iter().any(|id| id.is_empty() || id.len() > 256) {
                return Err(BrowserStorageError::invalid(
                    "Expanded folder IDs must contain 1 to 256 bytes.",
                ));
            }
            Ok(())
        }
        BrowserWorkerCommand::SavePaneLayout { layout_json } => {
            if layout_json.len() > MAX_LAYOUT_BYTES {
                return Err(BrowserStorageError::invalid("Pane layout is too large."));
            }
            serde_json::from_str::<Value>(layout_json)
                .map(|_| ())
                .map_err(|_| BrowserStorageError::invalid("Pane layout must be valid JSON."))
        }
        BrowserWorkerCommand::ApplyOperations { operations } => {
            if operations.len() > MAX_OPERATIONS_PER_REQUEST {
                Err(BrowserStorageError::invalid(
                    "Too many operations in one request.",
                ))
            } else {
                Ok(())
            }
        }
        BrowserWorkerCommand::ApplyOperationBatches { batches } => {
            if batches.len() > MAX_BATCHES_PER_REQUEST
                || batches
                    .iter()
                    .any(|batch| batch.len() > MAX_OPERATIONS_PER_REQUEST)
            {
                Err(BrowserStorageError::invalid(
                    "Operation batches exceed the worker limits.",
                ))
            } else {
                Ok(())
            }
        }
        BrowserWorkerCommand::Search { query, limit } => {
            if query.len() > MAX_QUERY_BYTES || *limit > 100_000 {
                Err(BrowserStorageError::invalid(
                    "Search request exceeds worker limits.",
                ))
            } else {
                Ok(())
            }
        }
        BrowserWorkerCommand::ReplaceFromArchive { archive } => archive
            .validate()
            .map_err(|_| BrowserStorageError::invalid("Workspace archive validation failed.")),
        _ => Ok(()),
    }
}

pub(crate) fn validate_database_name(name: &str) -> Result<(), BrowserStorageError> {
    if name.is_empty()
        || name.len() > MAX_DATABASE_NAME_BYTES
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        || name == "."
        || name == ".."
    {
        return Err(BrowserStorageError::invalid(
            "Database name must use 1 to 128 ASCII letters, digits, '.', '-' or '_'.",
        ));
    }
    Ok(())
}

fn lifecycle_error(
    lifecycle: WorkerLifecycle,
    terminal_error: Option<&BrowserStorageError>,
) -> BrowserStorageError {
    match lifecycle {
        WorkerLifecycle::Uninitialized => BrowserStorageError::new(
            BrowserStorageErrorCode::NotReady,
            "Browser storage is not initialized.",
            "Wait for the worker ready response before submitting requests.",
            false,
        ),
        WorkerLifecycle::TerminalFailure => terminal_error.cloned().unwrap_or_else(|| {
            BrowserStorageError::new(
                BrowserStorageErrorCode::WorkerCrashed,
                "The browser storage worker failed.",
                "Export recovery data if available, then reload Skriuw.",
                true,
            )
        }),
        WorkerLifecycle::Closed => BrowserStorageError::new(
            BrowserStorageErrorCode::Shutdown,
            "Browser storage has been closed.",
            "Create a new worker to reopen the workspace.",
            true,
        ),
        WorkerLifecycle::Ready => unreachable!(),
    }
}

pub(crate) fn map_storage_error(error: StorageError) -> BrowserStorageError {
    if let StorageError::Backend(detail) = &error {
        let detail = detail.to_ascii_lowercase();
        if detail.contains("database or disk is full")
            || detail.contains("sqlite_full")
            || detail.contains("quota")
        {
            return BrowserStorageError::new(
                BrowserStorageErrorCode::QuotaExceeded,
                "Browser storage quota is exhausted.",
                "Free browser storage and retry without clearing Skriuw site data.",
                false,
            );
        }
        if detail.contains("malformed")
            || detail.contains("corrupt")
            || detail.contains("not a database")
        {
            return BrowserStorageError::new(
                BrowserStorageErrorCode::CorruptDatabase,
                "The browser database appears to be corrupt.",
                "Stop editing, preserve site data, and recover from a portable archive.",
                true,
            );
        }
    }
    let diagnostic = error.diagnostic(DiagnosticContext::Storage);
    let (code, recovery) = match diagnostic.category {
        DiagnosticCategory::InvalidInput => (
            BrowserStorageErrorCode::InvalidRequest,
            "Correct the request and retry.",
        ),
        DiagnosticCategory::NotFound => (
            BrowserStorageErrorCode::NotFound,
            "Refresh the workspace and retry.",
        ),
        DiagnosticCategory::Conflict => (
            BrowserStorageErrorCode::Conflict,
            "Refresh the affected note and retry the edit.",
        ),
        DiagnosticCategory::AlreadyExists => (
            BrowserStorageErrorCode::AlreadyExists,
            "Choose a different target and retry.",
        ),
        DiagnosticCategory::Unavailable => (
            BrowserStorageErrorCode::NotReady,
            "Reload Skriuw and reopen the workspace.",
        ),
        DiagnosticCategory::Backend | DiagnosticCategory::Internal => (
            BrowserStorageErrorCode::Backend,
            "Export a portable archive if possible, then reload Skriuw.",
        ),
    };
    BrowserStorageError::new(code, diagnostic.message(), recovery, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{BrowserWorkerOutcome, BrowserWorkerValue};
    use skriuw_domain::{OperationAck, SearchHit, WorkspaceArchive, WorkspaceSnapshot};
    use skriuw_storage::{ImportSummary, IntegrityReport};

    struct Probe;

    impl WorkspaceStorage for Probe {
        fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError> {
            Err(StorageError::Backend("private database path".into()))
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

        fn search(&self, _query: &str, _limit: usize) -> Result<Vec<SearchHit>, StorageError> {
            Ok(Vec::new())
        }
    }

    impl WorkspaceMaintenance for Probe {
        fn export_archive(&self, _exported_at: i64) -> Result<WorkspaceArchive, StorageError> {
            Err(StorageError::Backend("not used".into()))
        }

        fn replace_from_archive(
            &self,
            _archive: &WorkspaceArchive,
        ) -> Result<ImportSummary, StorageError> {
            Err(StorageError::Backend("not used".into()))
        }

        fn integrity_check(&self) -> Result<IntegrityReport, StorageError> {
            Ok(IntegrityReport {
                healthy: true,
                issues: Vec::new(),
            })
        }
    }

    fn request(request_id: u64, command: BrowserWorkerCommand) -> BrowserWorkerRequest {
        BrowserWorkerRequest {
            protocol_version: WORKER_PROTOCOL_VERSION,
            request_id,
            command,
        }
    }

    #[test]
    fn requires_initialization_and_rejects_work_after_close() {
        let mut runtime = BrowserWorkerRuntime::<Probe>::new();
        let before = runtime.dispatch(request(1, BrowserWorkerCommand::Bootstrap));
        assert!(matches!(
            before.outcome,
            BrowserWorkerOutcome::Error(BrowserStorageError {
                code: BrowserStorageErrorCode::NotReady,
                ..
            })
        ));

        runtime.initialize(Probe).expect("initialize");
        let close = runtime.dispatch(request(2, BrowserWorkerCommand::Close));
        assert!(matches!(
            close.outcome,
            BrowserWorkerOutcome::Ok(BrowserWorkerValue::Closed)
        ));
        let after = runtime.dispatch(request(3, BrowserWorkerCommand::IntegrityCheck));
        assert!(matches!(
            after.outcome,
            BrowserWorkerOutcome::Error(BrowserStorageError {
                code: BrowserStorageErrorCode::Shutdown,
                terminal: true,
                ..
            })
        ));
    }

    #[test]
    fn rejects_unknown_protocol_and_zero_request_id() {
        let mut runtime = BrowserWorkerRuntime::new();
        runtime.initialize(Probe).expect("initialize");
        let mut unsupported = request(4, BrowserWorkerCommand::Bootstrap);
        unsupported.protocol_version += 1;
        assert!(matches!(
            runtime.dispatch(unsupported).outcome,
            BrowserWorkerOutcome::Error(BrowserStorageError {
                code: BrowserStorageErrorCode::UnsupportedProtocol,
                ..
            })
        ));
        assert!(matches!(
            runtime
                .dispatch(request(0, BrowserWorkerCommand::Bootstrap))
                .outcome,
            BrowserWorkerOutcome::Error(BrowserStorageError {
                code: BrowserStorageErrorCode::InvalidRequest,
                ..
            })
        ));
    }

    #[test]
    fn malformed_json_preserves_a_valid_request_id() {
        let response =
            decode_request(r#"{"requestId":91,"kind":"unknown"}"#).expect_err("unknown request");
        assert_eq!(response.request_id, 91);
        assert!(matches!(
            response.outcome,
            BrowserWorkerOutcome::Error(BrowserStorageError {
                code: BrowserStorageErrorCode::InvalidRequest,
                ..
            })
        ));
    }

    #[test]
    fn backend_diagnostics_are_redacted() {
        let mut runtime = BrowserWorkerRuntime::new();
        runtime.initialize(Probe).expect("initialize");
        let response = runtime.dispatch(request(7, BrowserWorkerCommand::Bootstrap));
        let BrowserWorkerOutcome::Error(error) = response.outcome else {
            panic!("expected failure");
        };
        assert_eq!(error.code, BrowserStorageErrorCode::Backend);
        assert!(!error.message.contains("private database path"));
    }
}
