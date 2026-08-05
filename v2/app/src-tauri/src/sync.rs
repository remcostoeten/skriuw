use std::{
    io::Read,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use reqwest::{StatusCode, blocking::Client};
use serde::Deserialize;
use skriuw_domain::{SyncPullResponse, SyncPushRequest, SyncPushResponse};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{NewSyncConnection, WorkspaceSyncQueue};
use skriuw_sync::{
    SyncCancellation, SyncCoordinator, SyncCoordinatorConfig, SyncStatus, SyncTransport,
    SystemClock, TransportError,
};
use uuid::Uuid;

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
    coordinator: Mutex<Option<SyncCoordinator>>,
}

impl SyncRuntime {
    #[must_use]
    pub fn new(database_path: PathBuf) -> Self {
        Self {
            database_path,
            coordinator: Mutex::new(None),
        }
    }

    #[must_use]
    pub fn status(&self) -> SyncStatus {
        self.coordinator
            .lock()
            .ok()
            .and_then(|coordinator| coordinator.as_ref().map(SyncCoordinator::status))
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
                "this local workspace is already linked to a different Skriuw account".into(),
            );
        }
        queue
            .connect_sync(&NewSyncConnection {
                workspace_id: provisioned.workspace_id,
                device_id,
                connected_at: now_millis(),
                observed_server_sequence: existing
                    .map_or(0, |connection| connection.observed_server_sequence),
            })
            .map_err(|error| format!("could not persist the sync connection: {error}"))?;

        let coordinator = SyncCoordinator::spawn(
            queue,
            transport,
            Arc::new(SystemClock),
            SyncCoordinatorConfig::default(),
        );
        let status = coordinator.status();
        *self
            .coordinator
            .lock()
            .map_err(|_| "sync runtime lock is unavailable".to_string())? = Some(coordinator);
        Ok(status)
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
            action(coordinator);
        }
    }
}

struct HttpSyncTransport {
    client: Client,
    token: String,
    base_url: &'static str,
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
            base_url: cloud_base_url(),
        })
    }

    fn provision(&self, device_id: &str) -> Result<ProvisionedWorkspace, String> {
        let response = self
            .client
            .post(format!("{}/v1/sync/provision", self.base_url))
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

    fn chunk_url(&self, workspace_id: &str, digest: &str) -> String {
        format!(
            "{}/v1/workspaces/{workspace_id}/chunks/{digest}",
            self.base_url
        )
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
                .post(format!(
                    "{}/v1/workspaces/{workspace_id}/push",
                    self.base_url
                ))
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
            self.client.get(format!(
                "{}/v1/workspaces/{workspace_id}/pull?syncProtocolVersion={}&afterServerSequence={after_server_sequence}&limit={limit}",
                self.base_url,
                skriuw_domain::WORKSPACE_SYNC_PROTOCOL_VERSION
            )),
            cancellation,
        )
    }

    fn has_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<bool, TransportError> {
        let url = self.chunk_url(workspace_id, digest);
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
        let url = self.chunk_url(workspace_id, digest);
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
        let url = self.chunk_url(workspace_id, digest);
        self.send_bytes(self.client.get(url), cancellation)?
            .ok_or_else(|| TransportError::Validation(format!("chunk {digest} is not stored")))
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
    match status {
        StatusCode::UNAUTHORIZED => TransportError::AuthenticationRequired,
        StatusCode::FORBIDDEN | StatusCode::NOT_FOUND => TransportError::AuthorizationDenied,
        StatusCode::CONFLICT => TransportError::Conflict("server_sequence_conflict".into()),
        StatusCode::TOO_MANY_REQUESTS => TransportError::RateLimited { retry_after_ms },
        status if status.is_client_error() => TransportError::Validation("request_rejected".into()),
        _ => TransportError::Server { retry_after_ms },
    }
}

fn cloud_base_url() -> &'static str {
    if cfg!(debug_assertions) {
        "http://localhost:8787"
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
