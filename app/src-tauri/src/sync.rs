use std::{
    io::Read,
    net::TcpStream,
    path::PathBuf,
    sync::{
        Arc, Mutex, Weak,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use reqwest::{StatusCode, blocking::Client};
use serde::Deserialize;
use skriuw_domain::{
    SyncPullResponse, SyncPushRequest, SyncPushResponse, SyncRecoveryView, WorkspaceCheckpoint,
};
use skriuw_images::ImageStore;
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{NewSyncConnection, SyncRecovery, WorkspaceSyncQueue};
use skriuw_sync::{
    SyncAssetStore, SyncCancellation, SyncCoordinator, SyncCoordinatorConfig, SyncHttpEndpoints,
    SyncStatus, SyncTransport, SyncWorkspaceObserver, SystemClock, TransportError,
    classify_http_failure,
};
use uuid::Uuid;

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

const PRODUCTION_CLOUD_URL: &str = "https://skriuw-v2-cloud.remcostoeten.workers.dev";
const MAX_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProvisionedWorkspace {
    workspace_id: String,
    device_id: String,
}

pub struct SyncRuntime {
    database_path: PathBuf,
    coordinator: Mutex<Option<Arc<SyncCoordinator>>>,
    push_listener: Mutex<Option<PushListener>>,
    workspace_observer: Option<SyncWorkspaceObserver>,
}

impl SyncRuntime {
    #[must_use]
    pub fn new(database_path: PathBuf) -> Self {
        Self {
            database_path,
            coordinator: Mutex::new(None),
            push_listener: Mutex::new(None),
            workspace_observer: None,
        }
    }

    #[must_use]
    pub fn with_workspace_observer(
        database_path: PathBuf,
        workspace_observer: SyncWorkspaceObserver,
    ) -> Self {
        let mut runtime = Self::new(database_path);
        runtime.workspace_observer = Some(workspace_observer);
        runtime
    }

    #[must_use]
    pub fn status(&self) -> SyncStatus {
        self.coordinator
            .lock()
            .ok()
            .and_then(|coordinator| coordinator.as_ref().map(|coordinator| coordinator.status()))
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

    pub fn connect(&self, token: String) -> Result<SyncStatus, String> {
        if token.trim().is_empty() || token.len() > 4_096 {
            return Err("a valid account session is required to enable sync".into());
        }
        self.stop_coordinator();

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
        let listener_token = token.clone();
        let transport = Arc::new(HttpSyncTransport::new(token)?);
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
                ..SyncCoordinatorConfig::default()
            },
        ));
        let status = coordinator.status();
        let listener = PushListener::spawn(
            SyncHttpEndpoints::new(cloud_base_url()),
            listener_token,
            listener_workspace_id,
            listener_device_id,
            Arc::downgrade(&coordinator),
        );
        *self
            .coordinator
            .lock()
            .map_err(|_| "sync runtime lock is unavailable".to_string())? = Some(coordinator);
        if let Ok(mut push_listener) = self.push_listener.lock() {
            *push_listener = Some(listener);
        }
        Ok(status)
    }

    fn open_workspace(&self) -> Result<SqliteWorkspace, String> {
        SqliteWorkspace::open(&self.database_path)
            .map_err(|error| format!("could not open the local sync queue: {error}"))
    }

    /// Lists the blocked sync queue for the settings surface. This opens its
    /// own short-lived database connection on the caller's blocking thread,
    /// never on editing or navigation paths.
    pub fn recovery_view(&self) -> Result<SyncRecoveryView, String> {
        self.open_workspace()?
            .sync_recovery_view()
            .map_err(|error| format!("could not read the blocked sync queue: {error}"))
    }

    pub fn retry_blocked_operation(&self, blocked_id: &str) -> Result<SyncRecoveryView, String> {
        let workspace = self.open_workspace()?;
        workspace
            .retry_blocked_sync_operation(blocked_id, now_millis())
            .map_err(|error| format!("could not retry the blocked change: {error}"))?;
        self.request_refresh();
        workspace
            .sync_recovery_view()
            .map_err(|error| format!("could not read the blocked sync queue: {error}"))
    }

    pub fn discard_blocked_operation(&self, blocked_id: &str) -> Result<SyncRecoveryView, String> {
        let workspace = self.open_workspace()?;
        workspace
            .discard_blocked_sync_operation(blocked_id, now_millis())
            .map_err(|error| format!("could not discard the blocked change: {error}"))?;
        self.request_refresh();
        workspace
            .sync_recovery_view()
            .map_err(|error| format!("could not read the blocked sync queue: {error}"))
    }

    /// Pause network access without discarding the durable connection or outbox.
    pub fn pause_for_logout(&self) -> SyncStatus {
        self.stop_coordinator();
        self.status()
    }

    pub fn shutdown(&self) {
        self.stop_coordinator();
    }

    fn stop_coordinator(&self) {
        let listener = self
            .push_listener
            .lock()
            .ok()
            .and_then(|mut listener| listener.take());
        if let Some(listener) = listener {
            listener.stop();
        }
        let coordinator = self
            .coordinator
            .lock()
            .ok()
            .and_then(|mut coordinator| coordinator.take());
        if let Some(coordinator) = coordinator {
            coordinator.shutdown();
        }
    }

    fn with_coordinator(&self, action: impl Fn(&SyncCoordinator)) {
        if let Ok(coordinator) = self.coordinator.lock()
            && let Some(coordinator) = coordinator.as_ref()
        {
            action(coordinator.as_ref());
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
        token: String,
        workspace_id: String,
        device_id: String,
        coordinator: Weak<SyncCoordinator>,
    ) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
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
    token: &str,
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
        match connect_events_socket(endpoints, token, workspace_id, device_id) {
            Ok(mut socket) => {
                backoff_ms = PUSH_LISTENER_MIN_BACKOFF_MS;
                if let ListenerSession::Exit = listen_for_wakes(&mut socket, coordinator, stop) {
                    return;
                }
            }
            Err(error) => {
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

fn connect_events_socket(
    endpoints: &SyncHttpEndpoints,
    token: &str,
    workspace_id: &str,
    device_id: &str,
) -> Result<tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<TcpStream>>, String> {
    use tungstenite::client::IntoClientRequest;

    let url = websocket_url(&endpoints.events(workspace_id, device_id))?;
    let mut request = url
        .into_client_request()
        .map_err(|error| format!("events request was invalid: {error}"))?;
    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {token}")
            .parse()
            .map_err(|_| "session token cannot be sent as a header".to_string())?,
    );
    let (mut socket, _response) =
        tungstenite::connect(request).map_err(|error| format!("events connect failed: {error}"))?;
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
    token: String,
    endpoints: SyncHttpEndpoints,
}

impl HttpSyncTransport {
    fn new(token: String) -> Result<Self, String> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(4))
            .build()
            .map_err(|error| format!("could not initialize cloud sync: {error}"))?;
        Ok(Self {
            client,
            token,
            endpoints: SyncHttpEndpoints::new(cloud_base_url()),
        })
    }

    fn provision(&self, device_id: &str) -> Result<ProvisionedWorkspace, String> {
        let response = self
            .client
            .post(self.endpoints.provision())
            .bearer_auth(&self.token)
            .json(&serde_json::json!({ "deviceId": device_id }))
            .send()
            .map_err(|error| format!("cloud provisioning failed: {error}"))?;
        if !response.status().is_success() {
            return Err(provision_error(response.status()));
        }
        read_json(response)
            .map_err(|error| format!("cloud provisioning response was invalid: {error}"))
    }

    fn send<T: serde::de::DeserializeOwned>(
        &self,
        request: reqwest::blocking::RequestBuilder,
        cancellation: &SyncCancellation,
    ) -> Result<T, TransportError> {
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        let response = request
            .bearer_auth(&self.token)
            .send()
            .map_err(|error| TransportError::Transient(error.to_string()))?;
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        let status = response.status();
        if !status.is_success() {
            return Err(transport_error(
                status,
                response.headers().get("Retry-After"),
            ));
        }
        read_json(response).map_err(|error| TransportError::Transient(error.to_string()))
    }

    fn send_bytes(
        &self,
        request: reqwest::blocking::RequestBuilder,
        cancellation: &SyncCancellation,
    ) -> Result<Option<Vec<u8>>, TransportError> {
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        let response = request
            .bearer_auth(&self.token)
            .send()
            .map_err(|error| TransportError::Transient(error.to_string()))?;
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
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
        let mut body = Vec::new();
        response
            .take(MAX_RESPONSE_BYTES + 1)
            .read_to_end(&mut body)
            .map_err(|error| TransportError::Transient(error.to_string()))?;
        if body.len() as u64 > MAX_RESPONSE_BYTES {
            return Err(TransportError::Validation(
                "cloud response exceeded its size limit".into(),
            ));
        }
        Ok(Some(body))
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
            self.client
                .post(self.endpoints.push(workspace_id))
                .json(request),
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
            self.client.get(
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
            .send_bytes(self.client.head(url), cancellation)?
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
            self.client
                .put(url)
                .header("Content-Type", "application/octet-stream")
                .body(bytes.to_vec()),
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
        self.send_bytes(self.client.get(url), cancellation)?
            .ok_or_else(|| TransportError::Validation(format!("chunk {digest} is not stored")))
    }

    fn latest_checkpoint(
        &self,
        workspace_id: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Option<WorkspaceCheckpoint>, TransportError> {
        let url = self.endpoints.checkpoint(workspace_id);
        let body = self.send_bytes(self.client.get(url), cancellation)?;
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
        let _: serde_json::Value =
            self.send(self.client.post(url).json(checkpoint), cancellation)?;
        Ok(())
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
            self.client.post(url).json(&serde_json::json!({
                "deviceId": device_id,
                "serverSequence": server_sequence,
            })),
            cancellation,
        )?;
        Ok(())
    }
}

fn read_json<T: serde::de::DeserializeOwned>(
    response: reqwest::blocking::Response,
) -> Result<T, String> {
    let mut body = Vec::new();
    response
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut body)
        .map_err(|error| error.to_string())?;
    if body.len() as u64 > MAX_RESPONSE_BYTES {
        return Err("response exceeded the configured size limit".into());
    }
    serde_json::from_slice(&body).map_err(|error| error.to_string())
}

fn provision_error(status: StatusCode) -> String {
    match status {
        StatusCode::UNAUTHORIZED => "your Skriuw session expired; sign in again".into(),
        StatusCode::FORBIDDEN => "this device is not allowed to use cloud sync".into(),
        status if status.is_server_error() => "Skriuw cloud is temporarily unavailable".into(),
        _ => "Skriuw cloud rejected the sync setup request".into(),
    }
}

fn transport_error(
    status: StatusCode,
    retry_after: Option<&reqwest::header::HeaderValue>,
) -> TransportError {
    let retry_after_ms = retry_after
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<i64>().ok())
        .map(|seconds| seconds.saturating_mul(1_000));
    classify_http_failure(status.as_u16(), retry_after_ms)
}

/// Debug builds honor SKRIUW_CLOUD_URL so end-to-end verification can target
/// the preview Worker instead of a local dev server; release builds always use
/// the production Worker.
fn cloud_base_url() -> String {
    if cfg!(debug_assertions) {
        std::env::var("SKRIUW_CLOUD_URL").unwrap_or_else(|_| "http://localhost:8787".to_string())
    } else {
        PRODUCTION_CLOUD_URL.to_string()
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
    use super::SyncRuntime;
    use skriuw_sync::SyncStatus;

    #[test]
    fn new_runtime_stays_local_only_and_inert() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let runtime = SyncRuntime::new(directory.path().join("workspace.db"));

        assert_eq!(runtime.status(), SyncStatus::LocalOnly);
        runtime.notify_local_commit();
        runtime.notify_focus();
        runtime.request_refresh();
        runtime.shutdown();
        assert_eq!(runtime.status(), SyncStatus::LocalOnly);
    }
}
