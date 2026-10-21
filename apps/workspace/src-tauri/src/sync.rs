use std::{
    io::Read,
    net::TcpStream,
    path::PathBuf,
    sync::{
        Arc, Mutex, MutexGuard, RwLock, RwLockReadGuard, Weak,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use reqwest::{Method, StatusCode, blocking::Client};
use serde::Deserialize;
use skriuw_domain::{
    SyncPullResponse, SyncPushRequest, SyncPushResponse, SyncRecoveryView, WorkspaceCheckpoint,
    WorkspaceEncryptionMarker,
};
use skriuw_images::ImageStore;
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{NewSyncConnection, SyncRecovery, WorkspaceSyncQueue};
use skriuw_sync::{
    SyncAssetStore, SyncCancellation, SyncCoordinator, SyncCoordinatorConfig, SyncHttpEndpoints,
    SyncStatus, SyncTransport, SyncWorkspaceObserver, SystemClock, TransportError,
    classify_http_failure, classify_optional_route_failure, classify_rejected_response,
    enable_workspace_encryption, rejected_error_code, request_timeout_ms,
    unlock_workspace_encryption,
};
use uuid::Uuid;

/// The encryption facts the settings surface renders. Key material is
/// deliberately absent: the renderer never needs it and must never hold it.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEncryptionState {
    pub enabled: bool,
    pub linked: bool,
    pub key_id: Option<String>,
    pub sealed_checkpoint_at: Option<i64>,
}

pub type SessionExpiredObserver = Arc<dyn Fn() + Send + Sync>;
type SharedToken = Arc<RwLock<String>>;

/// Bridges the sync coordinator to the workspace image blob store. Reads and
/// writes stay off interaction paths because the coordinator only calls this
/// from its background worker thread.
struct ImageAssetStore {
    blob_directory: PathBuf,
}

impl SyncAssetStore for ImageAssetStore {
    fn read_asset(&self, content_hash: &str, mime_type: &str) -> Result<Option<Vec<u8>>, String> {
        let store = ImageStore::open(&self.blob_directory).map_err(|error| error.to_string())?;
        if !store
            .exists(content_hash, mime_type)
            .map_err(|error| error.to_string())?
        {
            return Ok(None);
        }
        store
            .read(content_hash, mime_type)
            .map(Some)
            .map_err(|error| error.to_string())
    }

    fn store_asset(
        &self,
        content_hash: &str,
        _mime_type: &str,
        bytes: &[u8],
    ) -> Result<(), String> {
        let store = ImageStore::open(&self.blob_directory).map_err(|error| error.to_string())?;
        let stored = store.put(bytes).map_err(|error| error.to_string())?;
        if stored.content_hash != content_hash {
            return Err("stored asset bytes do not match their declared content hash".into());
        }
        Ok(())
    }
}

const MAINTENANCE_IN_PROGRESS: &str = "sync is paused while a backup is restored or an archive is imported; try again when it finishes";
const PRODUCTION_CLOUD_URL: &str = "https://skriuw-v2-cloud.remcostoeten.workers.dev";
const LOCAL_CLOUD_URL: &str = "http://localhost:8787";
const MAX_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_BASE_URL_BYTES: usize = 2_048;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProvisionedWorkspace {
    workspace_id: String,
    device_id: String,
}

/// The coordinator a successful `connect` started, with the session it was
/// started for so an overlapping `connect` for the same session can reuse it.
struct ActiveSync {
    coordinator: Arc<SyncCoordinator>,
    base_url: String,
    token: SharedToken,
}

impl ActiveSync {
    fn serves(&self, token: &str, base_url: &str) -> bool {
        self.base_url == base_url
            && self.token.read().is_ok_and(|current| *current == token)
            && self.coordinator.status() != SyncStatus::AuthenticationRequired
    }
}

pub struct SyncRuntime {
    database_path: PathBuf,
    connect_gate: Mutex<()>,
    stop_epoch: AtomicU64,
    active: Mutex<Option<ActiveSync>>,
    transport: Mutex<Option<Arc<HttpSyncTransport>>>,
    push_listener: Mutex<Option<PushListener>>,
    workspace_observer: Option<SyncWorkspaceObserver>,
    session_expired: Option<SessionExpiredObserver>,
    maintenance: RwLock<u32>,
}

pub struct MaintenanceSuspension<'a> {
    runtime: &'a SyncRuntime,
}

impl Drop for MaintenanceSuspension<'_> {
    fn drop(&mut self) {
        let mut suspended = self
            .runtime
            .maintenance
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *suspended = suspended.saturating_sub(1);
    }
}

impl SyncRuntime {
    #[must_use]
    pub fn new(database_path: PathBuf) -> Self {
        Self {
            database_path,
            connect_gate: Mutex::new(()),
            stop_epoch: AtomicU64::new(0),
            active: Mutex::new(None),
            transport: Mutex::new(None),
            push_listener: Mutex::new(None),
            workspace_observer: None,
            session_expired: None,
            maintenance: RwLock::new(0),
        }
    }

    #[must_use]
    pub fn with_observers(
        database_path: PathBuf,
        workspace_observer: SyncWorkspaceObserver,
        session_expired: SessionExpiredObserver,
    ) -> Self {
        let mut runtime = Self::new(database_path);
        runtime.workspace_observer = Some(workspace_observer);
        runtime.session_expired = Some(session_expired);
        runtime
    }

    #[must_use]
    pub fn status(&self) -> SyncStatus {
        self.active
            .lock()
            .ok()
            .and_then(|active| active.as_ref().map(|active| active.coordinator.status()))
            .unwrap_or(SyncStatus::LocalOnly)
    }

    pub fn notify_local_commit(&self) {
        self.with_coordinator(SyncCoordinator::notify_local_commit);
    }

    pub fn notify_focus(&self) {
        self.with_coordinator(SyncCoordinator::notify_focus);
    }

    pub fn request_refresh(&self) {
        self.with_coordinator(SyncCoordinator::request_refresh);
    }

