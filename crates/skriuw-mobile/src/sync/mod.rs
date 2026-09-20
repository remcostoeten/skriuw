//! The sync half of the mobile facade: sign-in, E2EE replication, recovery,
//! and the resume strategy (`docs/specs/mobile-app.md`, R-F6 and R-Q1).
//!
//! Everything durable stays behind `skriuw-sync`'s coordinator on its own
//! database connection, exactly as on desktop. What differs is the lifecycle.
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
        Arc, Mutex, RwLock,
        atomic::{AtomicBool, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{NewSyncConnection, SyncRecovery, WorkspaceSyncQueue};
use skriuw_sync::{
    RemoteChangeSet, SyncCancellation, SyncCoordinator, SyncCoordinatorConfig, SyncHttpEndpoints,
    SyncStatus, SyncStatusObserver, SyncTransport, SyncWorkspaceObserver, SystemClock,
    enable_workspace_encryption, unlock_workspace_encryption,
};
use uuid::Uuid;

use network::{AssetBridge, NetworkTransport, SharedToken};
pub use network::{MobileAssetStore, MobileSyncNetwork, SyncRequest, SyncResponse};

use crate::{boundary::guarded, error::MobileError};

const MAX_TOKEN_BYTES: usize = 4_096;
const MAX_BASE_URL_BYTES: usize = 2_048;

/// The encryption facts the recovery surface renders. Key material is
/// deliberately absent: the shell never needs it and must never hold it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceEncryptionState {
    enabled: bool,
    linked: bool,
    key_id: Option<String>,
    sealed_checkpoint_at: Option<i64>,
}

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

/// What a connected session established, kept so the shell can address its
/// own wake channel without reassembling a cloud URL.
struct Connection {
    endpoints: SyncHttpEndpoints,
    workspace_id: String,
    device_id: String,
}

