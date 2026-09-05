use std::cell::RefCell;
use std::sync::Arc;

use skriuw_sqlite::SqliteWorkspace;
use skriuw_sync::{
    SyncCancellation, SyncClock, SyncHttpEndpoints, SyncTransport, TransportError,
    classify_http_failure, request_timeout_ms,
};
use sqlite_wasm_vfs::sahpool::{
    OpfsSAHError, OpfsSAHPoolCfgBuilder, install as install_opfs_sahpool,
};
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};
use wasm_bindgen_futures::js_sys::Reflect;

use crate::runtime::validate_database_name;
use crate::sync::{BrowserSyncEnvironment, BrowserSyncRuntime, ProgressReportingTransport};
use crate::{
    BrowserAssetStore, BrowserStorageError, BrowserStorageErrorCode, BrowserWorkerCommand,
    BrowserWorkerResponse, BrowserWorkerRuntime, BrowserWorkerValue, WORKER_PROTOCOL_VERSION,
    decode_request,
};

const OPFS_DIRECTORY: &str = ".skriuw-v2";
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

thread_local! {
    static RUNTIME: RefCell<BrowserWorkerRuntime<SqliteWorkspace>> =
        RefCell::new(BrowserWorkerRuntime::new());
    static SYNC: RefCell<BrowserSyncRuntime> = RefCell::new(BrowserSyncRuntime::new());
    static ASSETS: RefCell<Option<Result<BrowserAssetStore, String>>> =
        const { RefCell::new(None) };
}

#[wasm_bindgen]
extern "C" {
    /// Synchronous HTTP bridge owned by the storage worker script. Dedicated
    /// workers may issue synchronous XHR, which lets the shared `skriuw-sync`
    /// cycle logic run unchanged on its synchronous transport boundary.
    #[wasm_bindgen(catch, js_name = skriuwSyncHttp)]
    fn sync_http(
        request_json: String,
        body: Option<js_sys::Uint8Array>,
    ) -> Result<JsValue, JsValue>;

    /// Out-of-band progress notification posted to the renderer while a sync
    /// request is still in flight.
    #[wasm_bindgen(js_name = skriuwSyncEvent)]
    fn sync_event(event_json: String);
}

/// Installs the dedicated-worker-only OPFS SAH-pool VFS and opens exactly one
/// SQLite workspace. The caller must enforce its initialization timeout and
/// terminate the worker if this promise does not settle.
#[wasm_bindgen]
pub async fn initialize(request_json: String) -> String {
    let request = match decode_request(&request_json) {
        Ok(request) => request,
        Err(response) => return encode_response(&response),
    };
    let request_id = request.request_id;
    if request.protocol_version != WORKER_PROTOCOL_VERSION {
        return encode_response(&BrowserWorkerResponse::failure(
            request_id,
            BrowserStorageError::new(
                BrowserStorageErrorCode::UnsupportedProtocol,
                format!(
                    "Unsupported browser worker protocol version {}.",
                    request.protocol_version
                ),
                "Reload Skriuw so the renderer and storage worker use the same version.",
                false,
            ),
        ));
    }
    if request_id == 0 || request_id > 9_007_199_254_740_991 {
        return encode_response(&BrowserWorkerResponse::failure(
            request_id,
            BrowserStorageError::invalid("requestId must be a positive JavaScript-safe integer."),
        ));
    }
    let BrowserWorkerCommand::Initialize { database_name } = request.command else {
        return encode_response(&BrowserWorkerResponse::failure(
            request_id,
            BrowserStorageError::invalid("The first worker request must initialize storage."),
        ));
    };
    if let Err(error) = validate_database_name(&database_name) {
        return encode_response(&BrowserWorkerResponse::failure(request_id, error));
    }
    let lifecycle = RUNTIME.with(|runtime| runtime.borrow().lifecycle());
    if lifecycle != crate::WorkerLifecycle::Uninitialized {
        return encode_response(&BrowserWorkerResponse::failure(
            request_id,
            BrowserStorageError::new(
                BrowserStorageErrorCode::AlreadyInitialized,
                "The storage worker already owns a database.",
                "Reuse this worker or terminate it before opening another workspace.",
                false,
            ),
        ));
    }

    let config = OpfsSAHPoolCfgBuilder::new()
        .directory(OPFS_DIRECTORY)
        .initial_capacity(6)
        .clear_on_init(false)
        .build();
    if let Err(error) = install_opfs_sahpool::<sqlite_wasm_rs::WasmOsCallback>(&config, true).await
    {
        let error = map_opfs_error(error);
        RUNTIME.with(|runtime| runtime.borrow_mut().fail_terminal(error.clone()));
        return encode_response(&BrowserWorkerResponse::failure(request_id, error));
    }

    let workspace = match SqliteWorkspace::open(&database_name) {
        Ok(workspace) => workspace,
        Err(error) => {
            let error = map_open_error(error.to_string());
            RUNTIME.with(|runtime| runtime.borrow_mut().fail_terminal(error.clone()));
            return encode_response(&BrowserWorkerResponse::failure(request_id, error));
        }
    };
    ASSETS.with(|assets| {
        *assets.borrow_mut() = Some(BrowserAssetStore::open(&format!("{database_name}-assets")));
    });
    let result = RUNTIME.with(|runtime| runtime.borrow_mut().initialize(workspace));
    let response = match result {
        Ok(()) => BrowserWorkerResponse::success(request_id, BrowserWorkerValue::Ready),
        Err(error) => BrowserWorkerResponse::failure(request_id, error),
    };
    encode_response(&response)
}

