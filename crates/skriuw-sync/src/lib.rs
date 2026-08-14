//! Background sync coordination for the native desktop runtime.
//!
//! This crate owns the lifecycle between the durable SQLite sync queue
//! (`skriuw_storage::WorkspaceSyncQueue`) and an authenticated workspace sync
//! service reached through the narrow [`SyncTransport`] boundary. It never
//! runs on an interaction path: local commits, navigation, search, export,
//! and recovery proceed without consulting it, and a workspace without an
//! active sync connection produces no timers and no network work.
//!
//! Contract documentation lives in `docs/specs/desktop-sync-coordinator.md`.

mod backoff;
mod checkpoint;
mod content;
#[cfg(not(target_arch = "wasm32"))]
mod coordinator;
mod cycle;
mod http;
mod transport;

pub use backoff::{SyncBackoff, SyncBackoffConfig};
pub use checkpoint::{
    CheckpointPublication, CheckpointPublicationConfig, CheckpointPublicationState,
    run_checkpoint_publication,
};
pub use content::{
    AssetExternalization, SyncAssetStore, externalize_asset_content,
    externalize_oversized_operations, resolve_asset_content, resolve_chunked_operations,
};
#[cfg(not(target_arch = "wasm32"))]
pub use coordinator::{
    SyncCoordinator, SyncCoordinatorConfig, SyncStatusObserver, SyncWorkspaceObserver,
};
pub use cycle::{
    BLOCKED_OPERATION_REASON_ASSET_CONTENT_MISSING, BLOCKED_REASON_AUTHORIZATION_DENIED,
    BLOCKED_REASON_PROTOCOL_MISMATCH, BLOCKED_REASON_PUSH_CONFLICT,
    BLOCKED_REASON_REJECTED_ACKNOWLEDGEMENT, BLOCKED_REASON_REJECTED_BATCH,
    BLOCKED_REASON_REJECTED_CHECKPOINT, BLOCKED_REASON_STORAGE_FAILURE, SyncCycleConfig,
    SyncCycleOutcome, SyncStatus, run_sync_cycle,
};
pub use http::{SyncHttpEndpoints, classify_http_failure};
#[cfg(not(target_arch = "wasm32"))]
pub use transport::SystemClock;
pub use transport::{SyncCancellation, SyncClock, SyncTransport, TransportError};
