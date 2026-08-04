use std::{
    collections::VecDeque,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, AtomicUsize, Ordering},
    },
};

use serde_json::json;
use skriuw_domain::{
    NodePlacement, ReplicatedWorkspaceOperation, SyncAcceptedOperation, SyncPullResponse,
    SyncPushRequest, SyncPushResponse, WORKSPACE_SYNC_PROTOCOL_VERSION, WorkspaceOperation,
    WorkspaceOperationEnvelope,
};
use skriuw_sync::{SyncCancellation, SyncClock, SyncTransport, TransportError};

pub struct FakeClock {
    now_ms: AtomicI64,
}

impl FakeClock {
    #[must_use]
    pub fn at(now_ms: i64) -> Arc<Self> {
        Arc::new(Self {
            now_ms: AtomicI64::new(now_ms),
        })
    }

    pub fn advance(&self, delta_ms: i64) {
        self.now_ms.fetch_add(delta_ms, Ordering::SeqCst);
    }
}

impl SyncClock for FakeClock {
    fn now_ms(&self) -> i64 {
        self.now_ms.load(Ordering::SeqCst)
    }
}

/// In-memory stand-in for the workspace Durable Object: one ordered log,
/// idempotent push keyed by operation identity, conflict on identity reuse
/// with different content, and cursor-ordered pull.
pub struct FakeServer {
    workspace_id: String,
    state: Mutex<Vec<ReplicatedWorkspaceOperation>>,
}

impl FakeServer {
    #[must_use]
    pub fn new(workspace_id: &str) -> Arc<Self> {
        Arc::new(Self {
            workspace_id: workspace_id.into(),
            state: Mutex::new(Vec::new()),
        })
    }

    #[must_use]
    pub fn log_len(&self) -> usize {
        self.state.lock().expect("server state").len()
    }

    #[must_use]
    pub fn operation_ids(&self) -> Vec<String> {
        self.state
            .lock()
            .expect("server state")
            .iter()
            .map(|operation| operation.operation_id.clone())
            .collect()
    }

    pub fn push(
        &self,
        device_id: &str,
        workspace_id: &str,
        request: &SyncPushRequest,
    ) -> Result<SyncPushResponse, TransportError> {
        if workspace_id != self.workspace_id {
            return Err(TransportError::AuthorizationDenied);
        }
        if request.device_id != device_id {
            return Err(TransportError::Validation(
                "device identity mismatch".into(),
            ));
        }
        request
            .validate()
            .map_err(|error| TransportError::Validation(error.to_string()))?;
        let mut log = self.state.lock().expect("server state");
        let mut accepted = Vec::with_capacity(request.operations.len());
        for operation in &request.operations {
            let payload = serde_json::to_string(&operation.operation).expect("serialize operation");
            let existing = log
                .iter()
                .find(|entry| entry.operation_id == operation.operation_id);
            if let Some(entry) = existing {
                let entry_payload =
                    serde_json::to_string(&entry.operation).expect("serialize operation");
                if entry.device_id != request.device_id
                    || entry.client_sequence != operation.client_sequence
                    || entry_payload != payload
                {
                    return Err(TransportError::Conflict(format!(
                        "operation {} was reused with different content",
                        operation.operation_id
                    )));
                }
                accepted.push(SyncAcceptedOperation {
                    operation_id: entry.operation_id.clone(),
                    client_sequence: entry.client_sequence,
                    server_sequence: entry.server_sequence,
                });
                continue;
            }
            if log.iter().any(|entry| {
                entry.device_id == request.device_id
                    && entry.client_sequence == operation.client_sequence
            }) {
                return Err(TransportError::Conflict(format!(
                    "client sequence {} was reused with a different operation",
                    operation.client_sequence
                )));
            }
            let server_sequence = log.len() as u64 + 1;
            log.push(ReplicatedWorkspaceOperation {
                operation_id: operation.operation_id.clone(),
                device_id: request.device_id.clone(),
                client_sequence: operation.client_sequence,
                base_server_sequence: operation.base_server_sequence,
                server_sequence,
                operation: operation.operation.clone(),
            });
            accepted.push(SyncAcceptedOperation {
                operation_id: operation.operation_id.clone(),
                client_sequence: operation.client_sequence,
                server_sequence,
            });
        }
        Ok(SyncPushResponse {
            sync_protocol_version: WORKSPACE_SYNC_PROTOCOL_VERSION,
            accepted,
            latest_server_sequence: log.len() as u64,
        })
    }

