//! Linking a local workspace to the cloud workspace an account provisioned.
//!
//! Provisioning itself is a platform request; what its answer means is
//! shared, so every runtime refuses the same cross-account links and keeps a
//! device identity once it has one.

use serde::Deserialize;
use skriuw_storage::{NewSyncConnection, SyncConnection};
use thiserror::Error;

/// What `POST /v1/sync/provision` answers.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvisionedWorkspace {
    pub workspace_id: String,
    pub device_id: String,
}

/// Why provisioning produced no workspace.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ProvisionFailure {
    #[error("your Skriuw session expired; sign in again")]
    SessionExpired,
    #[error("this device is not allowed to use cloud sync")]
    Forbidden,
    #[error("Skriuw cloud is temporarily unavailable")]
    Unavailable,
    #[error("Skriuw cloud rejected the sync setup request")]
    Rejected,
    /// The request never produced a status.
    #[error("cloud provisioning failed: {0}")]
    Unreachable(String),
    #[error("cloud provisioning response was invalid: {0}")]
    InvalidResponse(String),
    #[error("cloud provisioning response was too large")]
    ResponseTooLarge,
}

/// Classifies a non-success provisioning status.
#[must_use]
pub fn classify_provision_status(status: u16) -> ProvisionFailure {
    match status {
        401 => ProvisionFailure::SessionExpired,
        403 => ProvisionFailure::Forbidden,
        500..=599 => ProvisionFailure::Unavailable,
        _ => ProvisionFailure::Rejected,
    }
}

/// Decodes a successful provisioning body.
pub fn decode_provisioned_workspace(body: &[u8]) -> Result<ProvisionedWorkspace, ProvisionFailure> {
    serde_json::from_slice(body)
        .map_err(|error| ProvisionFailure::InvalidResponse(error.to_string()))
}

/// The provisioning request a transport sends before sync can start.
pub trait SyncProvisioner: Send + Sync {
    fn provision(&self, device_id: &str) -> Result<ProvisionedWorkspace, ProvisionFailure>;
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum SyncLinkError {
    /// The local store already belongs to another cloud workspace. Linking it
    /// would merge two accounts' histories.
    #[error("this local workspace belongs to {linked}, not to {account}")]
    WorkspaceMismatch { linked: String, account: String },
    /// The local store already has a device identity and was offered another.
    #[error("this workspace already has a different device identity")]
    DeviceMismatch,
}

/// The connection to persist when `existing` is linked to `workspace_id` as
/// `device_id`. The observed server sequence survives a reconnect so the
/// next pull resumes where the last one stopped.
pub fn plan_sync_link(
    existing: Option<&SyncConnection>,
    workspace_id: &str,
    device_id: &str,
    connected_at: i64,
) -> Result<NewSyncConnection, SyncLinkError> {
    if let Some(existing) = existing {
        if existing.workspace_id != workspace_id {
            return Err(SyncLinkError::WorkspaceMismatch {
                linked: existing.workspace_id.clone(),
                account: workspace_id.to_string(),
            });
        }
        if existing.device_id != device_id {
            return Err(SyncLinkError::DeviceMismatch);
        }
    }
    Ok(NewSyncConnection {
        workspace_id: workspace_id.to_string(),
        device_id: device_id.to_string(),
        connected_at,
        observed_server_sequence: existing.map_or(0, |existing| existing.observed_server_sequence),
    })
}

#[cfg(test)]
mod tests {
    use skriuw_storage::SyncConnection;

    use super::{
        ProvisionFailure, SyncLinkError, classify_provision_status, decode_provisioned_workspace,
        plan_sync_link,
    };

    fn connection(workspace_id: &str, device_id: &str) -> SyncConnection {
        SyncConnection {
            workspace_id: workspace_id.into(),
            device_id: device_id.into(),
            connected_at: 1,
            observed_server_sequence: 42,
            next_client_sequence: 7,
            rehydrated_through: 0,
        }
    }

    #[test]
    fn a_first_link_starts_from_the_beginning_of_the_log() {
        let planned = plan_sync_link(None, "w", "d", 5).expect("link");
        assert_eq!(planned.observed_server_sequence, 0);
        assert_eq!(planned.connected_at, 5);
    }

    #[test]
    fn a_reconnect_keeps_the_observed_cursor() {
        let existing = connection("w", "d");
        let planned = plan_sync_link(Some(&existing), "w", "d", 5).expect("link");
        assert_eq!(planned.observed_server_sequence, 42);
    }

    #[test]
    fn a_store_linked_to_another_workspace_is_refused() {
        let existing = connection("w-1", "d");
        assert_eq!(
            plan_sync_link(Some(&existing), "w-2", "d", 5),
            Err(SyncLinkError::WorkspaceMismatch {
                linked: "w-1".into(),
                account: "w-2".into(),
            }),
        );
        assert_eq!(
            plan_sync_link(Some(&existing), "w-1", "other", 5),
            Err(SyncLinkError::DeviceMismatch),
        );
    }

    #[test]
    fn provisioning_statuses_map_to_actionable_failures() {
        assert_eq!(
            classify_provision_status(401),
            ProvisionFailure::SessionExpired
        );
        assert_eq!(classify_provision_status(403), ProvisionFailure::Forbidden);
        assert_eq!(
            classify_provision_status(503),
            ProvisionFailure::Unavailable
        );
        assert_eq!(classify_provision_status(400), ProvisionFailure::Rejected);
        assert!(matches!(
            decode_provisioned_workspace(b"{"),
            Err(ProvisionFailure::InvalidResponse(_)),
        ));
        assert_eq!(
            decode_provisioned_workspace(br#"{"workspaceId":"w","deviceId":"d"}"#)
                .expect("decoded")
                .workspace_id,
            "w",
        );
    }
}
