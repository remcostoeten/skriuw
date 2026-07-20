#[cfg(not(target_family = "wasm"))]
mod native;

#[cfg(not(target_family = "wasm"))]
pub use native::{
    GitHistoryError, GitHistoryIntegrityError, GitHistoryMaterializer, GitHistoryReader,
    HistoryIntegrityIssue, HistoryIntegrityReport, HistoryMetadataField,
};
