//! Background sync coordination shared by the desktop, mobile and browser
//! runtimes.
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
mod link;
mod origin;
#[cfg(not(target_arch = "wasm32"))]
mod runtime;
mod seal;
mod transport;
#[cfg(not(target_arch = "wasm32"))]
mod wake;

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
    SyncCoordinator, SyncCoordinatorConfig, SyncPollIntervals, SyncStatusObserver,
    SyncWorkspaceObserver, poll_interval_ms,
};
pub use cycle::{
    BLOCKED_OPERATION_REASON_ASSET_CONTENT_MISSING, BLOCKED_OPERATION_REASON_CLOUD_REJECTED,
    BLOCKED_REASON_AUTHORIZATION_DENIED, BLOCKED_REASON_BLOCKED_OPERATIONS,
    BLOCKED_REASON_ENCRYPTION_DOWNGRADE_REFUSED, BLOCKED_REASON_ENCRYPTION_KEY_REQUIRED,
    BLOCKED_REASON_LOG_TRUNCATED, BLOCKED_REASON_LOG_TRUNCATED_WITHOUT_CHECKPOINT,
    BLOCKED_REASON_PROTOCOL_MISMATCH, BLOCKED_REASON_PUSH_CONFLICT,
    BLOCKED_REASON_REJECTED_ACKNOWLEDGEMENT, BLOCKED_REASON_REJECTED_BATCH,
    BLOCKED_REASON_REJECTED_CHECKPOINT, BLOCKED_REASON_REJECTED_PULL,
    BLOCKED_REASON_SEALED_CONTENT_UNREADABLE, BLOCKED_REASON_SERVER_TOO_OLD,
    BLOCKED_REASON_STORAGE_FAILURE, CONSECUTIVE_REJECTIONS_BEFORE_PARKING,
    FULL_CHANGE_NOTE_THRESHOLD, MAX_BLOCKED_DETAIL_CHARS, PULL_APPLY_SUB_BATCH_OPERATIONS,
    RemoteChangeSet, SyncCycleConfig, SyncCycleOutcome, SyncCycleState, SyncStatus, run_sync_cycle,
    storage_failure as classify_storage_failure,
};
pub use http::{
    ERROR_CODE_NOT_FOUND, SyncHttpEndpoints, VALIDATION_DETAIL_QUOTA_EXCEEDED,
    VALIDATION_DETAIL_WORKSPACE_ENCRYPTED, classify_http_failure, classify_optional_route_failure,
    classify_rejected_response, rejected_error_code, request_timeout_ms,
};
pub use link::{
    ProvisionFailure, ProvisionedWorkspace, SyncLinkError, SyncProvisioner,
    classify_provision_status, decode_provisioned_workspace, plan_sync_link,
};
pub use origin::{
    CloudOriginPolicy, MAX_CLOUD_BASE_URL_BYTES, MAX_SESSION_TOKEN_BYTES, TrustedCloudOrigin,
    UntrustedCloudOrigin, is_well_formed_session_token, trusted_cloud_base_url,
};
#[cfg(not(target_arch = "wasm32"))]
pub use runtime::{
    MaintenanceSuspension, SyncCloud, SyncRuntime, SyncRuntimeConfig, SyncRuntimeError,
    SyncSessionToken, SyncWorkspace, SyncWorkspaceOpener, WorkspaceEncryptionState,
};
pub use seal::{
    WorkspaceSealer, derive_workspace_seal, enable_workspace_encryption, new_recovery_code,
    sealed_ciphertext_base64, unlock_workspace_encryption,
};
#[cfg(not(target_arch = "wasm32"))]
pub use transport::SystemClock;
pub use transport::{SyncCancellation, SyncClock, SyncTransport, TransportError};
#[cfg(not(target_arch = "wasm32"))]
pub use wake::{
    WakeConnectError, WakeConnector, WakeFrame, WakeListener, WakeListenerConfig, WakeSocket,
    WakeTarget, is_workspace_changed_message, run_wake_listener, websocket_url,
};