    pub fn set_online(&self, online: bool) {
        self.with_coordinator(|coordinator| coordinator.set_online(online));
    }

    pub fn set_visibility(&self, visible: bool, focused: bool) {
        self.with_coordinator(|coordinator| coordinator.set_visibility(visible, focused));
    }

    /// Opens (or reopens) the authenticated session. The renderer names the
    /// cloud origin; it is validated here so a compromised renderer message
    /// cannot point the bearer token at an arbitrary host.
    ///
    /// Connects run one at a time, so the startup resume and a renderer
    /// connect can never start two coordinators. A connect that waited for an
    /// identical session reuses its coordinator, and one overtaken by a pause
    /// or shutdown stops without starting sync.
    pub fn connect(&self, token: String, base_url: String) -> Result<SyncStatus, String> {
        if token.trim().is_empty() || token.len() > 4_096 || token.chars().any(char::is_control) {
            return Err("a valid account session is required to enable sync".into());
        }
        let base_url = trusted_cloud_base_url(&base_url)?;
        let _connecting = self
            .connect_gate
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let maintenance = self.maintenance_gate()?;
        if let Some(status) = self.reusable_status(&token, &base_url) {
            return Ok(status);
        }
        self.stop_coordinator();
        let epoch = self.stop_epoch.load(Ordering::SeqCst);

        let queue = Arc::new(
            SqliteWorkspace::open(&self.database_path)
                .map_err(|error| format!("could not open the local sync queue: {error}"))?,
        );
        let existing = queue
            .sync_connection()
            .map_err(|error| format!("could not read the local sync connection: {error}"))?;
        let device_id = existing
            .as_ref()
            .map(|connection| connection.device_id.clone())
            .unwrap_or_else(|| Uuid::new_v4().simple().to_string());
        let session_token: SharedToken = Arc::new(RwLock::new(token));
        let transport = Arc::new(HttpSyncTransport::new(
            Arc::clone(&session_token),
            &base_url,
        )?);
        let provisioned = transport.provision(&device_id)?;
        if provisioned.device_id != device_id {
            return Err("cloud provisioning returned a different device identity".into());
        }
        if existing
            .as_ref()
            .is_some_and(|connection| connection.workspace_id != provisioned.workspace_id)
        {
            return Err(
                "This local workspace is linked to another cloud workspace. Sign back into its original account and cloud environment, or open a fresh local workspace before linking a different account."
                    .into(),
            );
        }
        let listener_workspace_id = provisioned.workspace_id.clone();
        let listener_device_id = device_id.clone();
        queue
            .connect_sync(&NewSyncConnection {
                workspace_id: provisioned.workspace_id,
                device_id,
                connected_at: now_millis(),
                observed_server_sequence: existing
                    .map_or(0, |connection| connection.observed_server_sequence),
            })
            .map_err(|error| format!("could not persist the sync connection: {error}"))?;

        let listener_stop = Arc::new(AtomicBool::new(false));
        let session_expired = self.session_expired.clone();
        let expiry_stop = Arc::clone(&listener_stop);
        let status_observer: skriuw_sync::SyncStatusObserver =
            Arc::new(move |status: &SyncStatus| {
                if *status != SyncStatus::AuthenticationRequired {
                    return;
                }
                expiry_stop.store(true, Ordering::Relaxed);
                if let Some(session_expired) = &session_expired {
                    session_expired();
                }
            });
        let mut active = self.lock_active()?;
        if self.stop_epoch.load(Ordering::SeqCst) != epoch {
            return Ok(SyncStatus::LocalOnly);
        }
        if let Ok(mut cloud_transport) = self.transport.lock() {
            *cloud_transport = Some(Arc::clone(&transport));
        }
        let workspace = Arc::clone(&queue);
        let coordinator = Arc::new(SyncCoordinator::spawn(
            queue,
            workspace,
            transport,
            Arc::new(ImageAssetStore {
                blob_directory: crate::image_blob_path(&self.database_path),
            }),
            Arc::new(SystemClock),
            SyncCoordinatorConfig {
                workspace_observer: self.workspace_observer.clone(),
                status_observer: Some(status_observer),
                session_token: Some(Arc::clone(&session_token)),
                ..SyncCoordinatorConfig::default()
            },
        ));
        let status = coordinator.status();
        let listener = PushListener::spawn(
            SyncHttpEndpoints::new(&base_url),
            Arc::clone(&session_token),
            listener_workspace_id,
            listener_device_id,
            Arc::downgrade(&coordinator),
            listener_stop,
        );
        if let Ok(mut push_listener) = self.push_listener.lock() {
            *push_listener = Some(listener);
        }
        *active = Some(ActiveSync {
            coordinator,
            base_url,
            token: session_token,
        });
        drop(active);
        drop(maintenance);
        Ok(status)
    }

    fn reusable_status(&self, token: &str, base_url: &str) -> Option<SyncStatus> {
        let active = self.active.lock().ok()?;
        let active = active
            .as_ref()
            .filter(|active| active.serves(token, base_url))?;
        Some(active.coordinator.status())
    }

