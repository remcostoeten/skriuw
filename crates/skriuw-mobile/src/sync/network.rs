//! The network and blob ports the sync cycle reaches the cloud through.
//!
//! The core carries no HTTP client, no TLS stack and no certificate roots:
//! `tests/dependencies.rs` refuses them, and the reason is not only binary
//! size. A Rust TLS stack inside the facade is what produces the rustls
//! `CryptoProvider` panic the desktop build still reports — two providers in
//! one graph, `ClientConfig::builder()` unable to choose, and the panic
//! landing on the sync thread. Here that thread belongs to the foreign
//! runtime, so an unwind across it is undefined behaviour rather than a
//! degraded wake channel.
//!
//! So the platform does the networking. The native module implements
//! [`MobileSyncNetwork`] over OkHttp or `URLSession`, which already hold the
//! system trust store, proxy configuration and connection reuse, and this
//! module adapts that one call into the whole [`SyncTransport`] surface.

use std::sync::{Arc, RwLock};

use skriuw_domain::{
    SyncPullResponse, SyncPushRequest, SyncPushResponse, WorkspaceCheckpoint,
    WorkspaceEncryptionMarker,
};
use skriuw_sync::{
    SyncCancellation, SyncHttpEndpoints, SyncTransport, TransportError, classify_http_failure,
    classify_optional_route_failure, rejected_error_code, request_timeout_ms,
};

use crate::error::MobileError;

/// A response larger than this is refused rather than buffered: a phone must
/// not be pushed out of memory by a service answering with more than the
/// protocol allows.
pub(crate) const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

/// One outbound sync request. The deadline travels with it because the
/// protocol sizes it from the body, and the platform client is the only thing
/// that can enforce it.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct SyncRequest {
    /// `GET`, `HEAD`, `POST` or `PUT`.
    pub method: String,
    pub url: String,
    /// The bearer credential for this request. It is held in the core for the
    /// lifetime of the session and handed straight to the platform client; it
    /// is never written to JavaScript-reachable storage.
    pub bearer: String,
    pub content_type: Option<String>,
    pub body: Vec<u8>,
    pub timeout_ms: u64,
}

/// What the platform client answered. A request that never produced a status
/// reports `transport_error` instead, so "the network is down" and "the
/// service said no" stay different outcomes all the way to sync status.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct SyncResponse {
    pub status: u16,
    /// `Retry-After`, already in milliseconds. The cycle honours it.
    pub retry_after_ms: Option<i64>,
    pub body: Vec<u8>,
    pub transport_error: Option<String>,
}

impl SyncResponse {
    /// Convenience for implementations and for tests: a completed exchange.
    #[must_use]
    pub fn completed(status: u16, body: Vec<u8>) -> Self {
        Self {
            status,
            retry_after_ms: None,
            body,
            transport_error: None,
        }
    }

    /// Convenience for implementations and for tests: the request never
    /// reached a status.
    #[must_use]
    pub fn failed(detail: impl Into<String>) -> Self {
        Self {
            status: 0,
            retry_after_ms: None,
            body: Vec::new(),
            transport_error: Some(detail.into()),
        }
    }
}

/// The one call the platform supplies. It is invoked from the sync
/// coordinator's own thread and is expected to block until the exchange
/// finishes or the deadline passes; it is never reached from an interaction
/// path.
#[uniffi::export(with_foreign)]
pub trait MobileSyncNetwork: Send + Sync {
    fn send(&self, request: SyncRequest) -> Result<SyncResponse, MobileError>;
}

/// Local bytes for content too large to travel inline. Optional: a build
/// without stored media supplies none, and an inbound change that needs one
/// is reported through the recovery surface rather than applied incompletely.
#[uniffi::export(with_foreign)]
pub trait MobileAssetStore: Send + Sync {
    /// `None` when this device does not hold the asset.
    fn read_asset(
        &self,
        content_hash: String,
        mime_type: String,
    ) -> Result<Option<Vec<u8>>, MobileError>;
    /// Storing identical bytes twice must be a no-op.
    fn store_asset(
        &self,
        content_hash: String,
        mime_type: String,
        bytes: Vec<u8>,
    ) -> Result<(), MobileError>;
}

pub(crate) type SharedToken = Arc<RwLock<String>>;

/// Adapts the single foreign call into the sync transport contract.
pub(crate) struct NetworkTransport {
    network: Arc<dyn MobileSyncNetwork>,
    token: SharedToken,
    endpoints: SyncHttpEndpoints,
}