/// Dispatches one already-initialized request synchronously on the worker.
/// The JavaScript owner serializes calls, adds request deadlines, and emits
/// exactly this one terminal response.
#[wasm_bindgen]
pub fn dispatch(request_json: String) -> String {
    let request = match decode_request(&request_json) {
        Ok(request) => request,
        Err(response) => return encode_response(&response),
    };
    let response = RUNTIME.with(|runtime| {
        SYNC.with(|sync| {
            ASSETS.with(|assets| {
                let assets = assets.borrow();
                let unavailable = UnavailableAssetStore {
                    reason: match assets.as_ref() {
                        None => "the browser asset store is not initialized".into(),
                        Some(Err(reason)) => reason.clone(),
                        Some(Ok(_)) => String::new(),
                    },
                };
                let store: &dyn skriuw_sync::SyncAssetStore = match assets.as_ref() {
                    Some(Ok(store)) => store,
                    _ => &unavailable,
                };
                let clock = JsClock;
                let factory =
                    |token: &str,
                     base_url: &str|
                     -> Result<Box<dyn SyncTransport>, BrowserStorageError> {
                        Ok(Box::new(ProgressReportingTransport::new(
                            XhrSyncTransport::new(token, base_url),
                            Arc::new(emit_sync_progress),
                        )))
                    };
                let environment = BrowserSyncEnvironment {
                    clock: &clock,
                    assets: store,
                    transport_factory: &factory,
                };
                runtime.borrow_mut().dispatch_with_sync(
                    request,
                    &mut sync.borrow_mut(),
                    &environment,
                )
            })
        })
    });
    encode_response(&response)
}

fn emit_sync_progress(progress: &crate::BrowserSyncProgress) {
    if let Ok(json) = serde_json::to_string(progress) {
        sync_event(json);
    }
}

struct UnavailableAssetStore {
    reason: String,
}

impl skriuw_sync::SyncAssetStore for UnavailableAssetStore {
    fn read_asset(&self, _content_hash: &str, _mime_type: &str) -> Result<Option<Vec<u8>>, String> {
        Err(self.reason.clone())
    }

    fn store_asset(
        &self,
        _content_hash: &str,
        _mime_type: &str,
        _bytes: &[u8],
    ) -> Result<(), String> {
        Err(self.reason.clone())
    }
}

struct JsClock;

impl SyncClock for JsClock {
    fn now_ms(&self) -> i64 {
        js_sys::Date::now() as i64
    }
}

struct HttpResponse {
    status: u16,
    retry_after_ms: Option<i64>,
    body: Vec<u8>,
}

/// Authenticated HTTP transport over the worker's synchronous XHR bridge.
/// URLs and status classification come from the shared `skriuw-sync` HTTP
/// contract so browser and native failure handling cannot diverge.
struct XhrSyncTransport {
    token: String,
    endpoints: SyncHttpEndpoints,
}

impl XhrSyncTransport {
    fn new(token: &str, base_url: &str) -> Self {
        Self {
            token: token.into(),
            endpoints: SyncHttpEndpoints::new(base_url),
        }
    }

    fn request(
        &self,
        method: &str,
        url: &str,
        content_type: Option<&str>,
        body: Option<&[u8]>,
        cancellation: &SyncCancellation,
    ) -> Result<HttpResponse, TransportError> {
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        let timeout_ms = request_timeout_ms(body.map_or(0, <[u8]>::len));
        let request_json = serde_json::json!({
            "method": method,
            "url": url,
            "token": self.token,
            "timeoutMs": timeout_ms,
            "contentType": content_type,
        })
        .to_string();
        let body = body.map(js_sys::Uint8Array::from);
        let value = sync_http(request_json, body)
            .map_err(|_| TransportError::Transient("the sync transport bridge failed".into()))?;
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        if let Some(failure) = object_string(&value, "transportFailure") {
            return Err(TransportError::Transient(failure));
        }
        let status = object_number(&value, "status")
            .ok_or_else(|| TransportError::Transient("the sync bridge lost the status".into()))?
            as u16;
        let retry_after_ms = object_number(&value, "retryAfterMs").map(|value| value as i64);
        let body = Reflect::get(&value, &JsValue::from_str("body"))
            .ok()
            .filter(|body| !body.is_undefined() && !body.is_null())
            .map(|body| js_sys::Uint8Array::new(&body).to_vec())
            .unwrap_or_default();
        if body.len() > MAX_RESPONSE_BYTES {
            return Err(TransportError::ResponseTooLarge);
        }
        Ok(HttpResponse {
            status,
            retry_after_ms,
            body,
        })
    }