/// Sync for one workspace database.
///
/// A separate handle from [`crate::MobileWorkspace`] on purpose: the
/// coordinator owns its own database connection and keeps working while the
/// shell's own calls are in flight, exactly as the desktop runtime does.
#[derive(uniffi::Object)]
pub struct MobileSync {
    database_path: PathBuf,
    network: Arc<dyn MobileSyncNetwork>,
    assets: Arc<AssetBridge>,
    observer: Option<Arc<dyn MobileSyncObserver>>,
    coordinator: Mutex<Option<Arc<SyncCoordinator>>>,
    session: Mutex<Option<SharedToken>>,
    transport: Mutex<Option<Arc<NetworkTransport>>>,
    connection: Mutex<Option<Connection>>,
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
            Ok(Arc::new(Self {
                database_path: PathBuf::from(database_path),
                network,
                assets: Arc::new(AssetBridge::new(assets)),
                observer,
                coordinator: Mutex::new(None),
                session: Mutex::new(None),
                transport: Mutex::new(None),
                connection: Mutex::new(None),
                foreground: AtomicBool::new(true),
            }))
        })
    }

    /// `WorkspaceSyncStatus` JSON. Cheap enough for the shell to read whenever
    /// it renders the account surface.
    pub fn status(&self) -> String {
        encode_status(&self.current_status())
    }

    /// Where the shell's foreground wake channel connects, or `None` while
    /// nothing is connected. Built here so the endpoint shape keeps one owner
    /// and the shell never assembles a cloud URL of its own.
    pub fn wake_channel_url(&self) -> Option<String> {
        let connection = self.connection.lock().ok()?;
        let connection = connection.as_ref()?;
        Some(
            connection
                .endpoints
                .events(&connection.workspace_id, &connection.device_id),
        )
    }

    /// Opens (or reopens) the authenticated session and starts replication.
    ///
    /// The shell names the cloud origin; it is validated here so a compromised
    /// JavaScript layer cannot point the bearer credential at an arbitrary
    /// host. Routing to this account's own workspace happens before this call
    /// ([`crate::adopt_workspace_slot`], ADR-0046), so the workspace guard
    /// below should be unreachable — it stays as the backstop that keeps a
    /// routing bug from becoming a cross-account write.
    pub fn connect(&self, token: String, base_url: String) -> Result<String, MobileError> {
        guarded(|| {
            let token = trusted_token(token)?;
            let base_url = trusted_cloud_base_url(&base_url)?;
            self.stop_replication();

            let queue = Arc::new(
                SqliteWorkspace::open(&self.database_path)
                    .map_err(|error| MobileError::recovery(error.to_string()))?,
            );
            let existing = queue
                .sync_connection()
                .map_err(|error| MobileError::sync(error.to_string()))?;
            let device_id = existing
                .as_ref()
                .map(|connection| connection.device_id.clone())
                .unwrap_or_else(|| Uuid::new_v4().simple().to_string());
            let session: SharedToken = Arc::new(RwLock::new(token));
            let transport = Arc::new(NetworkTransport::new(
                Arc::clone(&self.network),
                Arc::clone(&session),
                &base_url,
            ));
            let provisioned = transport.provision(&device_id)?;
            if provisioned.device_id != device_id {
                return Err(MobileError::sync(
                    "cloud provisioning returned a different device identity",
                ));
            }
            if let Some(linked) = existing
                .as_ref()
                .map(|connection| connection.workspace_id.as_str())
                && linked != provisioned.workspace_id
            {
                return Err(MobileError::WorkspaceMismatch {
                    linked: linked.to_owned(),
                    account: provisioned.workspace_id,
                });
            }
            queue
                .connect_sync(&NewSyncConnection {
                    workspace_id: provisioned.workspace_id.clone(),
                    device_id: device_id.clone(),
                    connected_at: now_millis(),
                    observed_server_sequence: existing
                        .map_or(0, |connection| connection.observed_server_sequence),
                })
                .map_err(|error| MobileError::sync(error.to_string()))?;

            let foreground = self.foreground.load(Ordering::Relaxed);
            let coordinator = Arc::new(SyncCoordinator::spawn(
                Arc::clone(&queue) as Arc<dyn WorkspaceSyncQueue>,
                queue,
                Arc::clone(&transport) as Arc<dyn SyncTransport>,
                Arc::clone(&self.assets) as Arc<dyn skriuw_sync::SyncAssetStore>,
                Arc::new(SystemClock),
                SyncCoordinatorConfig {
                    status_observer: self.status_observer(),
                    workspace_observer: self.workspace_observer(),
                    session_token: Some(Arc::clone(&session)),
                    ..SyncCoordinatorConfig::default()
                },
            ));
            coordinator.set_visibility(foreground, foreground);
            let status = coordinator.status();
            self.store(
                &self.connection,
                Some(Connection {
                    endpoints: SyncHttpEndpoints::new(&base_url),
                    workspace_id: provisioned.workspace_id,
                    device_id,
                }),
            )?;
            self.store(&self.transport, Some(transport))?;
            self.store(&self.session, Some(session))?;
            self.store(&self.coordinator, Some(coordinator))?;
            Ok(encode_status(&status))
        })
    }

    /// Installs a refreshed credential without reconnecting. Session refresh
    /// extends an expiry without rotating the token, so this is the ordinary
    /// path and a full reconnect is the exception.
    pub fn refresh_session(&self, token: String) -> Result<String, MobileError> {
        guarded(|| {
            let token = trusted_token(token)?;
            let coordinator = self
                .coordinator()?
                .ok_or_else(|| MobileError::sync("sync is not connected"))?;
            coordinator.resume_with_session(&token);
            Ok(encode_status(&coordinator.status()))
        })
    }

    /// Stops network activity, preserving the durable outbox and the local
    /// database untouched. This is sign-out and "pause sync" both; coming back
    /// is a [`MobileSync::connect`].
    pub fn pause(&self) -> String {
        let _ = guarded(|| {
            self.stop_replication();
            Ok(())
        });
        encode_status(&self.current_status())
    }

    /// The correctness path. Called when the application returns to the
    /// foreground: it clears durable retry delays and runs a cycle now rather
    /// than waiting for a poll or for a wake that a suspended process never
    /// received.
    pub fn catch_up(&self) -> String {
        self.with_coordinator(|coordinator| {
            coordinator.set_visibility(true, true);
            coordinator.request_refresh();
        })
    }

    /// Best-effort: a silent push or a scheduled background task asked for a
    /// cycle. It requests one and returns. The platform may suspend the
    /// process mid-cycle and iOS gives no guarantee the task runs at all, so
    /// nothing depends on it having completed — [`MobileSync::catch_up`]
    /// repeats the work on resume.
    pub fn background_refresh(&self) -> String {
        self.with_coordinator(|coordinator| {
            coordinator.set_visibility(false, false);
            coordinator.request_refresh();
        })
    }

    /// Foreground means the coordinator polls at its interactive cadence and
    /// the shell may run its wake channel. Background drops both: the platform
    /// suspends sockets behind it and iOS will not restore one.
    pub fn set_foreground(&self, foreground: bool) {
        let previous = self.foreground.swap(foreground, Ordering::Relaxed);
        self.with_coordinator(|coordinator| {
            coordinator.set_visibility(foreground, foreground);
            if foreground && !previous {
                coordinator.request_refresh();
            }
        });
    }

    /// The shell's wake channel is up or down. It only changes the fallback
    /// poll cadence; sync is correct with the channel permanently down.
    pub fn set_wake_channel_connected(&self, connected: bool) {
        self.with_coordinator(|coordinator| coordinator.set_wake_channel_connected(connected));
    }

    /// The wake channel reported that another device changed the workspace.
    pub fn notify_remote_change(&self) {
        self.with_coordinator(SyncCoordinator::notify_remote_change);
    }

    /// The shell's own reachability hint. Offline is scheduling advice rather
    /// than a gate: the coordinator keeps probing and any wake clears it.
    pub fn set_online(&self, online: bool) {
        self.with_coordinator(|coordinator| coordinator.set_online(online));
    }

    /// A local commit landed, so a push is due. Never called on the editing
    /// path itself: the shell batches first and calls this afterwards.
    pub fn note_local_commit(&self) {
        self.with_coordinator(SyncCoordinator::notify_local_commit);
    }

    /// Cloud workspace this local store is linked to, if any. Read before
    /// routing an account so a store that predates the registry is recognised
    /// as belonging to the account that linked it (ADR-0046).
    pub fn linked_workspace_id(&self) -> Result<Option<String>, MobileError> {
        guarded(|| {
            Ok(self
                .workspace()?
                .sync_connection()
                .map_err(|error| MobileError::sync(error.to_string()))?
                .map(|connection| connection.workspace_id))
        })
    }

    /// `SyncRecoveryView` JSON: the changes sync refused and the ones already
    /// discarded. Opens its own short-lived connection on the caller's thread
    /// and is never on an editing or navigation path.
    pub fn recovery_view(&self) -> Result<String, MobileError> {
        guarded(|| {
            encode(
                &self
                    .workspace()?
                    .sync_recovery_view()
                    .map_err(|error| MobileError::sync(error.to_string()))?,
            )
        })
    }

    pub fn retry_blocked_operation(&self, blocked_id: String) -> Result<String, MobileError> {
        guarded(|| {
            let workspace = self.workspace()?;
            workspace
                .retry_blocked_sync_operation(&blocked_id, now_millis())
                .map_err(|error| MobileError::sync(error.to_string()))?;
            let _ = self.with_coordinator(SyncCoordinator::request_refresh);
            encode(
                &workspace
                    .sync_recovery_view()
                    .map_err(|error| MobileError::sync(error.to_string()))?,
            )
        })
    }

    pub fn discard_blocked_operation(&self, blocked_id: String) -> Result<String, MobileError> {
        guarded(|| {
            let workspace = self.workspace()?;
            workspace
                .discard_blocked_sync_operation(&blocked_id, now_millis())
                .map_err(|error| MobileError::sync(error.to_string()))?;
            let _ = self.with_coordinator(SyncCoordinator::request_refresh);
            encode(
                &workspace
                    .sync_recovery_view()
                    .map_err(|error| MobileError::sync(error.to_string()))?,
            )
        })
    }

    /// What the recovery surface needs to describe this workspace's encryption
    /// without ever handling key material.
    pub fn encryption_state(&self) -> Result<String, MobileError> {
        guarded(|| {
            let workspace = self.workspace()?;
            let seal = workspace
                .workspace_seal()
                .map_err(|error| MobileError::sync(error.to_string()))?;
            let linked = workspace
                .sync_connection()
                .map_err(|error| MobileError::sync(error.to_string()))?
                .is_some();
            encode(&WorkspaceEncryptionState {
                enabled: seal.is_some(),
                linked,
                key_id: seal.as_ref().map(|seal| seal.key_id.clone()),
                sealed_checkpoint_at: seal.as_ref().and_then(|seal| seal.sealed_checkpoint_at),
            })
        })
    }

    /// Turns encryption on and returns the recovery code exactly once. The
    /// code is never stored: only the key it derives is, so a lost code is
    /// unrecoverable by design and the cloud copy dies with it. The shell
    /// shows it and must not write it anywhere.
    pub fn enable_encryption(&self) -> Result<String, MobileError> {
        guarded(|| {
            let workspace = self.workspace()?;
            let transport = self.cloud_transport()?;
            let mut entropy = zeroize::Zeroizing::new([0_u8; 20]);
            getrandom::fill(entropy.as_mut_slice()).map_err(|error| {
                MobileError::internal(format!(
                    "could not gather randomness for the recovery code: {error}"
                ))
            })?;
            let recovery_code = enable_workspace_encryption(
                &workspace,
                transport.as_ref(),
                &SyncCancellation::new(),
                entropy.as_slice(),
                now_millis(),
            )
            .map_err(MobileError::sync)?;
            let _ = self.with_coordinator(SyncCoordinator::request_refresh);
            Ok(recovery_code)
        })
    }

    /// Joins an already-encrypted workspace from this device. The code is
    /// checked against the key the cloud recorded before anything is stored.
    pub fn unlock_encryption(&self, recovery_code: String) -> Result<(), MobileError> {
        guarded(|| {
            let workspace = self.workspace()?;
            let transport = self.cloud_transport()?;
            unlock_workspace_encryption(
                &workspace,
                transport.as_ref(),
                &SyncCancellation::new(),
                &recovery_code,
                now_millis(),
            )
            .map_err(MobileError::sync)?;
            let _ = self.with_coordinator(SyncCoordinator::request_refresh);
            Ok(())
        })
    }

    /// Stops everything this handle started. Safe to call more than once, and
    /// safe to call when nothing was ever connected.
    pub fn shutdown(&self) {
        let _ = guarded(|| {
            self.stop_replication();
            Ok(())
        });
    }
}

