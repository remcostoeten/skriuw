use std::{
    io::Read,
    net::TcpStream,
    path::PathBuf,
    sync::Arc,
    time::Duration,
};

use reqwest::{Method, StatusCode, blocking::Client};
use skriuw_domain::{
    SyncPullResponse, SyncPushRequest, SyncPushResponse, SyncRecoveryView, WorkspaceCheckpoint,
    WorkspaceEncryptionMarker,
};
use skriuw_images::ImageStore;
use skriuw_sqlite::SqliteWorkspace;
use skriuw_sync::{
    CloudOriginPolicy, MaintenanceSuspension, ProvisionFailure, ProvisionedWorkspace,
    SyncAssetStore, SyncCancellation, SyncCloud, SyncHttpEndpoints, SyncProvisioner,
    SyncRuntimeConfig, SyncRuntimeError, SyncSessionToken, SyncStatus, SyncStatusObserver,
    SyncTransport, SyncWorkspaceObserver, SystemClock, TransportError, TrustedCloudOrigin,
    WakeConnectError, WakeConnector, WakeFrame, WakeListenerConfig, WakeSocket,
    classify_http_failure, classify_optional_route_failure, classify_provision_status,
    classify_rejected_response, decode_provisioned_workspace, is_well_formed_session_token,
    rejected_error_code, request_timeout_ms,
};

pub use skriuw_sync::WorkspaceEncryptionState;

pub type SessionExpiredObserver = Arc<dyn Fn() + Send + Sync>;

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
const LOCAL_CLOUD_URL: &str = "http://localhost:8787";
const MAX_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const PUSH_LISTENER_READ_TIMEOUT: Duration = Duration::from_secs(30);

/// The desktop's way to the cloud: a blocking `reqwest` client and a
/// `tungstenite` wake socket.
struct DesktopCloud;

impl SyncCloud for DesktopCloud {
    type Transport = HttpSyncTransport;

    fn open_transport(
        &self,
        session: SyncSessionToken,
        endpoints: SyncHttpEndpoints,
    ) -> Result<HttpSyncTransport, String> {
        HttpSyncTransport::new(session, endpoints)
    }

    fn wake_connector(&self) -> Option<Arc<dyn WakeConnector>> {
        Some(Arc::new(TungsteniteWake))
    }
}

/// The desktop shell's handle on the shared [`skriuw_sync::SyncRuntime`]. It
/// adds only what is desktop-specific: the image blob store, the HTTP and
/// WebSocket clients, the debug cloud override and string errors for Tauri
/// commands.
pub struct SyncRuntime {
    inner: skriuw_sync::SyncRuntime<SqliteWorkspace, DesktopCloud>,
}

impl SyncRuntime {
    #[cfg(test)]
    #[must_use]
    pub fn new(database_path: PathBuf) -> Self {
        Self::build(database_path, None, None)
    }

    #[must_use]
    pub fn with_observers(
        database_path: PathBuf,
        workspace_observer: SyncWorkspaceObserver,
        session_expired: SessionExpiredObserver,
    ) -> Self {
        let status_observer: SyncStatusObserver = Arc::new(move |status: &SyncStatus| {
            if *status == SyncStatus::AuthenticationRequired {
                session_expired();
            }
        });
        Self::build(
            database_path,
            Some(workspace_observer),
            Some(status_observer),
        )
    }

    fn build(
        database_path: PathBuf,
        workspace_observer: Option<SyncWorkspaceObserver>,
        status_observer: Option<SyncStatusObserver>,
    ) -> Self {
        let blob_directory = crate::image_blob_path(&database_path);
        Self {
            inner: skriuw_sync::SyncRuntime::new(
                Box::new(move || SqliteWorkspace::open(&database_path)),
                DesktopCloud,
                SyncRuntimeConfig {
                    clock: Arc::new(SystemClock),
                    assets: Arc::new(ImageAssetStore { blob_directory }),
                    status_observer,
                    workspace_observer,
                    wake: WakeListenerConfig::default(),
                },
            ),
        }
    }

    #[must_use]
    pub fn status(&self) -> SyncStatus {
        self.inner.status()
    }

    pub fn notify_local_commit(&self) {
        self.inner.notify_local_commit();
    }

    pub fn notify_focus(&self) {
        self.inner.notify_focus();
    }

    pub fn request_refresh(&self) {
        self.inner.request_refresh();
    }

    pub fn set_online(&self, online: bool) {
        self.inner.set_online(online);
    }

    pub fn set_visibility(&self, visible: bool, focused: bool) {
        self.inner.set_visibility(visible, focused);
    }

