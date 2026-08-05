use skriuw_domain::{
    CANONICAL_CHUNK_BYTES, ClientSyncOperation, ContentManifest, ContentManifestKind,
    SyncOperationPayload, SyncPullResponse, SyncPushRequest, WorkspaceOperationEnvelope,
};

use crate::transport::{SyncCancellation, SyncTransport, TransportError};

const OPERATION_ENVELOPE_MIME_TYPE: &str = "application/json";

/// Replace every queued operation that cannot travel inline with a
/// content-addressed manifest, uploading the chunks first so the server never
/// sees a manifest whose content is missing.
pub fn externalize_oversized_operations(
    transport: &dyn SyncTransport,
    workspace_id: &str,
    request: &mut SyncPushRequest,
    cancellation: &SyncCancellation,
) -> Result<usize, TransportError> {
    let mut externalized = 0;
    for operation in &mut request.operations {
        if !needs_externalizing(operation) {
            continue;
        }
        let Some(envelope) = operation.payload.inline_operation() else {
            continue;
        };
        let bytes = serde_json::to_vec(envelope).map_err(|error| {
            TransportError::Validation(format!("operation envelope is not serializable: {error}"))
        })?;
        let manifest = ContentManifest::build(
            ContentManifestKind::OperationEnvelope,
            OPERATION_ENVELOPE_MIME_TYPE,
            &bytes,
        )
        .map_err(|error| TransportError::Validation(error.to_string()))?;

        upload_missing_chunks(transport, workspace_id, &manifest, &bytes, cancellation)?;
        operation.payload = SyncOperationPayload::Chunked { manifest };
        externalized += 1;
    }
    Ok(externalized)
}

/// Download and verify the content behind every chunked operation so the
/// local apply path only ever receives complete, verified envelopes.
pub fn resolve_chunked_operations(
    transport: &dyn SyncTransport,
    workspace_id: &str,
    response: &mut SyncPullResponse,
    cancellation: &SyncCancellation,
) -> Result<usize, TransportError> {
    let mut resolved = 0;
    for operation in &mut response.operations {
        let Some(manifest) = operation.payload.manifest().cloned() else {
            continue;
        };
        let bytes = download_content(transport, workspace_id, &manifest, cancellation)?;
        let envelope =
            serde_json::from_slice::<WorkspaceOperationEnvelope>(&bytes).map_err(|error| {
                TransportError::Validation(format!(
                    "chunked operation {} is not a readable envelope: {error}",
                    operation.operation_id
                ))
            })?;
        envelope
            .validate()
            .map_err(|error| TransportError::Validation(error.to_string()))?;
        operation.payload = SyncOperationPayload::Inline {
            operation: envelope,
        };
        resolved += 1;
    }
    Ok(resolved)
}

fn needs_externalizing(operation: &ClientSyncOperation) -> bool {
    operation.payload.inline_operation().is_some() && operation.exceeds_inline_ceiling()
}

fn upload_missing_chunks(
    transport: &dyn SyncTransport,
    workspace_id: &str,
    manifest: &ContentManifest,
    bytes: &[u8],
    cancellation: &SyncCancellation,
) -> Result<(), TransportError> {
    for (index, chunk) in manifest.chunks.iter().enumerate() {
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        if transport.has_chunk(workspace_id, &chunk.digest, cancellation)? {
            continue;
        }
        let offset = index * CANONICAL_CHUNK_BYTES;
        let end = offset + chunk.byte_length as usize;
        let slice = bytes
            .get(offset..end)
            .ok_or_else(|| TransportError::Validation("chunk range is outside content".into()))?;
        transport.put_chunk(workspace_id, &chunk.digest, slice, cancellation)?;
    }
    Ok(())
}

fn download_content(
    transport: &dyn SyncTransport,
    workspace_id: &str,
    manifest: &ContentManifest,
    cancellation: &SyncCancellation,
) -> Result<Vec<u8>, TransportError> {
    manifest
        .validate()
        .map_err(|error| TransportError::Validation(error.to_string()))?;
    let mut bytes = Vec::with_capacity(manifest.total_byte_length as usize);
    for (index, chunk) in manifest.chunks.iter().enumerate() {
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        let received = transport.get_chunk(workspace_id, &chunk.digest, cancellation)?;
        manifest
            .verify_chunk(index, &received)
            .map_err(|error| TransportError::Validation(error.to_string()))?;
        bytes.extend_from_slice(&received);
    }
    manifest
        .verify_assembled(&bytes)
        .map_err(|error| TransportError::Validation(error.to_string()))?;
    Ok(bytes)
}