    fn lock_active(&self) -> Result<MutexGuard<'_, Option<ActiveSync>>, String> {
        self.active
            .lock()
            .map_err(|_| "sync runtime lock is unavailable".to_string())
    }

    fn maintenance_gate(&self) -> Result<RwLockReadGuard<'_, u32>, String> {
        let maintenance = self
            .maintenance
            .read()
            .map_err(|_| "sync runtime lock is unavailable".to_string())?;
        if *maintenance != 0 {
            return Err(MAINTENANCE_IN_PROGRESS.into());
        }
        Ok(maintenance)
    }

    /// Runs `action` on a short-lived connection while holding the maintenance
    /// gate, so a restore or import waits for it and it refuses during one.
    fn with_workspace<T>(
        &self,
        action: impl FnOnce(&SqliteWorkspace) -> Result<T, String>,
    ) -> Result<T, String> {
        let _maintenance = self.maintenance_gate()?;
        let workspace = SqliteWorkspace::open(&self.database_path)
            .map_err(|error| format!("could not open the local sync queue: {error}"))?;
        action(&workspace)
    }

    /// Cloud workspace this local store has already been linked to, if any.
    /// Read before routing an account so a store that predates the workspace
    /// registry is recognised as belonging to the account that linked it.
    pub fn linked_workspace_id(&self) -> Result<Option<String>, String> {
        self.with_workspace(|workspace| {
            Ok(workspace
                .sync_connection()
                .map_err(|error| format!("could not read the local sync connection: {error}"))?
                .map(|connection| connection.workspace_id))
        })
    }

    /// Lists the blocked sync queue for the settings surface. This opens its
    /// own short-lived database connection on the caller's blocking thread,
    /// never on editing or navigation paths.
    pub fn recovery_view(&self) -> Result<SyncRecoveryView, String> {
        self.with_workspace(|workspace| {
            workspace
                .sync_recovery_view()
                .map_err(|error| format!("could not read the blocked sync queue: {error}"))
        })
    }

    pub fn retry_blocked_operation(&self, blocked_id: &str) -> Result<SyncRecoveryView, String> {
        self.with_workspace(|workspace| {
            workspace
                .retry_blocked_sync_operation(blocked_id, now_millis())
                .map_err(|error| format!("could not retry the blocked change: {error}"))?;
            self.request_refresh();
            workspace
                .sync_recovery_view()
                .map_err(|error| format!("could not read the blocked sync queue: {error}"))
        })
    }

    pub fn discard_blocked_operation(&self, blocked_id: &str) -> Result<SyncRecoveryView, String> {
        self.with_workspace(|workspace| {
            workspace
                .discard_blocked_sync_operation(blocked_id, now_millis())
                .map_err(|error| format!("could not discard the blocked change: {error}"))?;
            self.request_refresh();
            workspace
                .sync_recovery_view()
                .map_err(|error| format!("could not read the blocked sync queue: {error}"))
        })
    }

    /// What the settings surface needs to describe this workspace's
    /// encryption without ever handling key material.
    pub fn encryption_state(&self) -> Result<WorkspaceEncryptionState, String> {
        self.with_workspace(|workspace| {
            let seal = workspace.workspace_seal().map_err(|error| {
                format!("could not read the workspace encryption state: {error}")
            })?;
            let linked = workspace
                .sync_connection()
                .map_err(|error| format!("could not read the local sync connection: {error}"))?
                .is_some();
            Ok(WorkspaceEncryptionState {
                enabled: seal.is_some(),
                linked,
                key_id: seal.as_ref().map(|seal| seal.key_id.clone()),
                sealed_checkpoint_at: seal.as_ref().and_then(|seal| seal.sealed_checkpoint_at),
            })
        })
    }

    /// Turns encryption on and returns the recovery code exactly once. The
    /// code is never stored: only the key it derives is, so a lost code is
    /// unrecoverable by design and the cloud copy dies with it.
    pub fn enable_encryption(&self) -> Result<String, String> {
        let transport = self.cloud_transport()?;
        let mut entropy = zeroize::Zeroizing::new([0_u8; 20]);
        getrandom::fill(entropy.as_mut_slice()).map_err(|error| {
            format!("could not gather randomness for the recovery code: {error}")
        })?;
        let recovery_code = self.with_workspace(|workspace| {
            enable_workspace_encryption(
                workspace,
                transport.as_ref(),
                &SyncCancellation::new(),
                entropy.as_slice(),
                now_millis(),
            )
        })?;
        self.request_refresh();
        Ok(recovery_code)
    }

    /// Joins an already-encrypted workspace from a second device. The code is
    /// checked against the key the cloud recorded before anything is stored.
    pub fn unlock_encryption(&self, recovery_code: &str) -> Result<(), String> {
        let transport = self.cloud_transport()?;
        self.with_workspace(|workspace| {
            unlock_workspace_encryption(
                workspace,
                transport.as_ref(),
                &SyncCancellation::new(),
                recovery_code,
                now_millis(),
            )
        })?;
        self.request_refresh();
        Ok(())
    }

    fn cloud_transport(&self) -> Result<Arc<HttpSyncTransport>, String> {
        self.transport
            .lock()
            .map_err(|_| "sync runtime lock is unavailable".to_string())?
            .clone()
            .ok_or_else(|| "sign in to Skriuw cloud before changing encryption".to_string())
    }

    /// Pause network access without discarding the durable connection or outbox.
    pub fn pause_for_logout(&self) -> SyncStatus {
        self.stop_coordinator();
        self.status()
    }

    pub fn shutdown(&self) {
        self.stop_coordinator();
    }

    /// Stops sync and refuses `connect` until the returned guard drops. Waits
    /// for an in-flight `connect` to store its coordinator first, so call it
    /// from a blocking thread.
    #[must_use]
    pub fn suspend_for_maintenance(&self) -> MaintenanceSuspension<'_> {
        {
            let mut suspended = self
                .maintenance
                .write()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            *suspended = suspended.saturating_add(1);
        }
        self.stop_coordinator();
        MaintenanceSuspension { runtime: self }
    }

    /// Stops sync but waits at most `limit` for the worker, so quitting never
    /// hangs on an in-flight request. Returns false when the worker was left
    /// for process exit to reclaim.
    pub fn shutdown_within(&self, limit: Duration) -> bool {
        self.take_coordinator()
            .is_none_or(|coordinator| coordinator.shutdown_within(limit))
    }

    fn stop_coordinator(&self) {
        if let Some(coordinator) = self.take_coordinator() {
            coordinator.shutdown();
        }
    }

    fn take_coordinator(&self) -> Option<Arc<SyncCoordinator>> {
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        self.stop_epoch.fetch_add(1, Ordering::SeqCst);
        let listener = self
            .push_listener
            .lock()
            .ok()
            .and_then(|mut listener| listener.take());
        if let Some(listener) = listener {
            listener.stop();
        }
        active.take().map(|active| active.coordinator)
    }

    fn with_coordinator(&self, action: impl Fn(&SyncCoordinator)) {
        if let Ok(active) = self.active.lock()
            && let Some(active) = active.as_ref()
        {
            action(active.coordinator.as_ref());
        }
    }
}

