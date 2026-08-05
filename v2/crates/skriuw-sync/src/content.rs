use skriuw_domain::{
    CANONICAL_CHUNK_BYTES, ClientSyncOperation, ContentManifest, ContentManifestKind,
    SyncOperationPayload, SyncPullResponse, SyncPushRequest, WorkspaceOperationEnvelope,
    content_digest,
};

use crate::transport::{SyncCancellation, SyncTransport, TransportError};

const OPERATION_ENVELOPE_MIME_TYPE: &str = "application/json";

/// Local content-addressed storage for the asset bytes that travel next to a
/// workspace operation. Implementations own durability and any format
/// validation of their own; the sync layer verifies digests on both sides of
/// the transport, so a store never receives bytes that do not hash to
/// `content_hash`.
pub trait SyncAssetStore: Send + Sync {
    /// Returns the stored bytes for a content hash, or `None` when the asset
    /// is not available locally.
    fn read_asset(&self, content_hash: &str, mime_type: &str) -> Result<Option<Vec<u8>>, String>;

    /// Durably stores verified asset bytes. Storing identical bytes twice
    /// must be a no-op.
    fn store_asset(&self, content_hash: &str, mime_type: &str, bytes: &[u8]) -> Result<(), String>;
}

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

/// Attach the asset manifest every queued operation declares, uploading the
/// asset chunks first so the server never receives an operation whose asset
/// content is missing. The outbox stores operations without their asset
/// bytes; this runs at push time against the local asset store.
pub fn externalize_asset_content(
    transport: &dyn SyncTransport,
    assets: &dyn SyncAssetStore,
    workspace_id: &str,
    request: &mut SyncPushRequest,
    cancellation: &SyncCancellation,
) -> Result<usize, TransportError> {
    let mut attached = 0;
    for operation in &mut request.operations {
        let SyncOperationPayload::Inline {
            operation: envelope,
            assets: payload_assets,
        } = &mut operation.payload
        else {
            continue;
        };
        let Some(required) = envelope.operation.required_asset_content() else {
            continue;
        };
        if !payload_assets.is_empty() {
            continue;
        }
        if cancellation.is_cancelled() {
            return Err(TransportError::Cancelled);
        }
        let bytes = assets
            .read_asset(required.content_hash, required.mime_type)
            .map_err(TransportError::Transient)?
            .ok_or_else(|| {
                TransportError::Validation(format!(
                    "asset content for operation {} is not available locally",
                    operation.operation_id
                ))
            })?;
        let manifest =
            ContentManifest::build(ContentManifestKind::Asset, required.mime_type, &bytes)
                .map_err(|error| TransportError::Validation(error.to_string()))?;
        if manifest.content_digest != required.content_hash
            || manifest.total_byte_length != required.byte_length
        {
            return Err(TransportError::Validation(format!(
                "local asset content for operation {} does not match its declared digest",
                operation.operation_id
            )));
        }
        upload_missing_chunks(transport, workspace_id, &manifest, &bytes, cancellation)?;
        payload_assets.push(manifest);
        attached += 1;
    }
    Ok(attached)
}

/// Download, verify, and locally store the asset content behind every pulled
/// operation so the apply path never records an asset reference whose bytes
/// are absent. Any missing or corrupt asset fails the pull before anything is
/// applied.
pub fn resolve_asset_content(
    transport: &dyn SyncTransport,
    assets: &dyn SyncAssetStore,
    workspace_id: &str,
    response: &SyncPullResponse,
    cancellation: &SyncCancellation,
) -> Result<usize, TransportError> {
    let mut resolved = 0;
    for operation in &response.operations {
        let Some(envelope) = operation.payload.inline_operation() else {
            continue;
        };
        let Some(required) = envelope.operation.required_asset_content() else {
            if operation.payload.assets().is_empty() {
                continue;
            }
            return Err(TransportError::Validation(format!(
                "operation {} carries asset content it does not declare",
                operation.operation_id
            )));
        };
        let [manifest] = operation.payload.assets() else {
            return Err(TransportError::Validation(format!(
                "operation {} arrived without its declared asset manifest",
                operation.operation_id
            )));
        };
        if manifest.kind != ContentManifestKind::Asset
            || manifest.content_digest != required.content_hash
            || manifest.mime_type != required.mime_type
            || manifest.total_byte_length != required.byte_length
        {
            return Err(TransportError::Validation(format!(
                "asset manifest for operation {} does not match its declared content",
                operation.operation_id
            )));
        }
        let already_stored = assets
            .read_asset(required.content_hash, required.mime_type)
            .map_err(TransportError::Transient)?
            .is_some_and(|bytes| content_digest(&bytes) == required.content_hash);
        if already_stored {
            continue;
        }
        let bytes = download_content(transport, workspace_id, manifest, cancellation)?;
        assets
            .store_asset(required.content_hash, required.mime_type, &bytes)
            .map_err(TransportError::Validation)?;
        resolved += 1;
    }
    Ok(resolved)
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
        operation.payload = SyncOperationPayload::inline(envelope);
        resolved += 1;
    }
    Ok(resolved)
}

fn needs_externalizing(operation: &ClientSyncOperation) -> bool {
    operation.payload.inline_operation().is_some() && operation.exceeds_inline_ceiling()
}

pub(crate) fn upload_missing_chunks(
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

pub(crate) fn download_content(
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