impl NetworkTransport {
    pub(crate) fn new(
        network: Arc<dyn MobileSyncNetwork>,
        token: SharedToken,
        base_url: &str,
    ) -> Self {
        Self {
            network,
            token,
            endpoints: SyncHttpEndpoints::new(base_url),
        }
    }

    fn request(&self, method: &str, url: String, body: Vec<u8>, json: bool) -> SyncRequest {
        SyncRequest {
            method: method.to_owned(),
            url,
            bearer: self
                .token
                .read()
                .map(|token| token.clone())
                .unwrap_or_default(),
            content_type: json.then(|| "application/json".to_owned()),
            timeout_ms: request_timeout_ms(body.len()),
            body,
        }
    }

    fn json_request(
        &self,
        method: &str,
        url: String,
        value: &impl serde::Serialize,
    ) -> Result<SyncRequest, TransportError> {
        let body = serde_json::to_vec(value).map_err(|error| {
            TransportError::Validation(format!("sync request is not serializable: {error}"))
        })?;
        Ok(self.request(method, url, body, true))
    }

    fn exchange(
        &self,
        request: SyncRequest,
        cancellation: &SyncCancellation,
    ) -> Result<SyncResponse, TransportError> {
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        let response = self
            .network
            .send(request)
            .map_err(|error| TransportError::Transient(error.to_string()))?;
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        if let Some(detail) = response.transport_error {
            return Err(TransportError::Transient(detail));
        }
        if response.body.len() > MAX_RESPONSE_BYTES {
            return Err(TransportError::ResponseTooLarge);
        }
        Ok(SyncResponse {
            transport_error: None,
            ..response
        })
    }

    /// Runs one request whose only acceptable outcome is a success body.
    pub(crate) fn provision(&self, device_id: &str) -> Result<ProvisionedWorkspace, MobileError> {
        let body = serde_json::json!({ "deviceId": device_id })
            .to_string()
            .into_bytes();
        let request = self.request("POST", self.endpoints.provision(), body, true);
        let response = self.network.send(request)?;
        if let Some(detail) = response.transport_error {
            return Err(MobileError::sync(format!(
                "cloud provisioning failed: {detail}"
            )));
        }
        if !(200..300).contains(&response.status) {
            return Err(provision_error(response.status));
        }
        if response.body.len() > MAX_RESPONSE_BYTES {
            return Err(MobileError::sync(
                "cloud provisioning response was too large",
            ));
        }
        serde_json::from_slice(&response.body).map_err(|error| {
            MobileError::sync(format!("cloud provisioning response was invalid: {error}"))
        })
    }

    fn decode<T: serde::de::DeserializeOwned>(
        &self,
        request: SyncRequest,
        cancellation: &SyncCancellation,
    ) -> Result<T, TransportError> {
        let response = self.exchange(request, cancellation)?;
        if !is_success(response.status) {
            return Err(classify_http_failure(
                response.status,
                response.retry_after_ms,
            ));
        }
        serde_json::from_slice(&response.body)
            .map_err(|error| TransportError::Transient(error.to_string()))
    }

    /// Sends a request on a route older deployments do not serve, so a 404
    /// that names no specific decision is reported as an absent route rather
    /// than as a denial the caller cannot act on.
    fn decode_optional_route<T: serde::de::DeserializeOwned>(
        &self,
        request: SyncRequest,
        cancellation: &SyncCancellation,
    ) -> Result<T, TransportError> {
        let response = self.exchange(request, cancellation)?;
        if !is_success(response.status) {
            return Err(classify_optional_route_failure(
                response.status,
                rejected_error_code(&response.body).as_deref(),
                response.retry_after_ms,
            ));
        }
        serde_json::from_slice(&response.body)
            .map_err(|error| TransportError::Transient(error.to_string()))
    }

    fn bytes(
        &self,
        request: SyncRequest,
        cancellation: &SyncCancellation,
    ) -> Result<Option<Vec<u8>>, TransportError> {
        let response = self.exchange(request, cancellation)?;
        if response.status == 404 {
            return Ok(None);
        }
        if !is_success(response.status) {
            return Err(classify_http_failure(
                response.status,
                response.retry_after_ms,
            ));
        }
        Ok(Some(response.body))
    }
}

