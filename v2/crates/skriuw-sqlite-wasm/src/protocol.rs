use serde::{Deserialize, Serialize};
use skriuw_domain::{
    OperationAck, SearchHit, WorkspaceArchive, WorkspaceOperationEnvelope, WorkspaceSnapshot,
};

pub const WORKER_PROTOCOL_VERSION: u16 = 1;
pub const MAX_REQUEST_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_OPERATIONS_PER_REQUEST: usize = 64;
pub const MAX_BATCHES_PER_REQUEST: usize = 64;
pub const MAX_QUERY_BYTES: usize = 4 * 1024;
pub const MAX_LAYOUT_BYTES: usize = 256 * 1024;
pub const MAX_EXPANDED_FOLDER_IDS: usize = 100_000;
pub const MAX_DATABASE_NAME_BYTES: usize = 128;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserWorkerRequest {
    pub protocol_version: u16,
    pub request_id: u64,
    #[serde(flatten)]
    pub command: BrowserWorkerCommand,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "payload",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum BrowserWorkerCommand {
    Initialize {
        database_name: String,
    },
    Bootstrap,
    LoadSidebarExpansion,
    SaveSidebarExpansion {
        folder_ids: Vec<String>,
    },
    LoadPaneLayout,
    SavePaneLayout {
        layout_json: String,
    },
    ApplyOperations {
        operations: Vec<WorkspaceOperationEnvelope>,
    },
    ApplyOperationBatches {
        batches: Vec<Vec<WorkspaceOperationEnvelope>>,
    },
    Search {
        query: String,
        limit: usize,
    },
    ExportArchive {
        exported_at: i64,
    },
    ReplaceFromArchive {
        archive: Box<WorkspaceArchive>,
    },
    IntegrityCheck,
    Close,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserWorkerResponse {
    pub protocol_version: u16,
    pub request_id: u64,
    #[serde(flatten)]
    pub outcome: BrowserWorkerOutcome,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", content = "value", rename_all = "snake_case")]
pub enum BrowserWorkerOutcome {
    Ok(BrowserWorkerValue),
    Error(BrowserStorageError),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum BrowserWorkerValue {
    Ready,
    Bootstrap(Box<WorkspaceSnapshot>),
    SidebarExpansion(Option<Vec<String>>),
    PaneLayout(Option<String>),
    Operation(OperationAck),
    OperationBatches(Vec<BatchOutcome>),
    Search(Vec<SearchHit>),
    Archive(Box<WorkspaceArchive>),
    ImportSummary(BrowserImportSummary),
    Integrity(BrowserIntegrityReport),
    Unit,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", content = "value", rename_all = "snake_case")]
pub enum BatchOutcome {
    Ok(OperationAck),
    Error(BrowserStorageError),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserImportSummary {
    pub nodes: usize,
    pub documents: usize,
    pub history_items: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserIntegrityReport {
    pub healthy: bool,
    pub issues: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserStorageErrorCode {
    UnsupportedBrowser,
    OpfsDenied,
    CrossOriginIsolationUnavailable,
    QuotaExceeded,
    MigrationFailed,
    DatabaseTooNew,
    CorruptDatabase,
    OpenFailed,
    WorkerCrashed,
    InvalidRequest,
    UnsupportedProtocol,
    Conflict,
    NotFound,
    AlreadyExists,
    Backend,
    NotReady,
    AlreadyInitialized,
    ShuttingDown,
    Shutdown,
    TimedOut,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserStorageError {
    pub code: BrowserStorageErrorCode,
    pub message: String,
    pub recovery: String,
    pub terminal: bool,
}

impl BrowserStorageError {
    pub(crate) fn new(
        code: BrowserStorageErrorCode,
        message: impl Into<String>,
        recovery: impl Into<String>,
        terminal: bool,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            recovery: recovery.into(),
            terminal,
        }
    }

    #[must_use]
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(
            BrowserStorageErrorCode::InvalidRequest,
            message,
            "Correct the request and retry.",
            false,
        )
    }
}

impl BrowserWorkerResponse {
    #[must_use]
    pub fn success(request_id: u64, value: BrowserWorkerValue) -> Self {
        Self {
            protocol_version: WORKER_PROTOCOL_VERSION,
            request_id,
            outcome: BrowserWorkerOutcome::Ok(value),
        }
    }

    #[must_use]
    pub fn failure(request_id: u64, error: BrowserStorageError) -> Self {
        Self {
            protocol_version: WORKER_PROTOCOL_VERSION,
            request_id,
            outcome: BrowserWorkerOutcome::Error(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialization_wire_shape_matches_the_typescript_bridge() {
        let request = BrowserWorkerRequest {
            protocol_version: WORKER_PROTOCOL_VERSION,
            request_id: 17,
            command: BrowserWorkerCommand::Initialize {
                database_name: "workspace.sqlite3".into(),
            },
        };
        let json = serde_json::to_value(request).expect("serialize request");
        assert_eq!(json["protocolVersion"], WORKER_PROTOCOL_VERSION);
        assert_eq!(json["requestId"], 17);
        assert_eq!(json["kind"], "initialize");
        assert_eq!(json["payload"]["databaseName"], "workspace.sqlite3");
    }

    #[test]
    fn response_wire_shape_has_one_terminal_outcome() {
        let response = BrowserWorkerResponse::success(29, BrowserWorkerValue::Ready);
        let json = serde_json::to_value(response).expect("serialize response");
        assert_eq!(json["protocolVersion"], WORKER_PROTOCOL_VERSION);
        assert_eq!(json["requestId"], 29);
        assert_eq!(json["status"], "ok");
        assert_eq!(json["value"]["kind"], "ready");
    }
}
