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
    SyncPushRequest, SyncPushResponse, WORKSPACE_SYNC_PROTOCOL_VERSION, WorkspaceCheckpoint,
    WorkspaceImage, WorkspaceOperation, WorkspaceOperationEnvelope, content_digest,
};
use skriuw_sync::{SyncAssetStore, SyncCancellation, SyncClock, SyncTransport, TransportError};

/// In-memory stand-in for the workspace image blob store, keyed by content
/// hash so digest verification mirrors the production store.
#[derive(Default)]
pub struct FakeAssetStore {
    assets: Mutex<std::collections::HashMap<String, Vec<u8>>>,
}

impl FakeAssetStore {
    #[must_use]
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn put(&self, bytes: &[u8]) -> String {
        let hash = content_digest(bytes);
        self.assets
            .lock()
            .expect("asset store")
            .insert(hash.clone(), bytes.to_vec());
        hash
    }

    #[must_use]
    pub fn get(&self, content_hash: &str) -> Option<Vec<u8>> {
        self.assets
            .lock()
            .expect("asset store")
            .get(content_hash)
            .cloned()
    }
}

impl SyncAssetStore for FakeAssetStore {
    fn read_asset(&self, content_hash: &str, _mime_type: &str) -> Result<Option<Vec<u8>>, String> {
        Ok(self.get(content_hash))
    }

    fn store_asset(
        &self,
        content_hash: &str,
        _mime_type: &str,
        bytes: &[u8],
    ) -> Result<(), String> {
        if content_digest(bytes) != content_hash {
            return Err("asset bytes do not match their declared content hash".into());
        }
        self.assets
            .lock()
            .expect("asset store")
            .insert(content_hash.to_string(), bytes.to_vec());
        Ok(())
    }
}

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
    chunks: Mutex<std::collections::HashMap<String, Vec<u8>>>,
    state: Mutex<Vec<ReplicatedWorkspaceOperation>>,
    checkpoints: Mutex<Vec<WorkspaceCheckpoint>>,
    device_cursors: Mutex<std::collections::HashMap<String, u64>>,
}