impl MobileSync {
    fn status_observer(&self) -> Option<SyncStatusObserver> {
        let observer = self.observer.clone()?;
        let forward: SyncStatusObserver = Arc::new(move |status: &SyncStatus| {
            observer.status_changed(encode_status(status));
            if *status == SyncStatus::AuthenticationRequired {
                observer.session_expired();
            }
        });
        Some(forward)
    }

    fn workspace_observer(&self) -> Option<SyncWorkspaceObserver> {
        let observer = self.observer.clone()?;
        let forward: SyncWorkspaceObserver = Arc::new(move |changes: &RemoteChangeSet| {
            if let Ok(payload) = serde_json::to_string(changes) {
                observer.workspace_changed(payload);
            }
        });
        Some(forward)
    }

    fn workspace(&self) -> Result<SqliteWorkspace, MobileError> {
        SqliteWorkspace::open(&self.database_path)
            .map_err(|error| MobileError::recovery(error.to_string()))
    }

    fn coordinator(&self) -> Result<Option<Arc<SyncCoordinator>>, MobileError> {
        Ok(self
            .coordinator
            .lock()
            .map_err(|_| MobileError::internal("sync handle is poisoned"))?
            .clone())
    }

    fn current_status(&self) -> SyncStatus {
        self.coordinator
            .lock()
            .ok()
            .and_then(|coordinator| coordinator.as_ref().map(|coordinator| coordinator.status()))
            .unwrap_or(SyncStatus::LocalOnly)
    }