const PUSH_LISTENER_READ_TIMEOUT: Duration = Duration::from_secs(30);
const PUSH_LISTENER_MIN_BACKOFF_MS: u64 = 1_000;
const PUSH_LISTENER_MAX_BACKOFF_MS: u64 = 60_000;
const PUSH_LISTENER_STOP_POLL: Duration = Duration::from_millis(250);

/// Long-lived WebSocket that wakes the coordinator when another device changes
/// the workspace. It is a latency optimization only: every failure path falls
/// back to the coordinator's own poll interval, so the listener never surfaces
/// in sync status and never blocks teardown — it holds the coordinator weakly
/// and exits once the coordinator is gone or the stop flag is set.
struct PushListener {
    stop: Arc<AtomicBool>,
}

impl PushListener {
    fn spawn(
        endpoints: SyncHttpEndpoints,
        token: SharedToken,
        workspace_id: String,
        device_id: String,
        coordinator: Weak<SyncCoordinator>,
        stop: Arc<AtomicBool>,
    ) -> Self {
        let listener_stop = Arc::clone(&stop);
        let spawned = std::thread::Builder::new()
            .name("skriuw-sync-push".into())
            .spawn(move || {
                run_push_listener(
                    &endpoints,
                    &token,
                    &workspace_id,
                    &device_id,
                    &coordinator,
                    &listener_stop,
                );
            });
        if let Err(error) = spawned {
            eprintln!("sync push listener could not start: {error}");
        }
        Self { stop }
    }

    fn stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

enum ListenerSession {
    Reconnect,
    Exit,
}

fn run_push_listener(
    endpoints: &SyncHttpEndpoints,
    token: &SharedToken,
    workspace_id: &str,
    device_id: &str,
    coordinator: &Weak<SyncCoordinator>,
    stop: &AtomicBool,
) {
    let mut backoff_ms = PUSH_LISTENER_MIN_BACKOFF_MS;
    loop {
        if stop.load(Ordering::Relaxed) || coordinator.strong_count() == 0 {
            return;
        }
        let current_token = token.read().map(|token| token.clone()).unwrap_or_default();
        match connect_events_socket(endpoints, &current_token, workspace_id, device_id) {
            Ok(mut socket) => {
                backoff_ms = PUSH_LISTENER_MIN_BACKOFF_MS;
                report_channel(coordinator, true);
                let session = listen_for_wakes(&mut socket, coordinator, stop);
                report_channel(coordinator, false);
                if let ListenerSession::Exit = session {
                    return;
                }
            }
            Err(ListenerConnectError::Rejected(status)) => {
                eprintln!("sync push listener was rejected ({status}); waiting for a new session");
                return;
            }
            Err(ListenerConnectError::Failed(error)) => {
                eprintln!("sync push listener connection failed: {error}");
            }
        }
        let mut waited = Duration::ZERO;
        while waited < Duration::from_millis(backoff_ms) {
            if stop.load(Ordering::Relaxed) || coordinator.strong_count() == 0 {
                return;
            }
            std::thread::sleep(PUSH_LISTENER_STOP_POLL);
            waited += PUSH_LISTENER_STOP_POLL;
        }
        backoff_ms = (backoff_ms * 2).min(PUSH_LISTENER_MAX_BACKOFF_MS);
    }
}

fn report_channel(coordinator: &Weak<SyncCoordinator>, connected: bool) {
    if let Some(coordinator) = coordinator.upgrade() {
        coordinator.set_wake_channel_connected(connected);
    }
}

enum ListenerConnectError {
    /// The service refused the session at the handshake; retrying with the
    /// same token cannot succeed.
    Rejected(u16),
    Failed(String),
}

fn connect_events_socket(
    endpoints: &SyncHttpEndpoints,
    token: &str,
    workspace_id: &str,
    device_id: &str,
) -> Result<
    tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<TcpStream>>,
    ListenerConnectError,
> {
    use tungstenite::client::IntoClientRequest;

    let url = websocket_url(&endpoints.events(workspace_id, device_id))
        .map_err(ListenerConnectError::Failed)?;
    let mut request = url.into_client_request().map_err(|error| {
        ListenerConnectError::Failed(format!("events request was invalid: {error}"))
    })?;
    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {token}").parse().map_err(|_| {
            ListenerConnectError::Failed("session token cannot be sent as a header".into())
        })?,
    );
    let (mut socket, _response) = tungstenite::connect(request).map_err(|error| match error {
        tungstenite::Error::Http(response) if matches!(response.status().as_u16(), 401 | 403) => {
            ListenerConnectError::Rejected(response.status().as_u16())
        }
        error => ListenerConnectError::Failed(format!("events connect failed: {error}")),
    })?;
    let stream = match socket.get_mut() {
        tungstenite::stream::MaybeTlsStream::Plain(stream) => Some(stream),
        tungstenite::stream::MaybeTlsStream::Rustls(stream) => Some(stream.get_mut()),
        _ => None,
    };
    if let Some(stream) = stream {
        let _ = stream.set_read_timeout(Some(PUSH_LISTENER_READ_TIMEOUT));
    }
    Ok(socket)
}

