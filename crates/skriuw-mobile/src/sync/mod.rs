//! The sync half of the mobile facade: sign-in, E2EE replication, recovery,
//! and the resume strategy (`docs/specs/mobile-app.md`, R-F6 and R-Q1).
//!
//! The session lifecycle is `skriuw-sync`'s shared runtime, the same one the
//! desktop shell drives (ADR-0059). What differs is the lifecycle around it.
//! A phone's process is suspended rather than closed, so the correctness path
//! is the catch-up the shell runs when the application returns to the
//! foreground; the wake channel is a foreground-only latency optimization the
//! shell owns, and the background entry point is explicitly best-effort.
//!
//! Networking and blob storage are foreign ports (see [`network`]), so nothing
//! here opens a socket or holds a certificate root.

mod network;

use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use serde::Serialize;
use skriuw_sqlite::SqliteWorkspace;
use skriuw_sync::{
    CloudOriginPolicy, ProvisionFailure, RemoteChangeSet, SyncCloud, SyncHttpEndpoints,
    SyncRuntime, SyncRuntimeConfig, SyncRuntimeError, SyncSessionToken, SyncStatus,
    SyncStatusObserver, SyncWorkspaceObserver, SystemClock, TrustedCloudOrigin, WakeConnector,
    WakeListenerConfig, is_well_formed_session_token,
};

use network::{AssetBridge, NetworkTransport};
pub use network::{MobileAssetStore, MobileSyncNetwork, SyncRequest, SyncResponse};

use crate::{boundary::guarded, error::MobileError};

/// What the shell is told about sync without asking.
///
/// Every method is invoked from the coordinator's own thread, so an
/// implementation must hand the payload to the JavaScript side and return
/// rather than do work inline.
#[uniffi::export(with_foreign)]
pub trait MobileSyncObserver: Send + Sync {
    /// `WorkspaceSyncStatus` JSON, the same union the renderer bridge reads.
    fn status_changed(&self, status_json: String);
    /// `RemoteChangeSet` JSON: which notes a cycle changed, so the store
    /// reconciles only those instead of rebuilding.
    fn workspace_changed(&self, changes_json: String);
    /// The cloud session is gone. The shell clears the stored credential,
    /// stops its wake channel and offers sign-in; nothing local is discarded.
    fn session_expired(&self);
}

/// The phone's way to the cloud: the platform's own HTTP client behind
/// [`MobileSyncNetwork`]. The shell runs the wake channel itself, so the
/// runtime starts no listener.
struct MobileCloud {
    network: Arc<dyn MobileSyncNetwork>,
}

impl SyncCloud for MobileCloud {
    type Transport = NetworkTransport;

    fn open_transport(
        &self,
        session: SyncSessionToken,
        endpoints: SyncHttpEndpoints,
    ) -> Result<NetworkTransport, String> {
        Ok(NetworkTransport::new(
            Arc::clone(&self.network),
            session,
            endpoints,
        ))
    }

    fn wake_connector(&self) -> Option<Arc<dyn WakeConnector>> {
        None
    }
}

/// Sync for one workspace database.
///
/// A separate handle from [`crate::MobileWorkspace`] on purpose: the
/// coordinator owns its own database connection and keeps working while the
/// shell's own calls are in flight, exactly as the desktop runtime does.
#[derive(uniffi::Object)]
pub struct MobileSync {
    runtime: SyncRuntime<SqliteWorkspace, MobileCloud>,
    foreground: AtomicBool,
}

#[uniffi::export]
impl MobileSync {
    /// Attaches to the workspace database the shell already opened. Nothing
    /// connects, no timer starts and no request is made until
    /// [`MobileSync::connect`] is called with a session.
    #[uniffi::constructor]
    pub fn open(
        database_path: String,
        network: Arc<dyn MobileSyncNetwork>,
        assets: Option<Arc<dyn MobileAssetStore>>,
        observer: Option<Arc<dyn MobileSyncObserver>>,
    ) -> Result<Arc<Self>, MobileError> {
        guarded(|| {
            if database_path.trim().is_empty() {
                return Err(MobileError::workspace("workspace database path is empty"));
            }
            let database_path = PathBuf::from(database_path);
            Ok(Arc::new(Self {
                runtime: SyncRuntime::new(
                    Box::new(move || SqliteWorkspace::open(&database_path)),
                    MobileCloud { network },
                    SyncRuntimeConfig {
                        clock: Arc::new(SystemClock),
                        assets: Arc::new(AssetBridge::new(assets)),
                        status_observer: observer.clone().map(status_forwarder),
                        workspace_observer: observer.map(workspace_forwarder),
                        wake: WakeListenerConfig::default(),
                    },
                ),
                foreground: AtomicBool::new(true),
            }))
        })
    }

