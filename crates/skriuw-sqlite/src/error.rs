use std::any::Any;

use rusqlite::ErrorCode;
use skriuw_domain::OperationValidationError;
use skriuw_storage::StorageError;

/// SQLITE_BUSY and SQLITE_LOCKED are transient: another connection holds the
/// database and the same call succeeds shortly after. They surface as
/// `StorageError::Busy` so callers retry instead of parking work.
pub(crate) fn backend<E: std::fmt::Display + Any>(error: E) -> StorageError {
    if let Some(error) = (&error as &dyn Any).downcast_ref::<rusqlite::Error>()
        && is_busy(error)
    {
        return StorageError::Busy(error.to_string());
    }
    StorageError::Backend(error.to_string())
}

fn is_busy(error: &rusqlite::Error) -> bool {
    matches!(
        error,
        rusqlite::Error::SqliteFailure(failure, _)
            if matches!(failure.code, ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked)
    )
}

pub(crate) fn json_backend(error: serde_json::Error) -> StorageError {
    StorageError::Backend(format!("invalid persisted JSON: {error}"))
}

pub(crate) fn validation(error: OperationValidationError) -> StorageError {
    match error {
        OperationValidationError::UnsupportedProtocol(version) => {
            StorageError::UnsupportedProtocol(version)
        }
        error => StorageError::InvalidOperation(error.to_string()),
    }
}
