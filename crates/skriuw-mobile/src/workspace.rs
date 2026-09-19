use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
};

use serde::Serialize;
use skriuw_domain::{
    WorkspaceOperation, WorkspaceOperationEnvelope, count_words, validate_operation_group,
};
use skriuw_runtime::WorkspaceRuntime;
use skriuw_sqlite::SqliteWorkspace;

use crate::{boundary::guarded, error::MobileError};

/// The same file name the desktop shell opens inside a workspace directory, so
/// a directory copied between the two is the same workspace.
const DATABASE_FILE_NAME: &str = "skriuw.db";

/// A document body the caller wants written, as the generated document
/// contract. The word count is derived here from the product's own rule rather
/// than trusted from the caller, so a mobile client cannot drift from desktop.
#[derive(Debug, uniffi::Record)]
pub struct SaveDocumentRequest {
    pub note_id: String,
    /// `WorkspaceDocument.documentJson`, serialized.
    pub document_json: String,
    pub markdown: String,
    pub expected_revision: i64,
    pub at: i64,
}

/// An open workspace. Durable writes are serialized on one owner thread inside
/// `skriuw-runtime`; this facade holds no lock while a call is in flight, so a
/// foreign caller only ever waits behind another call's transaction for as
/// long as that transaction takes.
#[derive(uniffi::Object)]
pub struct MobileWorkspace {
    runtime: RwLock<Option<WorkspaceRuntime>>,
    database_path: PathBuf,
}

#[uniffi::export]
impl MobileWorkspace {
    /// Opens — creating if absent — the workspace inside `directory`.
    ///
    /// The caller owns the path: on Android it is the app's files directory,
    /// on iOS the application support directory. The core never derives a
    /// location of its own.
    #[uniffi::constructor]
    pub fn open(directory: String) -> Result<Arc<Self>, MobileError> {
        guarded(|| {
            let directory = prepare_directory(&directory)?;
            let database_path = directory.join(DATABASE_FILE_NAME);
            let workspace = SqliteWorkspace::open(&database_path)
                .map_err(|error| MobileError::recovery(error.to_string()))?;
            Ok(Arc::new(Self {
                runtime: RwLock::new(Some(WorkspaceRuntime::spawn(workspace))),
                database_path,
            }))
        })
    }

    /// The workspace file this handle owns, for the recovery surface and for
    /// diagnostics. Never used to locate a second workspace.
    #[must_use]
    pub fn database_path(&self) -> String {
        self.database_path.to_string_lossy().into_owned()
    }

    /// The whole canonical working set, as `WorkspaceSnapshot` JSON. Read once
    /// at startup and hydrated into the store; navigation never calls it.
    pub fn bootstrap(&self) -> Result<String, MobileError> {
        guarded(|| {
            let snapshot = self.runtime()?.bootstrap()?.wait()?;
            encode(&snapshot)
        })
    }

    /// Applies a group of `WorkspaceOperationEnvelope` values and returns the
    /// `OperationAck`, both as the generated contract JSON. The group is
    /// validated before it reaches storage, so a malformed batch is refused
    /// without touching the database.
    pub fn submit_operations(&self, operations_json: String) -> Result<String, MobileError> {
        guarded(|| {
            let operations: Vec<WorkspaceOperationEnvelope> =
                serde_json::from_str(&operations_json)
                    .map_err(|error| MobileError::invalid_payload(error.to_string()))?;
            self.apply(operations)
        })
    }

    /// The current body of one note, as `WorkspaceDocument` JSON.
    pub fn load_document(&self, note_id: String) -> Result<String, MobileError> {
        guarded(|| {
            let delta = self
                .runtime()?
                .read_workspace_delta(vec![note_id.clone()])?
                .wait()?;
            let document = delta
                .documents
                .into_iter()
                .find(|document| document.note_id == note_id)
                .ok_or(MobileError::NotFound { id: note_id })?;
            encode(&document)
        })
    }

    /// Writes one note body and returns the `OperationAck`. A stale
    /// `expected_revision` comes back as `MobileError::Conflict` with both
    /// revisions, never as a silent overwrite.
    pub fn save_document(&self, request: SaveDocumentRequest) -> Result<String, MobileError> {
        guarded(|| {
            let document_json = serde_json::from_str(&request.document_json)
                .map_err(|error| MobileError::invalid_payload(error.to_string()))?;
            self.apply(vec![WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::SaveDocument {
                    note_id: request.note_id,
                    document_json,
                    word_count: count_words(&request.markdown),
                    markdown: request.markdown,
                    expected_revision: request.expected_revision,
                    at: request.at,
                },
            )])
        })
    }

    /// Stops accepting work and waits for the owner thread to drain. Calls
    /// afterwards report `MobileError::Closed`. Shutting down twice is not an
    /// error.
    ///
    /// Not named `close`: UniFFI already gives every object an `AutoCloseable`
    /// `close` in Kotlin, and a second one collides with it.
    pub fn shutdown(&self) -> Result<(), MobileError> {
        guarded(|| {
            let runtime = self
                .runtime
                .write()
                .map_err(|_| MobileError::internal("workspace handle is poisoned"))?
                .take();
            match runtime {
                None => Ok(()),
                Some(runtime) => runtime.shutdown().map_err(MobileError::from),
            }
        })
    }
}

impl MobileWorkspace {
    fn runtime(&self) -> Result<WorkspaceRuntime, MobileError> {
        self.runtime
            .read()
            .map_err(|_| MobileError::internal("workspace handle is poisoned"))?
            .clone()
            .ok_or(MobileError::Closed)
    }

    fn apply(&self, operations: Vec<WorkspaceOperationEnvelope>) -> Result<String, MobileError> {
        validate_operation_group(&operations).map_err(|error| MobileError::Rejected {
            detail: error.to_string(),
        })?;
        let acknowledgement = self.runtime()?.apply_operations(operations)?.wait()?;
        encode(&acknowledgement)
    }
}

/// The protocol version this core speaks. The foreign side asserts it against
/// the version in its generated contracts at startup, so a stale native module
/// fails loudly instead of writing operations the core will refuse one by one.
#[uniffi::export]
#[must_use]
pub fn workspace_protocol_version() -> u16 {
    skriuw_domain::WORKSPACE_PROTOCOL_VERSION
}

fn prepare_directory(directory: &str) -> Result<PathBuf, MobileError> {
    let trimmed = directory.trim();
    if trimmed.is_empty() {
        return Err(MobileError::workspace("directory path is empty"));
    }
    let path = Path::new(trimmed);
    if path.exists() && !path.is_dir() {
        return Err(MobileError::workspace(format!(
            "{trimmed} exists and is not a directory"
        )));
    }
    fs::create_dir_all(path)
        .map_err(|error| MobileError::workspace(format!("{trimmed}: {error}")))?;
    Ok(path.to_path_buf())
}

fn encode<T: Serialize>(value: &T) -> Result<String, MobileError> {
    serde_json::to_string(value).map_err(|error| MobileError::internal(error.to_string()))
}