impl SyncTransport for NetworkTransport {
    fn push(
        &self,
        workspace_id: &str,
        request: &SyncPushRequest,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPushResponse, TransportError> {
        self.decode(
            self.json_request("POST", self.endpoints.push(workspace_id), request)?,
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
        self.decode(
            self.request(
                "GET",
                self.endpoints
                    .pull(workspace_id, after_server_sequence, limit),
                Vec::new(),
                false,
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
            .bytes(self.request("HEAD", url, Vec::new(), false), cancellation)?
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
        let mut request = self.request("PUT", url, bytes.to_vec(), false);
        request.content_type = Some("application/octet-stream".to_owned());
        self.bytes(request, cancellation)?
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
        self.bytes(self.request("GET", url, Vec::new(), false), cancellation)?
            .ok_or_else(|| TransportError::Validation(format!("chunk {digest} is not stored")))
    }

    fn latest_checkpoint(
        &self,
        workspace_id: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Option<WorkspaceCheckpoint>, TransportError> {
        let url = self.endpoints.checkpoint(workspace_id);
        let Some(body) = self.bytes(self.request("GET", url, Vec::new(), false), cancellation)?
        else {
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
            self.decode(self.json_request("POST", url, checkpoint)?, cancellation)?;
        Ok(())
    }

    fn workspace_encryption(
        &self,
        workspace_id: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Option<WorkspaceEncryptionMarker>, TransportError> {
        let url = self.endpoints.encryption(workspace_id);
        let marker: Option<WorkspaceEncryptionMarker> =
            self.decode_optional_route(self.request("GET", url, Vec::new(), false), cancellation)?;
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
        let marker: WorkspaceEncryptionMarker = self.decode_optional_route(
            self.json_request(
                "POST",
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
        let _: serde_json::Value = self.decode(
            self.json_request(
                "POST",
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

/// The blob half of the cycle, adapted the same way. A build without a store
/// reads nothing and refuses to write, which surfaces the change in the
/// recovery view instead of silently dropping its content.
pub(crate) struct AssetBridge {
    store: Option<Arc<dyn MobileAssetStore>>,
}

impl AssetBridge {
    pub(crate) fn new(store: Option<Arc<dyn MobileAssetStore>>) -> Self {
        Self { store }
    }
}

impl skriuw_sync::SyncAssetStore for AssetBridge {
    fn read_asset(&self, content_hash: &str, mime_type: &str) -> Result<Option<Vec<u8>>, String> {
        let Some(store) = &self.store else {
            return Ok(None);
        };
        store
            .read_asset(content_hash.to_owned(), mime_type.to_owned())
            .map_err(|error| error.to_string())
    }

    fn store_asset(&self, content_hash: &str, mime_type: &str, bytes: &[u8]) -> Result<(), String> {
        let Some(store) = &self.store else {
            return Err("this device does not store media yet".into());
        };
        store
            .store_asset(
                content_hash.to_owned(),
                mime_type.to_owned(),
                bytes.to_vec(),
            )
            .map_err(|error| error.to_string())
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProvisionedWorkspace {
    pub(crate) workspace_id: String,
    pub(crate) device_id: String,
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn provision_error(status: u16) -> MobileError {
    match status {
        401 => MobileError::SessionExpired,
        403 => MobileError::sync("this device is not allowed to use cloud sync"),
        500..=599 => MobileError::sync("Skriuw cloud is temporarily unavailable"),
        _ => MobileError::sync("Skriuw cloud rejected the sync setup request"),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::{
        AssetBridge, MobileAssetStore, MobileSyncNetwork, NetworkTransport, SyncRequest,
        SyncResponse, provision_error,
    };
    use crate::error::MobileError;
    use skriuw_sync::{SyncAssetStore, SyncCancellation, SyncTransport, TransportError};
    use std::sync::{Arc, Mutex, RwLock};

    /// Records what the core asked the platform to send and answers with
    /// whatever the test queued.
    pub(crate) struct RecordingNetwork {
        pub(crate) sent: Mutex<Vec<SyncRequest>>,
        answers: Mutex<Vec<Result<SyncResponse, MobileError>>>,
    }

    impl RecordingNetwork {
        pub(crate) fn new(answers: Vec<Result<SyncResponse, MobileError>>) -> Arc<Self> {
            Arc::new(Self {
                sent: Mutex::new(Vec::new()),
                answers: Mutex::new(answers.into_iter().rev().collect()),
            })
        }
    }

    impl MobileSyncNetwork for RecordingNetwork {
        fn send(&self, request: SyncRequest) -> Result<SyncResponse, MobileError> {
            self.sent.lock().expect("sent").push(request);
            self.answers
                .lock()
                .expect("answers")
                .pop()
                .unwrap_or_else(|| Ok(SyncResponse::failed("no answer queued")))
        }
    }

    fn transport(network: Arc<RecordingNetwork>) -> NetworkTransport {
        NetworkTransport::new(
            network,
            Arc::new(RwLock::new("session-token".to_owned())),
            "https://cloud.workers.dev/",
        )
    }

    #[test]
    fn provisioning_carries_the_device_and_the_bearer_and_nothing_else() {
        let network = RecordingNetwork::new(vec![Ok(SyncResponse::completed(
            200,
            br#"{"workspaceId":"w_1","deviceId":"device-1"}"#.to_vec(),
        ))]);
        let provisioned = transport(Arc::clone(&network))
            .provision("device-1")
            .expect("provision");

        assert_eq!(provisioned.workspace_id, "w_1");
        assert_eq!(provisioned.device_id, "device-1");
        let sent = network.sent.lock().expect("sent");
        let request = sent.first().expect("one request");
        assert_eq!(request.method, "POST");
        assert_eq!(request.url, "https://cloud.workers.dev/v1/sync/provision");
        assert_eq!(request.bearer, "session-token");
        assert_eq!(request.body, br#"{"deviceId":"device-1"}"#);
        assert!(request.timeout_ms > 0);
    }

    #[test]
    fn a_refused_credential_is_reported_as_expiry_rather_than_a_retryable_failure() {
        let network = RecordingNetwork::new(vec![Ok(SyncResponse::completed(401, Vec::new()))]);
        assert!(matches!(
            transport(network).provision("device-1"),
            Err(MobileError::SessionExpired),
        ));
        assert!(matches!(provision_error(403), MobileError::Sync { .. }));
        assert!(matches!(provision_error(503), MobileError::Sync { .. }));
    }

    #[test]
    fn a_request_that_never_reached_a_status_stays_transient() {
        let network = RecordingNetwork::new(vec![Ok(SyncResponse::failed("offline"))]);
        let error = transport(network)
            .pull("w_1", 0, 50, &SyncCancellation::new())
            .expect_err("must fail");
        assert!(matches!(error, TransportError::Transient(detail) if detail == "offline"));
    }

    #[test]
    fn an_oversized_body_is_refused_before_it_is_parsed() {
        let network = RecordingNetwork::new(vec![Ok(SyncResponse::completed(
            200,
            vec![b'x'; super::MAX_RESPONSE_BYTES + 1],
        ))]);
        assert!(matches!(
            transport(network).pull("w_1", 0, 50, &SyncCancellation::new()),
            Err(TransportError::ResponseTooLarge),
        ));
    }

    #[test]
    fn a_cancelled_cycle_never_reaches_the_platform() {
        let network = RecordingNetwork::new(Vec::new());
        let cancellation = SyncCancellation::new();
        cancellation.shutdown();
        assert!(matches!(
            transport(Arc::clone(&network)).pull("w_1", 0, 50, &cancellation),
            Err(TransportError::Cancelled),
        ));
        assert!(network.sent.lock().expect("sent").is_empty());
    }

    #[test]
    fn a_missing_chunk_is_absence_rather_than_a_failure() {
        let network = RecordingNetwork::new(vec![Ok(SyncResponse::completed(404, Vec::new()))]);
        assert!(
            !transport(network)
                .has_chunk("w_1", "digest", &SyncCancellation::new())
                .expect("has_chunk")
        );
    }

    #[test]
    fn a_foreign_failure_becomes_a_transient_cycle_outcome_rather_than_an_unwind() {
        let network =
            RecordingNetwork::new(vec![Err(MobileError::sync("platform client refused"))]);
        assert!(matches!(
            transport(network).pull("w_1", 0, 50, &SyncCancellation::new()),
            Err(TransportError::Transient(_)),
        ));
    }

    struct RefusingStore;

    impl MobileAssetStore for RefusingStore {
        fn read_asset(
            &self,
            _content_hash: String,
            _mime_type: String,
        ) -> Result<Option<Vec<u8>>, MobileError> {
            Ok(None)
        }

        fn store_asset(
            &self,
            _content_hash: String,
            _mime_type: String,
            _bytes: Vec<u8>,
        ) -> Result<(), MobileError> {
            Err(MobileError::sync("blob directory is full"))
        }
    }

    #[test]
    fn a_build_without_media_reads_nothing_and_refuses_to_write() {
        let bridge = AssetBridge::new(None);
        assert_eq!(bridge.read_asset("hash", "image/png").expect("read"), None);
        assert!(bridge.store_asset("hash", "image/png", b"bytes").is_err());
    }

    #[test]
    fn a_store_failure_is_reported_rather_than_swallowed() {
        let bridge = AssetBridge::new(Some(Arc::new(RefusingStore)));
        assert_eq!(bridge.read_asset("hash", "image/png").expect("read"), None);
        assert!(
            bridge
                .store_asset("hash", "image/png", b"bytes")
                .expect_err("must fail")
                .contains("blob directory is full")
        );
    }
}
