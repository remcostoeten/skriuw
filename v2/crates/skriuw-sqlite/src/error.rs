use skriuw_domain::OperationValidationError;
use skriuw_storage::StorageError;

pub(crate) fn backend(error: impl std::fmt::Display) -> StorageError {
    StorageError::Backend(error.to_string())
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
