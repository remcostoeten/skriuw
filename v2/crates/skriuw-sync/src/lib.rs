//! Background sync coordination for the native desktop runtime.
//!
//! This crate owns the lifecycle between the durable SQLite sync queue
//! (`skriuw_storage::WorkspaceSyncQueue`) and an authenticated workspace sync
//! service reached through the narrow [`SyncTransport`] boundary. It never
//! runs on an interaction path: local commits, navigation, search, export,
//! and recovery proceed without consulting it, and a workspace without an
//! active sync connection produces no timers and no network work.
//!
//! Contract documentation lives in `v2/docs/specs/desktop-sync-coordinator.md`.

mod backoff;
mod checkpoint;
mod content;
mod coordinator;
mod cycle;
mod transport;

pub use backoff::{SyncBackoff, SyncBackoffConfig};
pub use checkpoint::{
    CheckpointPublication, CheckpointPublicationConfig, CheckpointPublicationState,
    run_checkpoint_publication,
};
pub use content::{
    SyncAssetStore, externalize_asset_content, externalize_oversized_operations,
    resolve_asset_content, resolve_chunked_operations,
};
pub use coordinator::{SyncCoordinator, SyncCoordinatorConfig, SyncStatusObserver};
pub use cycle::{
    BLOCKED_REASON_AUTHORIZATION_DENIED, BLOCKED_REASON_PROTOCOL_MISMATCH,
    BLOCKED_REASON_PUSH_CONFLICT, BLOCKED_REASON_REJECTED_ACKNOWLEDGEMENT,
    BLOCKED_REASON_REJECTED_BATCH, BLOCKED_REASON_REJECTED_CHECKPOINT,
    BLOCKED_REASON_STORAGE_FAILURE, SyncCycleConfig, SyncCycleOutcome, SyncStatus, run_sync_cycle,
};
pub use transport::{SyncCancellation, SyncClock, SyncTransport, SystemClock, TransportError};