fn listen_for_wakes(
    socket: &mut tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<TcpStream>>,
    coordinator: &Weak<SyncCoordinator>,
    stop: &AtomicBool,
) -> ListenerSession {
    loop {
        if stop.load(Ordering::Relaxed) {
            let _ = socket.close(None);
            return ListenerSession::Exit;
        }
        match socket.read() {
            Ok(tungstenite::Message::Text(text)) => {
                if is_workspace_changed_message(text.as_str()) {
                    let Some(coordinator) = coordinator.upgrade() else {
                        return ListenerSession::Exit;
                    };
                    coordinator.notify_remote_change();
                }
            }
            Ok(tungstenite::Message::Close(_)) => return ListenerSession::Reconnect,
            Ok(_) => {}
            Err(tungstenite::Error::Io(error))
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                // The read timeout doubles as the keepalive tick; the service
                // answers with an auto-response pong without waking.
                if socket
                    .send(tungstenite::Message::Text("ping".into()))
                    .is_err()
                {
                    return ListenerSession::Reconnect;
                }
            }
            Err(_) => return ListenerSession::Reconnect,
        }
    }
}

fn is_workspace_changed_message(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .and_then(|value| {
            value
                .get("type")
                .and_then(|kind| kind.as_str())
                .map(|kind| kind == "workspaceChanged")
        })
        .unwrap_or(false)
}

fn websocket_url(http_url: &str) -> Result<String, String> {
    if let Some(rest) = http_url.strip_prefix("https://") {
        return Ok(format!("wss://{rest}"));
    }
    if let Some(rest) = http_url.strip_prefix("http://") {
        return Ok(format!("ws://{rest}"));
    }
    if http_url.starts_with("wss://") || http_url.starts_with("ws://") {
        return Ok(http_url.to_string());
    }
    Err(format!("cloud URL has no recognized scheme: {http_url}"))
}

struct HttpSyncTransport {
    client: Client,
    token: SharedToken,
    endpoints: SyncHttpEndpoints,
}

/// One outbound request: the body is owned so its length can size the
/// per-request deadline before anything is sent.
struct OutboundRequest {
    method: Method,
    url: String,
    content_type: Option<&'static str>,
    body: Vec<u8>,
}

impl OutboundRequest {
    fn json(
        method: Method,
        url: String,
        value: &impl serde::Serialize,
    ) -> Result<Self, TransportError> {
        let body = serde_json::to_vec(value).map_err(|error| {
            TransportError::Validation(format!("sync request is not serializable: {error}"))
        })?;
        Ok(Self {
            method,
            url,
            content_type: Some("application/json"),
            body,
        })
    }

    fn empty(method: Method, url: String) -> Self {
        Self {
            method,
            url,
            content_type: None,
            body: Vec::new(),
        }
    }
}

impl HttpSyncTransport {
    fn new(token: SharedToken, base_url: &str) -> Result<Self, String> {
        let client = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .build()
            .map_err(|error| format!("could not initialize cloud sync: {error}"))?;
        Ok(Self {
            client,
            token,
            endpoints: SyncHttpEndpoints::new(base_url),
        })
    }

    fn bearer(&self) -> String {
        self.token
            .read()
            .map(|token| token.clone())
            .unwrap_or_default()
    }

    fn provision(&self, device_id: &str) -> Result<ProvisionedWorkspace, String> {
        let body = serde_json::json!({ "deviceId": device_id }).to_string();
        let response = self
            .client
            .post(self.endpoints.provision())
            .bearer_auth(self.bearer())
            .timeout(Duration::from_millis(request_timeout_ms(body.len())))
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .map_err(|error| format!("cloud provisioning failed: {error}"))?;
        if !response.status().is_success() {
            return Err(provision_error(response.status()));
        }
        let body = read_bounded(response)
            .map_err(|error| format!("cloud provisioning response was invalid: {error}"))?;
        serde_json::from_slice(&body)
            .map_err(|error| format!("cloud provisioning response was invalid: {error}"))
    }

    fn dispatch(
        &self,
        request: OutboundRequest,
        cancellation: &SyncCancellation,
    ) -> Result<reqwest::blocking::Response, TransportError> {
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        let timeout = Duration::from_millis(request_timeout_ms(request.body.len()));
        let mut builder = self
            .client
            .request(request.method, request.url)
            .bearer_auth(self.bearer())
            .timeout(timeout);
        if let Some(content_type) = request.content_type {
            builder = builder.header("Content-Type", content_type);
        }
        if !request.body.is_empty() {
            builder = builder.body(request.body);
        }
        let response = builder
            .send()
            .map_err(|error| TransportError::Transient(error.to_string()))?;
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        Ok(response)
    }

    fn send<T: serde::de::DeserializeOwned>(
        &self,
        request: OutboundRequest,
        cancellation: &SyncCancellation,
    ) -> Result<T, TransportError> {
        let response = self.dispatch(request, cancellation)?;
        let status = response.status();
        if !status.is_success() {
            let retry_after_ms = retry_after_ms(response.headers().get("Retry-After"));
            let body = read_bounded(response).unwrap_or_default();
            return Err(classify_rejected_response(
                status.as_u16(),
                rejected_error_code(&body).as_deref(),
                retry_after_ms,
            ));
        }
        let body = read_bounded(response)?;
        serde_json::from_slice(&body).map_err(|error| TransportError::Transient(error.to_string()))
    }

    /// Sends a request on a route older deployments do not serve, so a 404
    /// that names no specific decision is reported as an absent route rather
    /// than as a denial the caller cannot act on.
    fn send_optional_route<T: serde::de::DeserializeOwned>(
        &self,
        request: OutboundRequest,
        cancellation: &SyncCancellation,
    ) -> Result<T, TransportError> {
        let response = self.dispatch(request, cancellation)?;
        let status = response.status();
        if !status.is_success() {
            let retry_after_ms = retry_after_ms(response.headers().get("Retry-After"));
            let body = read_bounded(response).unwrap_or_default();
            return Err(classify_optional_route_failure(
                status.as_u16(),
                rejected_error_code(&body).as_deref(),
                retry_after_ms,
            ));
        }
        let body = read_bounded(response)?;
        serde_json::from_slice(&body).map_err(|error| TransportError::Transient(error.to_string()))
    }

    fn send_bytes(
        &self,
        request: OutboundRequest,
        cancellation: &SyncCancellation,
    ) -> Result<Option<Vec<u8>>, TransportError> {
        let response = self.dispatch(request, cancellation)?;
        let status = response.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !status.is_success() {
            return Err(transport_error(
                status,
                response.headers().get("Retry-After"),
            ));
        }
        read_bounded(response).map(Some)
    }
}