    pub fn pull(
        &self,
        workspace_id: &str,
        after_server_sequence: u64,
        limit: usize,
    ) -> Result<SyncPullResponse, TransportError> {
        if workspace_id != self.workspace_id {
            return Err(TransportError::AuthorizationDenied);
        }
        let log = self.state.lock().expect("server state");
        let operations = log
            .iter()
            .filter(|entry| entry.server_sequence > after_server_sequence)
            .take(limit)
            .cloned()
            .collect();
        Ok(SyncPullResponse {
            sync_protocol_version: WORKSPACE_SYNC_PROTOCOL_VERSION,
            operations,
            latest_server_sequence: log.len() as u64,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PushFault {
    /// The server accepts the batch but the response is lost.
    DropResponse,
    Transient,
    AuthExpired,
    RateLimited(i64),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PullFault {
    Transient,
    AuthExpired,
    /// Deliver the page with its first operation missing.
    Gap,
    /// Deliver the page starting one operation before the requested cursor.
    Overlap,
    WrongProtocol,
}

/// Deterministic per-device transport over one [`FakeServer`] with scripted
/// fault injection and call accounting for no-network-path assertions.
pub struct FakeTransport {
    server: Arc<FakeServer>,
    device_id: String,
    push_faults: Mutex<VecDeque<PushFault>>,
    pull_faults: Mutex<VecDeque<PullFault>>,
    push_calls: AtomicUsize,
    pull_calls: AtomicUsize,
}

impl FakeTransport {
    #[must_use]
    pub fn new(server: &Arc<FakeServer>, device_id: &str) -> Arc<Self> {
        Arc::new(Self {
            server: Arc::clone(server),
            device_id: device_id.into(),
            push_faults: Mutex::new(VecDeque::new()),
            pull_faults: Mutex::new(VecDeque::new()),
            push_calls: AtomicUsize::new(0),
            pull_calls: AtomicUsize::new(0),
        })
    }

    pub fn script_push_fault(&self, fault: PushFault) {
        self.push_faults
            .lock()
            .expect("push faults")
            .push_back(fault);
    }

    pub fn script_pull_fault(&self, fault: PullFault) {
        self.pull_faults
            .lock()
            .expect("pull faults")
            .push_back(fault);
    }

    #[must_use]
    pub fn push_calls(&self) -> usize {
        self.push_calls.load(Ordering::SeqCst)
    }

    #[must_use]
    pub fn pull_calls(&self) -> usize {
        self.pull_calls.load(Ordering::SeqCst)
    }

    #[must_use]
    pub fn total_calls(&self) -> usize {
        self.push_calls() + self.pull_calls()
    }
}

impl SyncTransport for FakeTransport {
    fn push(
        &self,
        workspace_id: &str,
        request: &SyncPushRequest,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPushResponse, TransportError> {
        self.push_calls.fetch_add(1, Ordering::SeqCst);
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        let fault = self.push_faults.lock().expect("push faults").pop_front();
        match fault {
            Some(PushFault::DropResponse) => {
                self.server.push(&self.device_id, workspace_id, request)?;
                Err(TransportError::Transient("response was lost".into()))
            }
            Some(PushFault::Transient) => {
                Err(TransportError::Transient("network unreachable".into()))
            }
            Some(PushFault::AuthExpired) => Err(TransportError::AuthenticationRequired),
            Some(PushFault::RateLimited(retry_after_ms)) => Err(TransportError::RateLimited {
                retry_after_ms: Some(retry_after_ms),
            }),
            None => self.server.push(&self.device_id, workspace_id, request),
        }
    }

    fn pull(
        &self,
        workspace_id: &str,
        after_server_sequence: u64,
        limit: usize,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPullResponse, TransportError> {
        self.pull_calls.fetch_add(1, Ordering::SeqCst);
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        let fault = self.pull_faults.lock().expect("pull faults").pop_front();
        match fault {
            Some(PullFault::Transient) => {
                Err(TransportError::Transient("network unreachable".into()))
            }
            Some(PullFault::AuthExpired) => Err(TransportError::AuthenticationRequired),
            Some(PullFault::Gap) => {
                let mut response = self
                    .server
                    .pull(workspace_id, after_server_sequence, limit)?;
                if !response.operations.is_empty() {
                    response.operations.remove(0);
                }
                Ok(response)
            }
            Some(PullFault::Overlap) => {
                self.server
                    .pull(workspace_id, after_server_sequence.saturating_sub(1), limit)
            }
            Some(PullFault::WrongProtocol) => {
                let mut response = self
                    .server
                    .pull(workspace_id, after_server_sequence, limit)?;
                response.sync_protocol_version = 99;
                Ok(response)
            }
            None => self.server.pull(workspace_id, after_server_sequence, limit),
        }
    }
}

#[must_use]
pub fn envelope(operation: WorkspaceOperation) -> WorkspaceOperationEnvelope {
    WorkspaceOperationEnvelope::v1(operation)
}

#[must_use]
pub fn create_note(id: &str, title: &str, at: i64) -> WorkspaceOperationEnvelope {
    envelope(WorkspaceOperation::CreateNote {
        id: id.into(),
        title: title.into(),
        placement: NodePlacement::last(None),
        document_json: json!({"type": "doc", "content": []}),
        markdown: title.into(),
        at,
    })
}

#[must_use]
pub fn rename_node(id: &str, title: &str, at: i64) -> WorkspaceOperationEnvelope {
    envelope(WorkspaceOperation::RenameNode {
        id: id.into(),
        title: title.into(),
        at,
    })
}