    fn request_json<T: serde::de::DeserializeOwned>(
        &self,
        method: &str,
        url: &str,
        payload: Option<&impl serde::Serialize>,
        cancellation: &SyncCancellation,
    ) -> Result<T, TransportError> {
        let body = payload
            .map(|payload| {
                serde_json::to_vec(payload).map_err(|error| {
                    TransportError::Validation(format!("sync request is not serializable: {error}"))
                })
            })
            .transpose()?;
        let response = self.request(
            method,
            url,
            body.as_ref().map(|_| "application/json"),
            body.as_deref(),
            cancellation,
        )?;
        if !(200..300).contains(&response.status) {
            return Err(classify_http_failure(
                response.status,
                response.retry_after_ms,
            ));
        }
        serde_json::from_slice(&response.body).map_err(|error| {
            TransportError::Transient(format!("cloud response was invalid: {error}"))
        })
    }
}

fn object_number(value: &JsValue, key: &str) -> Option<f64> {
    Reflect::get(value, &JsValue::from_str(key))
        .ok()
        .and_then(|value| value.as_f64())
}

fn object_string(value: &JsValue, key: &str) -> Option<String> {
    Reflect::get(value, &JsValue::from_str(key))
        .ok()
        .and_then(|value| value.as_string())
}

impl SyncTransport for XhrSyncTransport {
    fn push(
        &self,
        workspace_id: &str,
        request: &skriuw_domain::SyncPushRequest,
        cancellation: &SyncCancellation,
    ) -> Result<skriuw_domain::SyncPushResponse, TransportError> {
        self.request_json(
            "POST",
            &self.endpoints.push(workspace_id),
            Some(request),
            cancellation,
        )
    }

    fn pull(
        &self,
        workspace_id: &str,
        after_server_sequence: u64,
        limit: usize,
        cancellation: &SyncCancellation,
    ) -> Result<skriuw_domain::SyncPullResponse, TransportError> {
        self.request_json(
            "GET",
            &self
                .endpoints
                .pull(workspace_id, after_server_sequence, limit),
            None::<&()>,
            cancellation,
        )
    }

    fn has_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<bool, TransportError> {
        let response = self.request(
            "HEAD",
            &self.endpoints.chunk(workspace_id, digest),
            None,
            None,
            cancellation,
        )?;
        match response.status {
            404 => Ok(false),
            status if (200..300).contains(&status) => Ok(true),
            status => Err(classify_http_failure(status, response.retry_after_ms)),
        }
    }

    fn put_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        bytes: &[u8],
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        let response = self.request(
            "PUT",
            &self.endpoints.chunk(workspace_id, digest),
            Some("application/octet-stream"),
            Some(bytes),
            cancellation,
        )?;
        match response.status {
            404 => Err(TransportError::Transient(
                "chunk upload was not stored".into(),
            )),
            status if (200..300).contains(&status) => Ok(()),
            status => Err(classify_http_failure(status, response.retry_after_ms)),
        }
    }

    fn get_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Vec<u8>, TransportError> {
        let response = self.request(
            "GET",
            &self.endpoints.chunk(workspace_id, digest),
            None,
            None,
            cancellation,
        )?;
        match response.status {
            404 => Err(TransportError::Validation(format!(
                "chunk {digest} is not stored"
            ))),
            status if (200..300).contains(&status) => Ok(response.body),
            status => Err(classify_http_failure(status, response.retry_after_ms)),
        }
    }

    fn latest_checkpoint(
        &self,
        workspace_id: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Option<skriuw_domain::WorkspaceCheckpoint>, TransportError> {
        let response = self.request(
            "GET",
            &self.endpoints.checkpoint(workspace_id),
            None,
            None,
            cancellation,
        )?;
        match response.status {
            404 => Ok(None),
            status if (200..300).contains(&status) => serde_json::from_slice(&response.body)
                .map(Some)
                .map_err(|error| {
                    TransportError::Validation(format!("checkpoint record was unreadable: {error}"))
                }),
            status => Err(classify_http_failure(status, response.retry_after_ms)),
        }
    }

    fn publish_checkpoint(
        &self,
        workspace_id: &str,
        checkpoint: &skriuw_domain::WorkspaceCheckpoint,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        let _: serde_json::Value = self.request_json(
            "POST",
            &self.endpoints.checkpoint(workspace_id),
            Some(checkpoint),
            cancellation,
        )?;
        Ok(())
    }

    fn acknowledge(
        &self,
        workspace_id: &str,
        device_id: &str,
        server_sequence: u64,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        let _: serde_json::Value = self.request_json(
            "POST",
            &self.endpoints.acknowledge(workspace_id),
            Some(&serde_json::json!({
                "deviceId": device_id,
                "serverSequence": server_sequence,
            })),
            cancellation,
        )?;
        Ok(())
    }
}