    /// Opens (or reopens) the authenticated session. The renderer names the
    /// cloud origin; it is validated here so a compromised renderer message
    /// cannot point the bearer token at an arbitrary host.
    pub fn connect(&self, token: String, base_url: String) -> Result<SyncStatus, String> {
        if !is_well_formed_session_token(&token) {
            return Err(SyncRuntimeError::InvalidSession.to_string());
        }
        let origin = trusted_cloud_base_url(&base_url)?;
        self.inner.connect(token, origin).map_err(describe)
    }

    /// Cloud workspace this local store has already been linked to, if any.
    /// Read before routing an account so a store that predates the workspace
    /// registry is recognised as belonging to the account that linked it.
    pub fn linked_workspace_id(&self) -> Result<Option<String>, String> {
        self.inner.linked_workspace_id().map_err(describe)
    }

    pub fn recovery_view(&self) -> Result<SyncRecoveryView, String> {
        self.inner.recovery_view().map_err(describe)
    }

    pub fn retry_blocked_operation(&self, blocked_id: &str) -> Result<SyncRecoveryView, String> {
        self.inner
            .retry_blocked_operation(blocked_id)
            .map_err(describe)
    }

    pub fn discard_blocked_operation(&self, blocked_id: &str) -> Result<SyncRecoveryView, String> {
        self.inner
            .discard_blocked_operation(blocked_id)
            .map_err(describe)
    }

    pub fn encryption_state(&self) -> Result<WorkspaceEncryptionState, String> {
        self.inner.encryption_state().map_err(describe)
    }

    /// Turns encryption on and returns the recovery code exactly once.
    pub fn enable_encryption(&self) -> Result<String, String> {
        let mut entropy = zeroize::Zeroizing::new([0_u8; 20]);
        getrandom::fill(entropy.as_mut_slice()).map_err(|error| {
            format!("could not gather randomness for the recovery code: {error}")
        })?;
        self.inner
            .enable_encryption(entropy.as_slice())
            .map_err(describe)
    }

    pub fn unlock_encryption(&self, recovery_code: &str) -> Result<(), String> {
        self.inner
            .unlock_encryption(recovery_code)
            .map_err(describe)
    }

    /// Pause network access without discarding the durable connection or outbox.
    pub fn pause_for_logout(&self) -> SyncStatus {
        self.inner.pause()
    }

    pub fn shutdown(&self) {
        self.inner.shutdown();
    }

    /// Stops sync and refuses `connect` until the returned guard drops. Waits
    /// for an in-flight `connect` to store its coordinator first, so call it
    /// from a blocking thread.
    #[must_use]
    pub fn suspend_for_maintenance(&self) -> MaintenanceSuspension<'_> {
        self.inner.suspend_for_maintenance()
    }

    /// Stops sync but waits at most `limit` for the worker, so quitting never
    /// hangs on an in-flight request.
    pub fn shutdown_within(&self, limit: Duration) -> bool {
        self.inner.shutdown_within(limit)
    }
}

fn describe(error: SyncRuntimeError) -> String {
    error.to_string()
}

struct TungsteniteWake;

impl WakeConnector for TungsteniteWake {
    fn connect(&self, url: &str, token: &str) -> Result<Box<dyn WakeSocket>, WakeConnectError> {
        use tungstenite::client::IntoClientRequest;

        let mut request = url.into_client_request().map_err(|error| {
            WakeConnectError::Failed(format!("events request was invalid: {error}"))
        })?;
        request.headers_mut().insert(
            "Authorization",
            format!("Bearer {token}").parse().map_err(|_| {
                WakeConnectError::Failed("session token cannot be sent as a header".into())
            })?,
        );
        let (mut socket, _response) =
            tungstenite::connect(request).map_err(|error| match error {
                tungstenite::Error::Http(response)
                    if matches!(response.status().as_u16(), 401 | 403) =>
                {
                    WakeConnectError::Rejected(response.status().as_u16())
                }
                error => WakeConnectError::Failed(format!("events connect failed: {error}")),
            })?;
        let stream = match socket.get_mut() {
            tungstenite::stream::MaybeTlsStream::Plain(stream) => Some(stream),
            tungstenite::stream::MaybeTlsStream::Rustls(stream) => Some(stream.get_mut()),
            _ => None,
        };
        if let Some(stream) = stream {
            let _ = stream.set_read_timeout(Some(PUSH_LISTENER_READ_TIMEOUT));
        }
        Ok(Box::new(TungsteniteSocket(socket)))
    }
}

struct TungsteniteSocket(tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<TcpStream>>);