    /// `WorkspaceSyncStatus` JSON. Cheap enough for the shell to read whenever
    /// it renders the account surface.
    pub fn status(&self) -> String {
        encode_status(&self.runtime.status())
    }

    /// Where the shell's foreground wake channel connects, or `None` while
    /// nothing is connected. Built in the core so the endpoint shape keeps one
    /// owner and the shell never assembles a cloud URL of its own.
    pub fn wake_channel_url(&self) -> Option<String> {
        self.runtime.wake_channel_url()
    }

    /// Opens (or reopens) the authenticated session and starts replication.
    ///
    /// The shell names the cloud origin; it is validated here so a compromised
    /// JavaScript layer cannot point the bearer credential at an arbitrary
    /// host. Routing to this account's own workspace happens before this call
    /// ([`crate::adopt_workspace_slot`], ADR-0046), so the workspace guard in
    /// the runtime should be unreachable. It stays as the backstop that keeps
    /// a routing bug from becoming a cross-account write.
    pub fn connect(&self, token: String, base_url: String) -> Result<String, MobileError> {
        guarded(|| {
            let token = trusted_token(token)?;
            let origin = trusted_cloud_base_url(&base_url)?;
            self.runtime
                .connect(token, origin)
                .map(|status| encode_status(&status))
                .map_err(mobile_error)
        })
    }

    /// Installs a refreshed credential without reconnecting. Session refresh
    /// extends an expiry without rotating the token, so this is the ordinary
    /// path and a full reconnect is the exception.
    pub fn refresh_session(&self, token: String) -> Result<String, MobileError> {
        guarded(|| {
            let token = trusted_token(token)?;
            self.runtime
                .refresh_session(&token)
                .map(|status| encode_status(&status))
                .map_err(mobile_error)
        })
    }

    /// Stops network activity, preserving the durable outbox and the local
    /// database untouched. This is sign-out and "pause sync" both; coming back
    /// is a [`MobileSync::connect`].
    pub fn pause(&self) -> String {
        let _ = guarded(|| {
            self.runtime.pause();
            Ok(())
        });
        self.status()
    }

    /// The correctness path. Called when the application returns to the
    /// foreground: it clears durable retry delays and runs a cycle now rather
    /// than waiting for a poll or for a wake that a suspended process never
    /// received.
    pub fn catch_up(&self) -> String {
        self.signal(|runtime| {
            runtime.set_visibility(true, true);
            runtime.request_refresh();
        })
    }

    /// Best-effort: a silent push or a scheduled background task asked for a
    /// cycle. It requests one and returns. The platform may suspend the
    /// process mid-cycle and iOS gives no guarantee the task runs at all, so
    /// nothing depends on it having completed; [`MobileSync::catch_up`]
    /// repeats the work on resume.
    pub fn background_refresh(&self) -> String {
        self.signal(|runtime| {
            runtime.set_visibility(false, false);
            runtime.request_refresh();
        })
    }

    /// Foreground means the coordinator polls at its interactive cadence and
    /// the shell may run its wake channel. Background drops both: the platform
    /// suspends sockets behind it and iOS will not restore one.
    pub fn set_foreground(&self, foreground: bool) {
        let previous = self.foreground.swap(foreground, Ordering::Relaxed);
        self.signal(|runtime| {
            runtime.set_visibility(foreground, foreground);
            if foreground && !previous {
                runtime.request_refresh();
            }
        });
    }

    /// The shell's wake channel is up or down. It only changes the fallback
    /// poll cadence; sync is correct with the channel permanently down.
    pub fn set_wake_channel_connected(&self, connected: bool) {
        self.signal(|runtime| runtime.set_wake_channel_connected(connected));
    }