impl SyncTransport for HttpSyncTransport {
    fn push(
        &self,
        workspace_id: &str,
        request: &SyncPushRequest,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPushResponse, TransportError> {
        self.send(
            OutboundRequest::json(Method::POST, self.endpoints.push(workspace_id), request)?,
            cancellation,
        )
    }

    fn pull(
        &self,
        workspace_id: &str,
        after_server_sequence: u64,
        limit: usize,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPullResponse, TransportError> {
        self.send(
            OutboundRequest::empty(
                Method::GET,
                self.endpoints
                    .pull(workspace_id, after_server_sequence, limit),
            ),
            cancellation,
        )
    }

    fn has_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<bool, TransportError> {
        let url = self.endpoints.chunk(workspace_id, digest);
        Ok(self
            .send_bytes(OutboundRequest::empty(Method::HEAD, url), cancellation)?
            .is_some())
    }

    fn put_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        bytes: &[u8],
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        let url = self.endpoints.chunk(workspace_id, digest);
        self.send_bytes(
            OutboundRequest {
                method: Method::PUT,
                url,
                content_type: Some("application/octet-stream"),
                body: bytes.to_vec(),
            },
            cancellation,
        )?
        .ok_or_else(|| TransportError::Transient("chunk upload was not stored".into()))?;
        Ok(())
    }

    fn get_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Vec<u8>, TransportError> {
        let url = self.endpoints.chunk(workspace_id, digest);
        self.send_bytes(OutboundRequest::empty(Method::GET, url), cancellation)?
            .ok_or_else(|| TransportError::Validation(format!("chunk {digest} is not stored")))
    }

    fn latest_checkpoint(
        &self,
        workspace_id: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Option<WorkspaceCheckpoint>, TransportError> {
        let url = self.endpoints.checkpoint(workspace_id);
        let body = self.send_bytes(OutboundRequest::empty(Method::GET, url), cancellation)?;
        let Some(body) = body else {
            return Ok(None);
        };
        serde_json::from_slice::<WorkspaceCheckpoint>(&body)
            .map(Some)
            .map_err(|error| {
                TransportError::Validation(format!("checkpoint record was unreadable: {error}"))
            })
    }

    fn publish_checkpoint(
        &self,
        workspace_id: &str,
        checkpoint: &WorkspaceCheckpoint,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        let url = self.endpoints.checkpoint(workspace_id);
        let _: serde_json::Value = self.send(
            OutboundRequest::json(Method::POST, url, checkpoint)?,
            cancellation,
        )?;
        Ok(())
    }

    fn workspace_encryption(
        &self,
        workspace_id: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Option<WorkspaceEncryptionMarker>, TransportError> {
        let marker: Option<WorkspaceEncryptionMarker> = self.send_optional_route(
            OutboundRequest::empty(Method::GET, self.endpoints.encryption(workspace_id)),
            cancellation,
        )?;
        if let Some(marker) = &marker {
            marker.validate().map_err(|error| {
                TransportError::Validation(format!("encryption record was unreadable: {error}"))
            })?;
        }
        Ok(marker)
    }

    fn claim_workspace_encryption(
        &self,
        workspace_id: &str,
        scheme: &str,
        key_id: &str,
        cancellation: &SyncCancellation,
    ) -> Result<WorkspaceEncryptionMarker, TransportError> {
        let marker: WorkspaceEncryptionMarker = self.send_optional_route(
            OutboundRequest::json(
                Method::POST,
                self.endpoints.encryption(workspace_id),
                &serde_json::json!({ "scheme": scheme, "keyId": key_id }),
            )?,
            cancellation,
        )?;
        marker.validate().map_err(|error| {
            TransportError::Validation(format!("encryption record was unreadable: {error}"))
        })?;
        Ok(marker)
    }

    fn acknowledge(
        &self,
        workspace_id: &str,
        device_id: &str,
        server_sequence: u64,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        let url = self.endpoints.acknowledge(workspace_id);
        let _: serde_json::Value = self.send(
            OutboundRequest::json(
                Method::POST,
                url,
                &serde_json::json!({
                    "deviceId": device_id,
                    "serverSequence": server_sequence,
                }),
            )?,
            cancellation,
        )?;
        Ok(())
    }
}

fn read_bounded(response: reqwest::blocking::Response) -> Result<Vec<u8>, TransportError> {
    let mut body = Vec::new();
    response
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut body)
        .map_err(|error| TransportError::Transient(error.to_string()))?;
    if body.len() as u64 > MAX_RESPONSE_BYTES {
        return Err(TransportError::ResponseTooLarge);
    }
    Ok(body)
}

fn provision_error(status: StatusCode) -> String {
    match status {
        StatusCode::UNAUTHORIZED => "your Skriuw session expired; sign in again".into(),
        StatusCode::FORBIDDEN => "this device is not allowed to use cloud sync".into(),
        status if status.is_server_error() => "Skriuw cloud is temporarily unavailable".into(),
        _ => "Skriuw cloud rejected the sync setup request".into(),
    }
}

fn retry_after_ms(retry_after: Option<&reqwest::header::HeaderValue>) -> Option<i64> {
    retry_after
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<i64>().ok())
        .map(|seconds| seconds.saturating_mul(1_000))
}

fn transport_error(
    status: StatusCode,
    retry_after: Option<&reqwest::header::HeaderValue>,
) -> TransportError {
    classify_http_failure(status.as_u16(), retry_after_ms(retry_after))
}

/// The origin used to resume a persisted session before the renderer has
/// named one. Debug builds may point it at a local service.
pub fn default_cloud_base_url() -> String {
    if cfg!(debug_assertions) {
        std::env::var("SKRIUW_CLOUD_URL").unwrap_or_else(|_| {
            development_cloud_base_url(std::env::var("SKRIUW_DEV_CLOUD").ok().as_deref()).into()
        })
    } else {
        PRODUCTION_CLOUD_URL.to_string()
    }
}

/// Accepts only the cloud origins this build trusts with the bearer token:
/// `https` under a Skriuw-controlled suffix, or `http://localhost` in debug
/// builds. In debug builds `SKRIUW_CLOUD_URL` overrides the renderer's choice.
fn trusted_cloud_base_url(base_url: &str) -> Result<String, String> {
    if cfg!(debug_assertions)
        && let Ok(override_url) = std::env::var("SKRIUW_CLOUD_URL")
    {
        return Ok(override_url);
    }
    let trimmed = base_url.trim().trim_end_matches('/');
    let trusted = trimmed.len() <= MAX_BASE_URL_BYTES
        && !trimmed.contains(['?', '#', '@', ' '])
        && (is_trusted_https_origin(trimmed)
            || (cfg!(debug_assertions) && is_local_development_origin(trimmed)));
    if trusted {
        Ok(trimmed.to_string())
    } else {
        Err("the cloud sync URL is not trusted".into())
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
    let Some(rest) = base_url.strip_prefix("http://localhost") else {
        return false;
    };
    rest.is_empty() || rest.starts_with(':') || rest.starts_with('/')
}

fn development_cloud_base_url(mode: Option<&str>) -> &'static str {
    if mode == Some("local") {
        LOCAL_CLOUD_URL
    } else {
        PRODUCTION_CLOUD_URL
    }
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
        HttpSyncTransport, LOCAL_CLOUD_URL, PRODUCTION_CLOUD_URL, SyncRuntime,
        development_cloud_base_url, is_local_development_origin, is_trusted_https_origin,
    };
    use skriuw_sync::SyncStatus;
    use std::{
        io::{BufRead, BufReader, Read, Write},
        net::{TcpListener, TcpStream},
        sync::{
            Arc, RwLock,
            atomic::{AtomicBool, AtomicUsize, Ordering},
        },
        thread,
        time::{Duration, Instant},
    };

