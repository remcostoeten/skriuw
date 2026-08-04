use std::cell::RefCell;

use skriuw_sqlite::SqliteWorkspace;
use sqlite_wasm_vfs::sahpool::{
    OpfsSAHError, OpfsSAHPoolCfgBuilder, install as install_opfs_sahpool,
};
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};
use wasm_bindgen_futures::js_sys::Reflect;

use crate::runtime::validate_database_name;
use crate::{
    BrowserStorageError, BrowserStorageErrorCode, BrowserWorkerCommand, BrowserWorkerResponse,
    BrowserWorkerRuntime, BrowserWorkerValue, WORKER_PROTOCOL_VERSION, decode_request,
};

const OPFS_DIRECTORY: &str = ".skriuw-v2";

thread_local! {
    static RUNTIME: RefCell<BrowserWorkerRuntime<SqliteWorkspace>> =
        RefCell::new(BrowserWorkerRuntime::new());
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

    let workspace = match SqliteWorkspace::open(database_name) {
        Ok(workspace) => workspace,
        Err(error) => {
            let error = map_open_error(error.to_string());
            RUNTIME.with(|runtime| runtime.borrow_mut().fail_terminal(error.clone()));
            return encode_response(&BrowserWorkerResponse::failure(request_id, error));
        }
    };
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
    let response = RUNTIME.with(|runtime| runtime.borrow_mut().dispatch(request));
    encode_response(&response)
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