    /// The wake channel reported that another device changed the workspace.
    pub fn notify_remote_change(&self) {
        self.signal(SyncRuntime::notify_remote_change);
    }

    /// The shell's own reachability hint. Offline is scheduling advice rather
    /// than a gate: the coordinator keeps probing and any wake clears it.
    pub fn set_online(&self, online: bool) {
        self.signal(|runtime| runtime.set_online(online));
    }

    /// A local commit landed, so a push is due. Never called on the editing
    /// path itself: the shell batches first and calls this afterwards.
    pub fn note_local_commit(&self) {
        self.signal(SyncRuntime::notify_local_commit);
    }

    /// Cloud workspace this local store is linked to, if any. Read before
    /// routing an account so a store that predates the registry is recognised
    /// as belonging to the account that linked it (ADR-0046).
    pub fn linked_workspace_id(&self) -> Result<Option<String>, MobileError> {
        guarded(|| self.runtime.linked_workspace_id().map_err(mobile_error))
    }

    /// `SyncRecoveryView` JSON: the changes sync refused and the ones already
    /// discarded. Opens its own short-lived connection on the caller's thread
    /// and is never on an editing or navigation path.
    pub fn recovery_view(&self) -> Result<String, MobileError> {
        guarded(|| encode(&self.runtime.recovery_view().map_err(mobile_error)?))
    }

    pub fn retry_blocked_operation(&self, blocked_id: String) -> Result<String, MobileError> {
        guarded(|| {
            encode(
                &self
                    .runtime
                    .retry_blocked_operation(&blocked_id)
                    .map_err(mobile_error)?,
            )
        })
    }

    pub fn discard_blocked_operation(&self, blocked_id: String) -> Result<String, MobileError> {
        guarded(|| {
            encode(
                &self
                    .runtime
                    .discard_blocked_operation(&blocked_id)
                    .map_err(mobile_error)?,
            )
        })
    }

    /// What the recovery surface needs to describe this workspace's encryption
    /// without ever handling key material.
    pub fn encryption_state(&self) -> Result<String, MobileError> {
        guarded(|| encode(&self.runtime.encryption_state().map_err(mobile_error)?))
    }

    /// Turns encryption on and returns the recovery code exactly once. The
    /// code is never stored: only the key it derives is, so a lost code is
    /// unrecoverable by design and the cloud copy dies with it. The shell
    /// shows it and must not write it anywhere.
    pub fn enable_encryption(&self) -> Result<String, MobileError> {
        guarded(|| {
            let mut entropy = zeroize::Zeroizing::new([0_u8; 20]);
            getrandom::fill(entropy.as_mut_slice()).map_err(|error| {
                MobileError::internal(format!(
                    "could not gather randomness for the recovery code: {error}"
                ))
            })?;
            self.runtime
                .enable_encryption(entropy.as_slice())
                .map_err(mobile_error)
        })
    }

    /// Joins an already-encrypted workspace from this device. The code is
    /// checked against the key the cloud recorded before anything is stored.
    pub fn unlock_encryption(&self, recovery_code: String) -> Result<(), MobileError> {
        guarded(|| {
            self.runtime
                .unlock_encryption(&recovery_code)
                .map_err(mobile_error)
        })
    }

    /// Stops everything this handle started. Safe to call more than once, and
    /// safe to call when nothing was ever connected.
    pub fn shutdown(&self) {
        let _ = guarded(|| {
            self.runtime.shutdown();
            Ok(())
        });
    }
}

impl MobileSync {
    /// Runs a lifecycle signal and answers with the resulting status. Every
    /// signal is a no-op on a workspace that has never connected, which is
    /// what keeps a local-only installation free of timers and network work.
    fn signal(&self, action: impl FnOnce(&SyncRuntime<SqliteWorkspace, MobileCloud>)) -> String {
        let _ = guarded(|| {
            action(&self.runtime);
            Ok(())
        });
        self.status()
    }
}

fn status_forwarder(observer: Arc<dyn MobileSyncObserver>) -> SyncStatusObserver {
    Arc::new(move |status: &SyncStatus| {
        observer.status_changed(encode_status(status));
        if *status == SyncStatus::AuthenticationRequired {
            observer.session_expired();
        }
    })
}