    /// Runs `action` against the live coordinator, if there is one, and
    /// answers with the resulting status. Every lifecycle signal is a no-op on
    /// a workspace that has never connected, which is what keeps a local-only
    /// installation free of timers and network work.
    fn with_coordinator(&self, action: impl Fn(&SyncCoordinator)) -> String {
        let _ = guarded(|| {
            if let Some(coordinator) = self.coordinator()? {
                action(coordinator.as_ref());
            }
            Ok(())
        });
        encode_status(&self.current_status())
    }

    fn cloud_transport(&self) -> Result<Arc<NetworkTransport>, MobileError> {
        self.transport
            .lock()
            .map_err(|_| MobileError::internal("sync handle is poisoned"))?
            .clone()
            .ok_or_else(|| MobileError::sync("sign in to Skriuw cloud before changing encryption"))
    }

    fn store<T>(&self, slot: &Mutex<Option<T>>, value: Option<T>) -> Result<(), MobileError> {
        *slot
            .lock()
            .map_err(|_| MobileError::internal("sync handle is poisoned"))? = value;
        Ok(())
    }

    fn stop_replication(&self) {
        let coordinator = self
            .coordinator
            .lock()
            .ok()
            .and_then(|mut coordinator| coordinator.take());
        if let Some(coordinator) = coordinator {
            coordinator.shutdown();
        }
        let _ = self.store(&self.transport, None);
        let _ = self.store(&self.session, None);
        let _ = self.store(&self.connection, None);
    }
}

impl Drop for MobileSync {
    fn drop(&mut self) {
        self.stop_replication();
    }
}