fn encode_response(response: &BrowserWorkerResponse) -> String {
    serde_json::to_string(response).unwrap_or_else(|_| {
        r#"{"protocolVersion":1,"requestId":0,"status":"error","value":{"code":"worker_crashed","message":"The storage worker could not encode a response.","recovery":"Reload Skriuw.","terminal":true}}"#.into()
    })
}

fn map_opfs_error(error: OpfsSAHError) -> BrowserStorageError {
    if matches!(error, OpfsSAHError::NotSupported) {
        return BrowserStorageError::new(
            BrowserStorageErrorCode::UnsupportedBrowser,
            "Durable browser storage requires OPFS in a dedicated worker.",
            "Use a current supported browser in a secure context, then reload Skriuw.",
            true,
        );
    }
    let js_value = match &error {
        OpfsSAHError::GetDirHandle(value)
        | OpfsSAHError::GetFileHandle(value)
        | OpfsSAHError::CreateSyncAccessHandle(value)
        | OpfsSAHError::IterHandle(value)
        | OpfsSAHError::GetPath(value)
        | OpfsSAHError::RemoveEntity(value)
        | OpfsSAHError::GetSize(value)
        | OpfsSAHError::Read(value)
        | OpfsSAHError::Write(value)
        | OpfsSAHError::Truncate(value)
        | OpfsSAHError::Flush(value) => Some(value),
        _ => None,
    };
    let dom_name = js_value.and_then(dom_exception_name);
    match dom_name.as_deref() {
        Some("NotAllowedError" | "SecurityError") => BrowserStorageError::new(
            BrowserStorageErrorCode::OpfsDenied,
            "The browser denied access to durable local storage.",
            "Allow site storage, leave private browsing, and reload Skriuw.",
            true,
        ),
        Some("QuotaExceededError") => BrowserStorageError::new(
            BrowserStorageErrorCode::QuotaExceeded,
            "Browser storage quota is exhausted.",
            "Free browser storage, preserve any available archive, and retry.",
            true,
        ),
        // OPFS grants one exclusive access handle per file, so a second tab
        // finds every pool slot locked by the tab that opened first.
        Some("NoModificationAllowedError" | "InvalidStateError") => BrowserStorageError::new(
            BrowserStorageErrorCode::AlreadyOpen,
            "Skriuw is already open in another browser tab.",
            "Close the other Skriuw tab, then reload this one.",
            true,
        ),
        _ => BrowserStorageError::new(
            BrowserStorageErrorCode::OpenFailed,
            "The durable browser database could not be opened.",
            "Reload Skriuw; if the failure persists, recover from a portable archive.",
            true,
        ),
    }
}

fn dom_exception_name(value: &JsValue) -> Option<String> {
    Reflect::get(value, &JsValue::from_str("name"))
        .ok()
        .and_then(|name| name.as_string())
}

fn map_open_error(message: String) -> BrowserStorageError {
    let lower = message.to_ascii_lowercase();
    let (code, public_message, recovery) = if lower.contains("newer than this application") {
        (
            BrowserStorageErrorCode::DatabaseTooNew,
            "This workspace was created by a newer Skriuw version.",
            "Update Skriuw before reopening this workspace.",
        )
    } else if lower.contains("migration") || lower.contains("schema_migrations") {
        (
            BrowserStorageErrorCode::MigrationFailed,
            "The browser database migration failed.",
            "Do not clear site data; update or reload Skriuw, then export an archive if possible.",
        )
    } else if lower.contains("malformed")
        || lower.contains("corrupt")
        || lower.contains("not a database")
    {
        (
            BrowserStorageErrorCode::CorruptDatabase,
            "The browser database appears to be corrupt.",
            "Preserve site data and recover from the latest portable archive.",
        )
    } else if lower.contains("full") || lower.contains("quota") {
        (
            BrowserStorageErrorCode::QuotaExceeded,
            "Browser storage quota is exhausted.",
            "Free browser storage and retry without clearing Skriuw site data.",
        )
    } else {
        (
            BrowserStorageErrorCode::OpenFailed,
            "The durable browser database could not be opened.",
            "Reload Skriuw; if the failure persists, recover from a portable archive.",
        )
    };
    BrowserStorageError::new(code, public_message, recovery, true)
}
