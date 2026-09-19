use std::any::Any;

use skriuw_domain::OperationValidationError;
use skriuw_runtime::RuntimeError;
use skriuw_storage::StorageError;
use thiserror::Error;

/// Diagnostics that cross the boundary stay bounded: a device log line and a
/// recovery sheet both have to render them, and an unbounded SQLite message
/// can carry a whole statement.
const MAX_DETAIL_CHARS: usize = 512;

/// Every failure the foreign side can act on differently. Callers branch on
/// the variant; `detail` is for the recovery surface and the log, never for
/// control flow.
#[derive(Debug, Error, uniffi::Error)]
pub enum MobileError {
    /// The caller-supplied directory cannot hold a workspace.
    #[error("workspace directory is unusable: {detail}")]
    Workspace { detail: String },
    /// The database exists but could not be opened or migrated. This is the
    /// startup failure surface: offer restore, reset or a different slot.
    #[error("workspace database needs recovery: {detail}")]
    Recovery { detail: String },
    /// The JSON payload is not the workspace contract it claims to be.
    #[error("payload is not valid workspace JSON: {detail}")]
    InvalidPayload { detail: String },
    /// The operation is well-formed but the core refused it.
    #[error("workspace operation was rejected: {detail}")]
    Rejected { detail: String },
    /// The protocol version in the envelope is not the one this core speaks.
    #[error("unsupported workspace protocol version {version}")]
    UnsupportedProtocol { version: u16 },
    /// Another writer moved the entity on; reload and retry.
    #[error("{id} changed underneath this device: expected {expected}, current {current}")]
    Conflict {
        id: String,
        expected: i64,
        current: i64,
    },
    #[error("entity was not found: {id}")]
    NotFound { id: String },
    #[error("target already exists: {id}")]
    AlreadyExists { id: String },
    /// Transient: the same call succeeds shortly after.
    #[error("workspace is busy: {detail}")]
    Busy { detail: String },
    /// The workspace handle was closed, or its owner thread is gone.
    #[error("workspace is closed")]
    Closed,
    /// A bug in the core, including a panic caught at the boundary.
    #[error("internal failure: {detail}")]
    Internal { detail: String },
}

impl MobileError {
    pub(crate) fn workspace(detail: impl AsRef<str>) -> Self {
        Self::Workspace {
            detail: bounded(detail),
        }
    }

    pub(crate) fn recovery(detail: impl AsRef<str>) -> Self {
        Self::Recovery {
            detail: bounded(detail),
        }
    }

    pub(crate) fn invalid_payload(detail: impl AsRef<str>) -> Self {
        Self::InvalidPayload {
            detail: bounded(detail),
        }
    }

    pub(crate) fn internal(detail: impl AsRef<str>) -> Self {
        Self::Internal {
            detail: bounded(detail),
        }
    }
}

impl From<StorageError> for MobileError {
    fn from(error: StorageError) -> Self {
        match error {
            StorageError::UnsupportedProtocol(version) => Self::UnsupportedProtocol { version },
            StorageError::NotFound(id) => Self::NotFound { id: bounded(id) },
            StorageError::RevisionConflict {
                id,
                expected,
                current,
            } => Self::Conflict {
                id: bounded(id),
                expected,
                current,
            },
            StorageError::InvalidOperation(detail) | StorageError::ReleaseRequired(detail) => {
                Self::Rejected {
                    detail: bounded(detail),
                }
            }
            StorageError::AlreadyExists(id) => Self::AlreadyExists { id: bounded(id) },
            StorageError::Busy(detail) => Self::Busy {
                detail: bounded(detail),
            },
            StorageError::Backend(detail) => Self::Internal {
                detail: bounded(detail),
            },
        }
    }
}

impl From<RuntimeError> for MobileError {
    fn from(error: RuntimeError) -> Self {
        match error {
            // Deliberately not `Closed`. A handle the caller still holds open
            // whose runtime stopped answering is a crashed owner thread, and
            // the shell must be able to tell that from its own teardown.
            RuntimeError::Unavailable => Self::internal("storage runtime stopped accepting work"),
            RuntimeError::WorkerFailure => Self::internal("storage worker terminated abnormally"),
            RuntimeError::Storage(error) => Self::from(error),
        }
    }
}

impl From<OperationValidationError> for MobileError {
    fn from(error: OperationValidationError) -> Self {
        match error {
            // The one validation failure the foreign side acts on differently:
            // a native module older than the core it loaded cannot be fixed by
            // retrying or editing the note, only by updating the application.
            OperationValidationError::UnsupportedProtocol(version) => {
                Self::UnsupportedProtocol { version }
            }
            error => Self::Rejected {
                detail: bounded(error.to_string()),
            },
        }
    }
}

/// Turns a caught panic payload into an actionable detail string. A panic must
/// never unwind into the foreign caller, so the boundary converts it here.
pub(crate) fn panic_detail(payload: Box<dyn Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<&'static str>() {
        return bounded(message);
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return bounded(message);
    }
    "panic with a non-string payload".into()
}

fn bounded(detail: impl AsRef<str>) -> String {
    let detail = detail.as_ref();
    match detail.char_indices().nth(MAX_DETAIL_CHARS) {
        None => detail.to_owned(),
        Some((index, _)) => format!("{}…", &detail[..index]),
    }
}

#[cfg(test)]
mod tests {
    use super::{MAX_DETAIL_CHARS, MobileError, StorageError, bounded, panic_detail};

    #[test]
    fn details_are_bounded() {
        let truncated = bounded("é".repeat(MAX_DETAIL_CHARS * 2));
        assert_eq!(truncated.chars().count(), MAX_DETAIL_CHARS + 1);
        assert!(truncated.ends_with('…'));
        assert_eq!(bounded("short"), "short");
    }

    #[test]
    fn revision_conflicts_keep_both_revisions() {
        let error = MobileError::from(StorageError::RevisionConflict {
            id: "note-1".into(),
            expected: 3,
            current: 5,
        });
        assert!(matches!(
            error,
            MobileError::Conflict {
                expected: 3,
                current: 5,
                ..
            }
        ));
    }

    #[test]
    fn panic_payloads_become_details() {
        let payload =
            std::panic::catch_unwind(|| panic!("boundary panic")).expect_err("closure must panic");
        assert_eq!(panic_detail(payload), "boundary panic");
    }
}