fn trusted_token(token: String) -> Result<String, MobileError> {
    if token.trim().is_empty()
        || token.len() > MAX_TOKEN_BYTES
        || token.chars().any(char::is_control)
    {
        return Err(MobileError::sync(
            "a valid account session is required to enable sync",
        ));
    }
    Ok(token)
}

/// Accepts only the cloud origins this build trusts with the bearer
/// credential: `https` under a Skriuw-controlled suffix, or a development host
/// in debug builds. `10.0.2.2` is the Android emulator's route to the host
/// machine, which is how a local Worker is reached from an emulator during the
/// two-device convergence test.
fn trusted_cloud_base_url(base_url: &str) -> Result<String, MobileError> {
    let trimmed = base_url.trim().trim_end_matches('/');
    let trusted = trimmed.len() <= MAX_BASE_URL_BYTES
        && !trimmed.contains(['?', '#', '@', ' '])
        && (is_trusted_https_origin(trimmed)
            || (cfg!(debug_assertions) && is_local_development_origin(trimmed)));
    if trusted {
        Ok(trimmed.to_string())
    } else {
        Err(MobileError::UntrustedCloud)
    }
}

fn is_trusted_https_origin(base_url: &str) -> bool {
    let Some(rest) = base_url.strip_prefix("https://") else {
        return false;
    };
    let host = rest.split(['/', ':']).next().unwrap_or_default();
    !host.is_empty() && (host.ends_with(".skriuw.app") || host.ends_with(".workers.dev"))
}

fn is_local_development_origin(base_url: &str) -> bool {
    ["http://localhost", "http://127.0.0.1", "http://10.0.2.2"]
        .iter()
        .any(|prefix| {
            base_url.strip_prefix(prefix).is_some_and(|rest| {
                rest.is_empty() || rest.starts_with(':') || rest.starts_with('/')
            })
        })
}

fn encode_status(status: &SyncStatus) -> String {
    // A closed set of plain values; a failure here would mean a bug in
    // `skriuw-sync`, and the shell still has to render something.
    serde_json::to_string(status).unwrap_or_else(|_| r#"{"state":"localOnly"}"#.to_string())
}

fn encode<T: Serialize>(value: &T) -> Result<String, MobileError> {
    serde_json::to_string(value).map_err(|error| MobileError::internal(error.to_string()))
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::{
        MobileSync, MobileSyncObserver, encode_status, is_local_development_origin,
        is_trusted_https_origin, network::SyncResponse, network::tests::RecordingNetwork,
        trusted_cloud_base_url, trusted_token,
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
        assert!(is_trusted_https_origin(
            "https://skriuw-v2-cloud.remcostoeten.workers.dev"
        ));
        assert!(is_trusted_https_origin("https://sync.skriuw.app"));
        assert!(!is_trusted_https_origin("https://evil.example"));
        assert!(!is_trusted_https_origin("https://skriuw.app.evil.example"));
        assert!(!is_trusted_https_origin("http://sync.skriuw.app"));
        assert!(is_local_development_origin("http://localhost:8787"));
        assert!(is_local_development_origin("http://10.0.2.2:8787"));
        assert!(!is_local_development_origin(
            "http://localhost.evil.example"
        ));
        assert!(!is_local_development_origin("http://10.0.2.20:8787"));
    }

    #[test]
    fn an_untrusted_origin_is_refused_before_the_credential_is_ever_sent() {
        assert!(matches!(
            trusted_cloud_base_url("https://evil.example"),
            Err(MobileError::UntrustedCloud),
        ));
        assert_eq!(
            trusted_cloud_base_url("https://sync.skriuw.app/").expect("trusted"),
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
        let directory = tempdir().expect("tempdir");
        let sync = MobileSync::open(
            directory
                .path()
                .join("skriuw.db")
                .to_string_lossy()
                .into_owned(),
            RecordingNetwork::new(Vec::new()),
            None,
            Some(Arc::clone(&observer) as Arc<dyn MobileSyncObserver>),
        )
        .expect("sync handle");
        let forward = sync.status_observer().expect("observer installed");

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
        let directory = tempdir().expect("tempdir");
        let sync = MobileSync::open(
            directory
                .path()
                .join("skriuw.db")
                .to_string_lossy()
                .into_owned(),
            RecordingNetwork::new(Vec::new()),
            None,
            Some(Arc::clone(&observer) as Arc<dyn MobileSyncObserver>),
        )
        .expect("sync handle");
        let forward = sync.workspace_observer().expect("observer installed");

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