impl WakeSocket for TungsteniteSocket {
    fn read(&mut self) -> WakeFrame {
        match self.0.read() {
            Ok(tungstenite::Message::Text(text)) => WakeFrame::Text(text.as_str().to_owned()),
            Ok(tungstenite::Message::Close(_)) => WakeFrame::Closed,
            Ok(_) => WakeFrame::Ignored,
            Err(tungstenite::Error::Io(error))
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                WakeFrame::Idle
            }
            Err(_) => WakeFrame::Closed,
        }
    }

    // The read timeout doubles as the keepalive tick; the service answers with
    // an auto-response pong without waking.
    fn keepalive(&mut self) -> bool {
        self.0
            .send(tungstenite::Message::Text("ping".into()))
            .is_ok()
    }

    fn close(&mut self) {
        let _ = self.0.close(None);
    }
}

struct HttpSyncTransport {
    client: Client,
    token: SyncSessionToken,
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
    fn new(token: SyncSessionToken, endpoints: SyncHttpEndpoints) -> Result<Self, String> {
        let client = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .build()
            .map_err(|error| format!("could not initialize cloud sync: {error}"))?;
        Ok(Self {
            client,
            token,
            endpoints,
        })
    }

    fn bearer(&self) -> String {
        self.token
            .read()
            .map(|token| token.clone())
            .unwrap_or_default()
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

impl SyncProvisioner for HttpSyncTransport {
    fn provision(&self, device_id: &str) -> Result<ProvisionedWorkspace, ProvisionFailure> {
        let body = serde_json::json!({ "deviceId": device_id }).to_string();
        let response = self
            .client
            .post(self.endpoints.provision())
            .bearer_auth(self.bearer())
            .timeout(Duration::from_millis(request_timeout_ms(body.len())))
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .map_err(|error| ProvisionFailure::Unreachable(error.to_string()))?;
        if !response.status().is_success() {
            return Err(classify_provision_status(response.status().as_u16()));
        }
        let body = read_bounded(response)
            .map_err(|error| ProvisionFailure::InvalidResponse(error.to_string()))?;
        decode_provisioned_workspace(&body)
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
fn trusted_cloud_base_url(base_url: &str) -> Result<TrustedCloudOrigin, String> {
    if cfg!(debug_assertions)
        && let Ok(override_url) = std::env::var("SKRIUW_CLOUD_URL")
    {
        return Ok(TrustedCloudOrigin::developer_override(override_url));
    }
    let policy = if cfg!(debug_assertions) {
        CloudOriginPolicy::LOCALHOST
    } else {
        CloudOriginPolicy::RELEASE
    };
    skriuw_sync::trusted_cloud_base_url(base_url, policy).map_err(|error| error.to_string())
}

fn development_cloud_base_url(mode: Option<&str>) -> &'static str {
    if mode == Some("local") {
        LOCAL_CLOUD_URL
    } else {
        PRODUCTION_CLOUD_URL
    }
}

#[cfg(test)]
mod tests {
    use super::{
        LOCAL_CLOUD_URL, PRODUCTION_CLOUD_URL, SyncRuntime, development_cloud_base_url,
        trusted_cloud_base_url,
    };
    use skriuw_sync::SyncStatus;
    use std::{
        io::{BufRead, BufReader, Read, Write},
        net::{TcpListener, TcpStream},
        sync::{
            Arc,
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
    fn only_skriuw_origins_are_trusted_with_the_session_token() {
        if std::env::var("SKRIUW_CLOUD_URL").is_ok() {
            return;
        }
        assert!(trusted_cloud_base_url(PRODUCTION_CLOUD_URL).is_ok());
        assert!(trusted_cloud_base_url("https://sync.skriuw.app").is_ok());
        assert!(trusted_cloud_base_url("https://evil.example").is_err());
        assert!(trusted_cloud_base_url("https://skriuw.app.evil.example").is_err());
        assert!(trusted_cloud_base_url("http://sync.skriuw.app").is_err());
        assert_eq!(
            trusted_cloud_base_url(LOCAL_CLOUD_URL).is_ok(),
            cfg!(debug_assertions)
        );
        assert!(trusted_cloud_base_url("http://localhost.evil.example").is_err());
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
    fn development_uses_production_cloud_unless_local_is_explicit() {
        assert_eq!(development_cloud_base_url(None), PRODUCTION_CLOUD_URL);
        assert_eq!(
            development_cloud_base_url(Some("cloud")),
            PRODUCTION_CLOUD_URL
        );
        assert_eq!(development_cloud_base_url(Some("local")), LOCAL_CLOUD_URL);
    }
}