    struct FakeCloud {
        base_url: String,
        provisions: Arc<AtomicUsize>,
        hold_provisioning: Arc<AtomicBool>,
    }

    impl FakeCloud {
        fn start() -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake cloud");
            let base_url = format!(
                "http://localhost:{}",
                listener.local_addr().expect("fake cloud address").port()
            );
            let provisions = Arc::new(AtomicUsize::new(0));
            let hold_provisioning = Arc::new(AtomicBool::new(true));
            let counter = Arc::clone(&provisions);
            let hold = Arc::clone(&hold_provisioning);
            thread::spawn(move || {
                for stream in listener.incoming().flatten() {
                    let counter = Arc::clone(&counter);
                    let hold = Arc::clone(&hold);
                    thread::spawn(move || answer(stream, &counter, &hold));
                }
            });
            Self {
                base_url,
                provisions,
                hold_provisioning,
            }
        }

        fn provisions(&self) -> usize {
            self.provisions.load(Ordering::SeqCst)
        }

        fn release_provisioning(&self) {
            self.hold_provisioning.store(false, Ordering::SeqCst);
        }

        fn wait_for_provisions(&self, expected: usize) {
            let deadline = Instant::now() + Duration::from_secs(10);
            while self.provisions() < expected {
                assert!(Instant::now() < deadline, "provisioning never started");
                thread::sleep(Duration::from_millis(5));
            }
        }
    }

    fn answer(stream: TcpStream, provisions: &AtomicUsize, hold: &AtomicBool) {
        let mut reader = BufReader::new(stream);
        let mut request_line = String::new();
        if reader.read_line(&mut request_line).is_err() {
            return;
        }
        let mut content_length = 0;
        loop {
            let mut header = String::new();
            if reader.read_line(&mut header).is_err() || header.trim().is_empty() {
                break;
            }
            if let Some((name, value)) = header.split_once(':')
                && name.eq_ignore_ascii_case("content-length")
            {
                content_length = value.trim().parse().unwrap_or(0);
            }
        }
        let mut body = vec![0; content_length];
        if reader.read_exact(&mut body).is_err() {
            return;
        }
        let response = if request_line.contains("/v1/sync/provision") {
            provisions.fetch_add(1, Ordering::SeqCst);
            while hold.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(5));
            }
            let request: serde_json::Value =
                serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null);
            let payload = serde_json::json!({
                "workspaceId": "workspace-1",
                "deviceId": request["deviceId"],
            })
            .to_string();
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
                payload.len()
            )
        } else {
            "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                .to_string()
        };
        let _ = reader.get_mut().write_all(response.as_bytes());
    }

    #[test]
    fn overlapping_connects_for_one_session_start_one_coordinator() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let runtime = SyncRuntime::new(directory.path().join("workspace.db"));
        let cloud = FakeCloud::start();

        let (resume, renderer) = thread::scope(|scope| {
            let resume = scope.spawn(|| runtime.connect("token".into(), cloud.base_url.clone()));
            cloud.wait_for_provisions(1);
            let renderer = scope.spawn(|| runtime.connect("token".into(), cloud.base_url.clone()));
            thread::sleep(Duration::from_millis(200));
            cloud.release_provisioning();
            (
                resume.join().expect("resume connect"),
                renderer.join().expect("renderer connect"),
            )
        });

        assert!(resume.is_ok(), "{resume:?}");
        assert!(renderer.is_ok(), "{renderer:?}");
        assert_eq!(cloud.provisions(), 1);
        assert_ne!(runtime.status(), SyncStatus::LocalOnly);

        runtime
            .connect("rotated-token".into(), cloud.base_url.clone())
            .expect("connect with a new session");
        assert_eq!(cloud.provisions(), 2);
        runtime.shutdown();
        assert_eq!(runtime.status(), SyncStatus::LocalOnly);
    }

    #[test]
    fn pausing_during_connect_keeps_sync_stopped() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let runtime = SyncRuntime::new(directory.path().join("workspace.db"));
        let cloud = FakeCloud::start();

        let connected = thread::scope(|scope| {
            let connecting =
                scope.spawn(|| runtime.connect("token".into(), cloud.base_url.clone()));
            cloud.wait_for_provisions(1);
            assert_eq!(runtime.pause_for_logout(), SyncStatus::LocalOnly);
            cloud.release_provisioning();
            connecting.join().expect("connect")
        });

        assert_eq!(connected, Ok(SyncStatus::LocalOnly));
        assert_eq!(runtime.status(), SyncStatus::LocalOnly);
        assert!(runtime.cloud_transport().is_err());
    }

    #[test]
    fn only_skriuw_origins_are_trusted_with_the_session_token() {
        assert!(is_trusted_https_origin(PRODUCTION_CLOUD_URL));
        assert!(is_trusted_https_origin("https://sync.skriuw.app"));
        assert!(!is_trusted_https_origin("https://evil.example"));
        assert!(!is_trusted_https_origin("https://skriuw.app.evil.example"));
        assert!(!is_trusted_https_origin("http://sync.skriuw.app"));
        assert!(is_local_development_origin(LOCAL_CLOUD_URL));
        assert!(is_local_development_origin("http://localhost"));
        assert!(!is_local_development_origin(
            "http://localhost.evil.example"
        ));
    }

    #[test]
    fn new_runtime_stays_local_only_and_inert() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let runtime = SyncRuntime::new(directory.path().join("workspace.db"));

        assert_eq!(runtime.status(), SyncStatus::LocalOnly);
        runtime.notify_local_commit();
        runtime.notify_focus();
        runtime.request_refresh();
        runtime.set_online(false);
        runtime.set_visibility(false, false);
        assert!(
            runtime
                .connect("token".into(), "https://evil.example".into())
                .is_err()
        );
        runtime.shutdown();
        assert_eq!(runtime.status(), SyncStatus::LocalOnly);
    }

    #[test]
    fn connect_is_refused_while_suspended_for_maintenance() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let database_path = directory.path().join("workspace.db");
        let runtime = SyncRuntime::new(database_path.clone());

        let suspension = runtime.suspend_for_maintenance();
        let rejected = runtime.suspend_for_maintenance();
        drop(rejected);
        let refused = runtime
            .connect("token".into(), PRODUCTION_CLOUD_URL.into())
            .expect_err("connect during maintenance");
        assert!(refused.contains("paused"), "{refused}");
        assert!(!database_path.exists());
        assert_eq!(runtime.status(), SyncStatus::LocalOnly);

        drop(suspension);
        let untrusted = runtime
            .connect("token".into(), "https://evil.example".into())
            .expect_err("untrusted origin");
        assert!(!untrusted.contains("paused"), "{untrusted}");
        assert!(!database_path.exists());
    }

    #[test]
    fn workspace_reads_and_writes_are_refused_while_suspended_for_maintenance() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let database_path = directory.path().join("workspace.db");
        let runtime = SyncRuntime::new(database_path.clone());
        *runtime.transport.lock().expect("transport lock") = Some(Arc::new(
            HttpSyncTransport::new(Arc::new(RwLock::new("token".into())), PRODUCTION_CLOUD_URL)
                .expect("transport"),
        ));

        let suspension = runtime.suspend_for_maintenance();
        let refusals = [
            runtime.linked_workspace_id().map(|_| ()),
            runtime.recovery_view().map(|_| ()),
            runtime.retry_blocked_operation("blocked").map(|_| ()),
            runtime.discard_blocked_operation("blocked").map(|_| ()),
            runtime.encryption_state().map(|_| ()),
            runtime.enable_encryption().map(|_| ()),
            runtime.unlock_encryption("code").map(|_| ()),
        ];
        for refusal in refusals {
            let error = refusal.expect_err("refused during maintenance");
            assert!(error.contains("paused"), "{error}");
        }
        assert!(!database_path.exists());

        drop(suspension);
        assert_eq!(runtime.linked_workspace_id().expect("linked id"), None);
        assert!(
            runtime
                .recovery_view()
                .expect("recovery view")
                .blocked
                .is_empty()
        );
        assert!(!runtime.encryption_state().expect("encryption").enabled);
        assert!(database_path.exists());
    }

    #[test]
    fn suspension_waits_for_an_open_workspace_connection_to_close() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let runtime = Arc::new(SyncRuntime::new(directory.path().join("workspace.db")));
        let (opened_sender, opened) = std::sync::mpsc::channel();
        let (release, released) = std::sync::mpsc::channel::<()>();
        let closed = Arc::new(AtomicBool::new(false));

        let reader = {
            let runtime = Arc::clone(&runtime);
            let closed = Arc::clone(&closed);
            std::thread::spawn(move || {
                runtime
                    .with_workspace(|_| {
                        opened_sender.send(()).expect("signal opened");
                        released.recv().expect("release");
                        closed.store(true, Ordering::SeqCst);
                        Ok(())
                    })
                    .expect("reader");
            })
        };
        opened.recv().expect("reader opened");
        let suspender = {
            let runtime = Arc::clone(&runtime);
            let closed = Arc::clone(&closed);
            std::thread::spawn(move || {
                let _suspension = runtime.suspend_for_maintenance();
                closed.load(Ordering::SeqCst)
            })
        };
        std::thread::sleep(Duration::from_millis(50));
        assert!(
            !suspender.is_finished(),
            "suspension skipped the open connection"
        );
        release.send(()).expect("release reader");
        reader.join().expect("reader thread");
        assert!(suspender.join().expect("suspender thread"));
    }

    #[test]
    fn development_uses_production_cloud_unless_local_is_explicit() {
        assert_eq!(development_cloud_base_url(None), PRODUCTION_CLOUD_URL);
        assert_eq!(
            development_cloud_base_url(Some("cloud")),
            PRODUCTION_CLOUD_URL
        );
        assert_eq!(development_cloud_base_url(Some("local")), LOCAL_CLOUD_URL);
    }
}