impl FakeServer {
    #[must_use]
    pub fn new(workspace_id: &str) -> Arc<Self> {
        Arc::new(Self {
            workspace_id: workspace_id.into(),
            chunks: Mutex::new(std::collections::HashMap::new()),
            state: Mutex::new(Vec::new()),
            checkpoints: Mutex::new(Vec::new()),
            device_cursors: Mutex::new(std::collections::HashMap::new()),
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

    pub fn has_chunk(&self, workspace_id: &str, digest: &str) -> Result<bool, TransportError> {
        if workspace_id != self.workspace_id {
            return Err(TransportError::AuthorizationDenied);
        }
        Ok(self
            .chunks
            .lock()
            .expect("chunk store")
            .contains_key(digest))
    }

    pub fn put_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        bytes: &[u8],
    ) -> Result<(), TransportError> {
        if workspace_id != self.workspace_id {
            return Err(TransportError::AuthorizationDenied);
        }
        if skriuw_domain::content_digest(bytes) != digest {
            return Err(TransportError::Validation(
                "chunk bytes do not match the requested digest".into(),
            ));
        }
        self.chunks
            .lock()
            .expect("chunk store")
            .insert(digest.to_string(), bytes.to_vec());
        Ok(())
    }

    pub fn get_chunk(&self, workspace_id: &str, digest: &str) -> Result<Vec<u8>, TransportError> {
        if workspace_id != self.workspace_id {
            return Err(TransportError::AuthorizationDenied);
        }
        self.chunks
            .lock()
            .expect("chunk store")
            .get(digest)
            .cloned()
            .ok_or_else(|| TransportError::Validation(format!("chunk {digest} is not stored")))
    }

    #[must_use]
    pub fn stored_chunks(&self) -> usize {
        self.chunks.lock().expect("chunk store").len()
    }

    /// Simulates content that a bucket no longer holds, so a client must fail
    /// rather than apply an operation it cannot reconstruct.
    pub fn discard_chunks(&self) {
        self.chunks.lock().expect("chunk store").clear();
    }

    /// Simulates stored chunk bytes that no longer hash to their digest, so a
    /// client must fail digest verification rather than accept them.
    pub fn corrupt_chunks(&self) {
        for bytes in self.chunks.lock().expect("chunk store").values_mut() {
            if let Some(first) = bytes.first_mut() {
                *first ^= 0xff;
            }
        }
    }

    pub fn latest_checkpoint(
        &self,
        workspace_id: &str,
    ) -> Result<Option<WorkspaceCheckpoint>, TransportError> {
        if workspace_id != self.workspace_id {
            return Err(TransportError::AuthorizationDenied);
        }
        Ok(self
            .checkpoints
            .lock()
            .expect("checkpoint store")
            .iter()
            .max_by_key(|checkpoint| checkpoint.server_sequence)
            .cloned())
    }

    pub fn publish_checkpoint(
        &self,
        workspace_id: &str,
        checkpoint: &WorkspaceCheckpoint,
    ) -> Result<(), TransportError> {
        if workspace_id != self.workspace_id {
            return Err(TransportError::AuthorizationDenied);
        }
        checkpoint
            .validate()
            .map_err(|error| TransportError::Validation(error.to_string()))?;
        if checkpoint.server_sequence > self.log_len() as u64 {
            return Err(TransportError::Validation(
                "checkpoint sequence is ahead of the workspace".into(),
            ));
        }
        {
            let chunks = self.chunks.lock().expect("chunk store");
            if checkpoint
                .content
                .chunks
                .iter()
                .any(|chunk| !chunks.contains_key(&chunk.digest))
            {
                return Err(TransportError::Validation(
                    "checkpoint content is not stored".into(),
                ));
            }
        }
        let mut checkpoints = self.checkpoints.lock().expect("checkpoint store");
        checkpoints.retain(|stored| stored.server_sequence != checkpoint.server_sequence);
        checkpoints.push(checkpoint.clone());
        Ok(())
    }

    #[must_use]
    pub fn latest_checkpoint_sequence(&self) -> Option<u64> {
        self.checkpoints
            .lock()
            .expect("checkpoint store")
            .iter()
            .map(|checkpoint| checkpoint.server_sequence)
            .max()
    }

    /// Simulates a checkpoint whose content the bucket no longer holds while
    /// the record itself stays discoverable.
    pub fn discard_checkpoint_chunks(&self) {
        let checkpoints = self.checkpoints.lock().expect("checkpoint store");
        let mut chunks = self.chunks.lock().expect("chunk store");
        for checkpoint in checkpoints.iter() {
            for chunk in &checkpoint.content.chunks {
                chunks.remove(&chunk.digest);
            }
        }
    }

    pub fn acknowledge(
        &self,
        workspace_id: &str,
        device_id: &str,
        server_sequence: u64,
    ) -> Result<(), TransportError> {
        if workspace_id != self.workspace_id {
            return Err(TransportError::AuthorizationDenied);
        }
        if server_sequence > self.log_len() as u64 {
            return Err(TransportError::Validation(
                "acknowledged sequence is ahead of the workspace".into(),
            ));
        }
        let mut cursors = self.device_cursors.lock().expect("device cursors");
        let cursor = cursors.entry(device_id.into()).or_insert(0);
        *cursor = (*cursor).max(server_sequence);
        Ok(())
    }

    #[must_use]
    pub fn acknowledged_sequence(&self, device_id: &str) -> Option<u64> {
        self.device_cursors
            .lock()
            .expect("device cursors")
            .get(device_id)
            .copied()
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
        for operation in &request.operations {
            let referenced = operation
                .payload
                .manifest()
                .into_iter()
                .chain(operation.payload.assets());
            for manifest in referenced {
                let chunks = self.chunks.lock().expect("chunk store");
                if manifest
                    .chunks
                    .iter()
                    .any(|chunk| !chunks.contains_key(&chunk.digest))
                {
                    return Err(TransportError::Validation(
                        "chunked content is not stored".into(),
                    ));
                }
            }
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
            let payload = serde_json::to_string(&operation.payload).expect("serialize operation");
            let existing = log
                .iter()
                .find(|entry| entry.operation_id == operation.operation_id);
            if let Some(entry) = existing {
                let entry_payload =
                    serde_json::to_string(&entry.payload).expect("serialize operation");
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
                payload: operation.payload.clone(),
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
    checkpoint_fetch_faults: Mutex<VecDeque<TransportError>>,
    checkpoint_publish_faults: Mutex<VecDeque<TransportError>>,
    push_calls: AtomicUsize,
    pull_calls: AtomicUsize,
    checkpoint_fetch_calls: AtomicUsize,
    checkpoint_publish_calls: AtomicUsize,
    acknowledge_calls: AtomicUsize,
}

impl FakeTransport {
    #[must_use]
    pub fn new(server: &Arc<FakeServer>, device_id: &str) -> Arc<Self> {
        Arc::new(Self {
            server: Arc::clone(server),
            device_id: device_id.into(),
            push_faults: Mutex::new(VecDeque::new()),
            pull_faults: Mutex::new(VecDeque::new()),
            checkpoint_fetch_faults: Mutex::new(VecDeque::new()),
            checkpoint_publish_faults: Mutex::new(VecDeque::new()),
            push_calls: AtomicUsize::new(0),
            pull_calls: AtomicUsize::new(0),
            checkpoint_fetch_calls: AtomicUsize::new(0),
            checkpoint_publish_calls: AtomicUsize::new(0),
            acknowledge_calls: AtomicUsize::new(0),
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

    pub fn script_checkpoint_fetch_fault(&self, fault: TransportError) {
        self.checkpoint_fetch_faults
            .lock()
            .expect("checkpoint fetch faults")
            .push_back(fault);
    }

    pub fn script_checkpoint_publish_fault(&self, fault: TransportError) {
        self.checkpoint_publish_faults
            .lock()
            .expect("checkpoint publish faults")
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
    pub fn checkpoint_fetch_calls(&self) -> usize {
        self.checkpoint_fetch_calls.load(Ordering::SeqCst)
    }

    #[must_use]
    pub fn checkpoint_publish_calls(&self) -> usize {
        self.checkpoint_publish_calls.load(Ordering::SeqCst)
    }

    #[must_use]
    pub fn acknowledge_calls(&self) -> usize {
        self.acknowledge_calls.load(Ordering::SeqCst)
    }

    #[must_use]
    pub fn total_calls(&self) -> usize {
        self.push_calls()
            + self.pull_calls()
            + self.checkpoint_fetch_calls()
            + self.checkpoint_publish_calls()
            + self.acknowledge_calls()
    }
}

impl FakeTransport {
    fn ensure_live(&self, cancellation: &SyncCancellation) -> Result<(), TransportError> {
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        Ok(())
    }
}

impl SyncTransport for FakeTransport {
    fn has_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<bool, TransportError> {
        self.ensure_live(cancellation)?;
        self.server.has_chunk(workspace_id, digest)
    }

    fn put_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        bytes: &[u8],
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.ensure_live(cancellation)?;
        self.server.put_chunk(workspace_id, digest, bytes)
    }

    fn get_chunk(
        &self,
        workspace_id: &str,
        digest: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Vec<u8>, TransportError> {
        self.ensure_live(cancellation)?;
        self.server.get_chunk(workspace_id, digest)
    }

    fn latest_checkpoint(
        &self,
        workspace_id: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Option<WorkspaceCheckpoint>, TransportError> {
        self.checkpoint_fetch_calls.fetch_add(1, Ordering::SeqCst);
        self.ensure_live(cancellation)?;
        let fault = self
            .checkpoint_fetch_faults
            .lock()
            .expect("checkpoint fetch faults")
            .pop_front();
        if let Some(fault) = fault {
            return Err(fault);
        }
        self.server.latest_checkpoint(workspace_id)
    }

    fn publish_checkpoint(
        &self,
        workspace_id: &str,
        checkpoint: &WorkspaceCheckpoint,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.checkpoint_publish_calls.fetch_add(1, Ordering::SeqCst);
        self.ensure_live(cancellation)?;
        let fault = self
            .checkpoint_publish_faults
            .lock()
            .expect("checkpoint publish faults")
            .pop_front();
        if let Some(fault) = fault {
            return Err(fault);
        }
        self.server.publish_checkpoint(workspace_id, checkpoint)
    }

    fn acknowledge(
        &self,
        workspace_id: &str,
        device_id: &str,
        server_sequence: u64,
        cancellation: &SyncCancellation,
    ) -> Result<(), TransportError> {
        self.acknowledge_calls.fetch_add(1, Ordering::SeqCst);
        self.ensure_live(cancellation)?;
        if device_id != self.device_id {
            return Err(TransportError::Validation(
                "device identity mismatch".into(),
            ));
        }
        self.server
            .acknowledge(workspace_id, device_id, server_sequence)
    }

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

#[must_use]
pub fn attach_image(
    image_id: &str,
    note_id: &str,
    bytes: &[u8],
    at: i64,
) -> WorkspaceOperationEnvelope {
    envelope(WorkspaceOperation::AttachImage {
        image: WorkspaceImage {
            id: image_id.into(),
            note_id: note_id.into(),
            content_hash: content_digest(bytes),
            mime_type: "image/png".into(),
            byte_size: bytes.len() as i64,
            width: Some(16),
            height: Some(16),
            created_at: at,
        },
    })
}

#[must_use]
pub fn save_large_document(
    id: &str,
    expected_revision: i64,
    markdown_bytes: usize,
    at: i64,
) -> WorkspaceOperationEnvelope {
    let markdown = "x".repeat(markdown_bytes);
    envelope(WorkspaceOperation::SaveDocument {
        note_id: id.into(),
        document_json: json!({"type": "doc", "content": []}),
        markdown: markdown.clone(),
        word_count: 1,
        expected_revision,
        at,
    })
}