fn workspace_forwarder(observer: Arc<dyn MobileSyncObserver>) -> SyncWorkspaceObserver {
    Arc::new(move |changes: &RemoteChangeSet| {
        if let Ok(payload) = serde_json::to_string(changes) {
            observer.workspace_changed(payload);
        }
    })
}

/// Recovery-relevant failures keep their own variant: an unopenable database
/// is `Recovery`, a refused credential is `SessionExpired`, and a store linked
/// to another account is `WorkspaceMismatch`.
fn mobile_error(error: SyncRuntimeError) -> MobileError {
    match error {
        SyncRuntimeError::OpenWorkspace(source) => MobileError::recovery(source.to_string()),
        SyncRuntimeError::Storage { source, .. } => MobileError::sync(source.to_string()),
        SyncRuntimeError::Provision(ProvisionFailure::SessionExpired) => {
            MobileError::SessionExpired
        }
        SyncRuntimeError::WorkspaceMismatch { linked, account } => {
            MobileError::WorkspaceMismatch { linked, account }
        }
        SyncRuntimeError::Unavailable => MobileError::internal("sync handle is poisoned"),
        other => MobileError::sync(other.to_string()),
    }
}

fn trusted_token(token: String) -> Result<String, MobileError> {
    if !is_well_formed_session_token(&token) {
        return Err(MobileError::sync(
            "a valid account session is required to enable sync",
        ));
    }
    Ok(token)
}

/// Accepts only the cloud origins this build trusts with the bearer
/// credential: `https` under a Skriuw-controlled suffix, or a development host
/// in debug builds, including the Android emulator's route to the host
/// machine, which is how a local Worker is reached during the two-device
/// convergence test.
fn trusted_cloud_base_url(base_url: &str) -> Result<TrustedCloudOrigin, MobileError> {
    let policy = if cfg!(debug_assertions) {
        CloudOriginPolicy::MOBILE_DEVELOPMENT
    } else {
        CloudOriginPolicy::RELEASE
    };
    skriuw_sync::trusted_cloud_base_url(base_url, policy).map_err(|_| MobileError::UntrustedCloud)
}

