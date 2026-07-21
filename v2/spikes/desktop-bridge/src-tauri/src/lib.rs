use std::{
    env, fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use skriuw_domain::{OperationAck, SearchHit, WorkspaceOperationEnvelope, WorkspaceSnapshot};
use skriuw_runtime::WorkspaceRuntime;
use skriuw_storage::{StorageError, WorkspaceStorage};
use tauri::State;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeResponse {
    sequence: usize,
    payload_bytes: usize,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkResult {
    navigation: serde_json::Value,
    echo_empty: serde_json::Value,
    echo_one_kilobyte: serde_json::Value,
    echo_sixty_four_kilobytes: serde_json::Value,
    runtime_round_trip: serde_json::Value,
    optimistic: serde_json::Value,
    measured_at: String,
    user_agent: String,
}

struct BridgeState {
    command_count: AtomicUsize,
    result_path: PathBuf,
    runtime: WorkspaceRuntime,
}

struct MemoryStorage;

impl WorkspaceStorage for MemoryStorage {
    fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError> {
        Err(StorageError::Backend("unused bridge bootstrap".into()))
    }

    fn apply_operations(
        &self,
        _operations: &[WorkspaceOperationEnvelope],
    ) -> Result<OperationAck, StorageError> {
        Err(StorageError::Backend("unused bridge operation".into()))
    }

    fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, StorageError> {
        if limit == 0 {
            return Ok(Vec::new());
        }
        if query.starts_with("optimistic-") {
            thread::sleep(Duration::from_millis(1));
        }
        Ok(vec![SearchHit {
            note_id: "bridge-note".into(),
            title: "Bridge result".into(),
            snippet: query.into(),
            score: 0.0,
        }])
    }
}

#[tauri::command]
fn command_count(state: State<'_, BridgeState>) -> usize {
    state.command_count.load(Ordering::Relaxed)
}

#[tauri::command]
fn echo(sequence: usize, payload: String, state: State<'_, BridgeState>) -> BridgeResponse {
    state.command_count.fetch_add(1, Ordering::Relaxed);
    BridgeResponse {
        sequence,
        payload_bytes: payload.len(),
    }
}

#[tauri::command]
async fn runtime_round_trip(
    sequence: usize,
    payload: String,
    state: State<'_, BridgeState>,
) -> Result<BridgeResponse, String> {
    state.command_count.fetch_add(1, Ordering::Relaxed);
    let completion = state
        .runtime
        .search(payload, 1)
        .map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let hits = completion.wait().map_err(|error| error.to_string())?;
        let hit = hits
            .first()
            .ok_or_else(|| "runtime returned no result".to_string())?;
        Ok(BridgeResponse {
            sequence,
            payload_bytes: hit.snippet.len(),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn publish_result(result: BenchmarkResult, state: State<'_, BridgeState>) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(&result).map_err(|error| error.to_string())?;
    fs::write(&state.result_path, json).map_err(|error| error.to_string())
}

#[tauri::command]
fn publish_failure(message: String, state: State<'_, BridgeState>) -> Result<(), String> {
    fs::write(&state.result_path, format!("FAILURE: {message}")).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result_path = env::var_os("SKRIUW_BRIDGE_RESULT")
        .map(PathBuf::from)
        .expect("SKRIUW_BRIDGE_RESULT must identify the benchmark output");
    tauri::Builder::default()
        .manage(BridgeState {
            command_count: AtomicUsize::new(0),
            result_path,
            runtime: WorkspaceRuntime::spawn(MemoryStorage),
        })
        .invoke_handler(tauri::generate_handler![
            command_count,
            echo,
            runtime_round_trip,
            publish_result,
            publish_failure
        ])
        .run(tauri::generate_context!())
        .expect("desktop bridge spike must run");
}