fn encode_status(status: &SyncStatus) -> String {
    // A closed set of plain values; a failure here would mean a bug in
    // `skriuw-sync`, and the shell still has to render something.
    serde_json::to_string(status).unwrap_or_else(|_| r#"{"state":"localOnly"}"#.to_string())
}

fn encode<T: Serialize>(value: &T) -> Result<String, MobileError> {
    serde_json::to_string(value).map_err(|error| MobileError::internal(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::{
        MobileSync, MobileSyncObserver, encode_status, network::SyncResponse,
        network::tests::RecordingNetwork, status_forwarder, trusted_cloud_base_url, trusted_token,
        workspace_forwarder,
    };
    use crate::error::MobileError;
    use skriuw_sync::SyncStatus;
    use std::{
        path::Path,
        sync::{Arc, Mutex},
    };
    use tempfile::tempdir;

    #[derive(Default)]
    struct RecordingObserver {
        statuses: Mutex<Vec<String>>,
        changes: Mutex<Vec<String>>,
        expiries: Mutex<usize>,
    }

    impl MobileSyncObserver for RecordingObserver {
        fn status_changed(&self, status_json: String) {
            self.statuses.lock().expect("statuses").push(status_json);
        }

        fn workspace_changed(&self, changes_json: String) {
            self.changes.lock().expect("changes").push(changes_json);
        }

        fn session_expired(&self) {
            *self.expiries.lock().expect("expiries") += 1;
        }
    }

    fn open(path: &Path, answers: Vec<Result<SyncResponse, MobileError>>) -> Arc<MobileSync> {
        MobileSync::open(
            path.to_string_lossy().into_owned(),
            RecordingNetwork::new(answers),
            None,
            None,
        )
        .expect("sync handle")
    }

    #[test]
    fn only_skriuw_origins_are_trusted_with_the_session_credential() {
        assert!(trusted_cloud_base_url("https://skriuw-v2-cloud.remcostoeten.workers.dev").is_ok());
        assert!(trusted_cloud_base_url("https://sync.skriuw.app").is_ok());
        assert!(trusted_cloud_base_url("https://evil.example").is_err());
        assert!(trusted_cloud_base_url("https://skriuw.app.evil.example").is_err());
        assert!(trusted_cloud_base_url("http://sync.skriuw.app").is_err());
        assert_eq!(
            trusted_cloud_base_url("http://10.0.2.2:8787").is_ok(),
            cfg!(debug_assertions)
        );
        assert!(trusted_cloud_base_url("http://localhost.evil.example").is_err());
        assert!(trusted_cloud_base_url("http://10.0.2.20:8787").is_err());
    }

    #[test]
    fn an_untrusted_origin_is_refused_before_the_credential_is_ever_sent() {
        assert!(matches!(
            trusted_cloud_base_url("https://evil.example"),
            Err(MobileError::UntrustedCloud),
        ));
        assert_eq!(
            trusted_cloud_base_url("https://sync.skriuw.app/")
                .expect("trusted")
                .as_str(),
            "https://sync.skriuw.app",
        );
    }

    #[test]
    fn a_malformed_credential_never_reaches_a_request() {
        assert!(trusted_token(String::new()).is_err());
        assert!(trusted_token("   ".into()).is_err());
        assert!(trusted_token("with\nnewline".into()).is_err());
        assert!(trusted_token("a".repeat(4_097)).is_err());
        assert_eq!(trusted_token("token".into()).expect("token"), "token");
    }

    #[test]
    fn a_new_handle_is_local_only_and_does_no_work() {
        let directory = tempdir().expect("tempdir");
        let sync = open(&directory.path().join("skriuw.db"), Vec::new());

        assert_eq!(sync.status(), r#"{"state":"localOnly"}"#);
        sync.note_local_commit();
        sync.set_online(false);
        sync.set_wake_channel_connected(true);
        sync.notify_remote_change();
        sync.set_foreground(false);
        assert_eq!(sync.catch_up(), r#"{"state":"localOnly"}"#);
        assert_eq!(sync.background_refresh(), r#"{"state":"localOnly"}"#);
        assert_eq!(sync.pause(), r#"{"state":"localOnly"}"#);
        sync.shutdown();
        assert_eq!(sync.status(), r#"{"state":"localOnly"}"#);
    }

    #[test]
    fn connecting_to_an_untrusted_cloud_never_opens_the_database() {
        let directory = tempdir().expect("tempdir");
        let database = directory.path().join("skriuw.db");
        let sync = open(&database, Vec::new());

        assert!(matches!(
            sync.connect("token".into(), "https://evil.example".into()),
            Err(MobileError::UntrustedCloud),
        ));
        assert!(!database.exists());
    }

    #[test]
    fn a_refused_session_leaves_the_workspace_unlinked() {
        let directory = tempdir().expect("tempdir");
        let sync = open(
            &directory.path().join("skriuw.db"),
            vec![Ok(SyncResponse::completed(401, Vec::new()))],
        );

        assert!(matches!(
            sync.connect("token".into(), "https://sync.skriuw.app".into()),
            Err(MobileError::SessionExpired),
        ));
        assert_eq!(sync.linked_workspace_id().expect("linked"), None);
        assert_eq!(sync.status(), r#"{"state":"localOnly"}"#);
    }

    #[test]
    fn a_store_linked_to_another_account_is_refused_rather_than_written_into() {
        let directory = tempdir().expect("tempdir");
        let database = directory.path().join("skriuw.db");
        let first = format!("w_{}", "a1".repeat(32));
        let second = format!("w_{}", "b2".repeat(32));
        let sync = open(
            &database,
            vec![
                Ok(SyncResponse::completed(
                    200,
                    format!(r#"{{"workspaceId":"{first}","deviceId":""}}"#).into_bytes(),
                )),
                Ok(SyncResponse::completed(
                    200,
                    format!(r#"{{"workspaceId":"{second}","deviceId":""}}"#).into_bytes(),
                )),
            ],
        );

        // The first connect provisions a device id the core generated, so the
        // fake echoes an empty one back and the mismatch guard fires first.
        assert!(matches!(
            sync.connect("token".into(), "https://sync.skriuw.app".into()),
            Err(MobileError::Sync { .. }),
        ));
        assert_eq!(sync.linked_workspace_id().expect("linked"), None);
    }

    #[test]
    fn refreshing_a_session_before_connecting_is_an_actionable_refusal() {
        let directory = tempdir().expect("tempdir");
        let sync = open(&directory.path().join("skriuw.db"), Vec::new());

        assert!(matches!(
            sync.refresh_session("token".into()),
            Err(MobileError::Sync { .. }),
        ));
    }

    #[test]
    fn an_unopenable_database_reports_recovery_rather_than_an_empty_view() {
        let directory = tempdir().expect("tempdir");
        let database = directory.path().join("skriuw.db");
        std::fs::write(&database, b"not a database").expect("write");
        let sync = open(&database, Vec::new());

        assert!(matches!(
            sync.recovery_view(),
            Err(MobileError::Recovery { .. }),
        ));
        assert!(matches!(
            sync.linked_workspace_id(),
            Err(MobileError::Recovery { .. }),
        ));
    }

    #[test]
    fn a_fresh_workspace_has_nothing_blocked_and_no_encryption() {
        let directory = tempdir().expect("tempdir");
        let sync = open(&directory.path().join("skriuw.db"), Vec::new());

        let recovery: serde_json::Value =
            serde_json::from_str(&sync.recovery_view().expect("recovery view")).expect("json");
        assert_eq!(recovery["blocked"], serde_json::json!([]));
        assert_eq!(recovery["discarded"], serde_json::json!([]));

        let encryption: serde_json::Value =
            serde_json::from_str(&sync.encryption_state().expect("encryption state"))
                .expect("json");
        assert_eq!(encryption["enabled"], serde_json::json!(false));
        assert_eq!(encryption["linked"], serde_json::json!(false));
        assert_eq!(sync.linked_workspace_id().expect("linked"), None);
    }

    #[test]
    fn encryption_cannot_be_changed_without_a_cloud_session() {
        let directory = tempdir().expect("tempdir");
        let sync = open(&directory.path().join("skriuw.db"), Vec::new());

        assert!(matches!(
            sync.enable_encryption(),
            Err(MobileError::Sync { .. }),
        ));
        assert!(matches!(
            sync.unlock_encryption("code".into()),
            Err(MobileError::Sync { .. }),
        ));
    }

    #[test]
    fn a_blocked_change_that_does_not_exist_is_refused_rather_than_ignored() {
        let directory = tempdir().expect("tempdir");
        let sync = open(&directory.path().join("skriuw.db"), Vec::new());

        assert!(sync.retry_blocked_operation("missing".into()).is_err());
        assert!(sync.discard_blocked_operation("missing".into()).is_err());
    }

    #[test]
    fn the_status_union_matches_the_shape_the_shell_renders() {
        assert_eq!(
            encode_status(&SyncStatus::Retrying {
                next_attempt_at: 42
            }),
            r#"{"state":"retrying","nextAttemptAt":42}"#,
        );
        assert_eq!(
            encode_status(&SyncStatus::AuthenticationRequired),
            r#"{"state":"authenticationRequired"}"#,
        );
    }

    #[test]
    fn an_observer_is_told_about_expiry_once_per_status_change() {
        let observer = Arc::new(RecordingObserver::default());
        let forward = status_forwarder(Arc::clone(&observer) as Arc<dyn MobileSyncObserver>);

        forward(&SyncStatus::Pending);
        forward(&SyncStatus::AuthenticationRequired);

        assert_eq!(
            *observer.statuses.lock().expect("statuses"),
            vec![
                r#"{"state":"pending"}"#.to_string(),
                r#"{"state":"authenticationRequired"}"#.to_string(),
            ],
        );
        assert_eq!(*observer.expiries.lock().expect("expiries"), 1);
    }

    #[test]
    fn remote_changes_reach_the_shell_as_the_change_set_the_store_reconciles() {
        let observer = Arc::new(RecordingObserver::default());
        let forward = workspace_forwarder(Arc::clone(&observer) as Arc<dyn MobileSyncObserver>);

        forward(&skriuw_sync::RemoteChangeSet {
            note_ids: vec!["note-1".into()],
            structure_changed: true,
            full: false,
        });

        assert_eq!(
            *observer.changes.lock().expect("changes"),
            vec![r#"{"noteIds":["note-1"],"structureChanged":true,"full":false}"#.to_string()],
        );
    }
}
