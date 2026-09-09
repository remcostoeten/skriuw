//! The encryption boundary of the sync cycle.
//!
//! Everything above this module — the durable queue, reconcile, conflict
//! review, search, export — works on plaintext workspace operations.
//! Everything below it, from the push body to the chunk store to the
//! published checkpoint, is opaque bytes the service can order but not read.
//! Sealing happens after an operation leaves the outbox and opening happens
//! before a pulled operation reaches the apply path, so no other part of the
//! product has to know whether a workspace is encrypted.
//!
//! The metadata boundary this draws is documented in
//! `docs/adr/0041-end-to-end-encrypted-sync.md`.

use skriuw_crypto::{
    ContentKey, CryptoError, SEAL_SCHEME_V1, decode_base64, encode_base64, open, seal,
};
use skriuw_domain::{
    CheckpointSeal, ClientSyncOperation, ContentManifest, ContentManifestKind,
    SEALED_CONTENT_MIME_TYPE, SealedContent, SealedTransport, SyncOperationPayload,
    SyncPullResponse, SyncPushRequest, WORKSPACE_SYNC_PROTOCOL_VERSION, WorkspaceCheckpoint,
    WorkspaceOperationEnvelope, content_digest,
};
use skriuw_storage::WorkspaceSeal;

use crate::content::{
    AssetExternalization, SyncAssetStore, download_content, upload_missing_chunks,
};
use crate::transport::{SyncCancellation, SyncTransport, TransportError};

/// The device's workspace content key, in the one shape the cycle needs it.
pub struct WorkspaceSealer {
    key: ContentKey,
    workspace_id: String,
}

impl WorkspaceSealer {
    /// Rebuilds the sealer from the device-local seal record. A record whose
    /// scheme this build does not implement fails here rather than at the
    /// first ciphertext.
    pub fn from_seal(workspace_id: &str, seal: &WorkspaceSeal) -> Result<Self, TransportError> {
        if seal.scheme != SEAL_SCHEME_V1 {
            return Err(TransportError::Validation(format!(
                "this workspace is encrypted with the unsupported scheme {}; update Skriuw to open it",
                seal.scheme
            )));
        }
        let key = ContentKey::from_material(&seal.key_material).map_err(crypto_failure)?;
        if key.key_id() != seal.key_id {
            return Err(TransportError::Validation(
                "the stored workspace encryption key does not match its recorded key id; enter the recovery code again".into(),
            ));
        }
        Ok(Self {
            key,
            workspace_id: workspace_id.to_string(),
        })
    }

    #[must_use]
    pub fn key_id(&self) -> String {
        self.key.key_id()
    }

    /// Seals every queued operation in a push batch, uploading sealed chunks
    /// before the batch reaches the service. Operations whose declared asset
    /// bytes are absent locally are reported instead of failing the batch,
    /// exactly like the plaintext path.
    pub fn seal_push_batch(
        &self,
        transport: &dyn SyncTransport,
        assets: &dyn SyncAssetStore,
        request: &mut SyncPushRequest,
        cancellation: &SyncCancellation,
    ) -> Result<AssetExternalization, TransportError> {
        let mut attached = 0;
        let mut missing = Vec::new();
        for operation in &mut request.operations {
            if cancellation.is_cancelled() {
                return Err(TransportError::Cancelled);
            }
            if operation.payload.is_sealed() {
                continue;
            }
            let Some(envelope) = operation.payload.inline_operation().cloned() else {
                return Err(TransportError::Validation(format!(
                    "operation {} left the outbox in a form that cannot be sealed",
                    operation.operation_id
                )));
            };
            operation
                .payload
                .validate_queued(WORKSPACE_SYNC_PROTOCOL_VERSION)
                .map_err(|error| TransportError::Validation(error.to_string()))?;

            let sealed_assets = match self.seal_declared_asset(
                transport,
                assets,
                &operation.operation_id,
                &envelope,
                cancellation,
            )? {
                SealedAsset::None => Vec::new(),
                SealedAsset::Missing => {
                    missing.push(operation.operation_id.clone());
                    continue;
                }
                SealedAsset::Sealed(content) => {
                    attached += 1;
                    vec![content]
                }
            };

            let bytes = serde_json::to_vec(&envelope).map_err(|error| {
                TransportError::Validation(format!(
                    "operation envelope is not serializable: {error}"
                ))
            })?;
            let sealed = self.seal_bytes(
                &operation_context(&self.workspace_id, &operation.operation_id),
                &bytes,
            )?;
            let content = self.transport_for(
                transport,
                ContentManifestKind::OperationEnvelope,
                sealed,
                operation,
                cancellation,
            )?;
            operation.payload = SyncOperationPayload::sealed(content, sealed_assets);
        }
        Ok(AssetExternalization { attached, missing })
    }

    /// Opens every sealed operation in a pull page, restoring exactly the
    /// plaintext payload the apply path would have received from an
    /// unencrypted workspace. Asset bytes are verified against the digest the
    /// opened operation declares and stored locally before anything applies.
    pub fn open_pull_response(
        &self,
        transport: &dyn SyncTransport,
        assets: &dyn SyncAssetStore,
        response: &mut SyncPullResponse,
        cancellation: &SyncCancellation,
    ) -> Result<usize, TransportError> {
        let mut opened = 0;
        for operation in &mut response.operations {
            if cancellation.is_cancelled() {
                return Err(TransportError::Cancelled);
            }
            let Some((content, sealed_assets)) = operation.payload.sealed_content() else {
                continue;
            };
            let bytes = self.open_content(
                transport,
                content,
                &operation_context(&self.workspace_id, &operation.operation_id),
                cancellation,
            )?;
            let envelope =
                serde_json::from_slice::<WorkspaceOperationEnvelope>(&bytes).map_err(|error| {
                    TransportError::Validation(format!(
                        "sealed operation {} did not open into a readable envelope: {error}",
                        operation.operation_id
                    ))
                })?;
            envelope
                .validate()
                .map_err(|error| TransportError::Validation(error.to_string()))?;

            let manifests = self.open_declared_asset(
                transport,
                assets,
                &operation.operation_id,
                &envelope,
                sealed_assets,
                cancellation,
            )?;
            operation.payload = SyncOperationPayload::Inline {
                operation: envelope,
                assets: manifests,
            };
            opened += 1;
        }
        Ok(opened)
    }

    /// Seals an exported workspace archive for publication as a checkpoint.
    pub fn seal_archive(
        &self,
        server_sequence: u64,
        archive_bytes: &[u8],
    ) -> Result<(CheckpointSeal, Vec<u8>), TransportError> {
        let sealed = self.seal_bytes(
            &checkpoint_context(&self.workspace_id, server_sequence),
            archive_bytes,
        )?;
        Ok((
            CheckpointSeal {
                scheme: SEAL_SCHEME_V1.into(),
                key_id: self.key.key_id(),
                nonce: sealed.nonce,
            },
            sealed.ciphertext,
        ))
    }

    /// Opens a downloaded sealed checkpoint into archive bytes.
    pub fn open_archive(
        &self,
        checkpoint: &WorkspaceCheckpoint,
        ciphertext: &[u8],
    ) -> Result<Vec<u8>, TransportError> {
        let Some(seal) = &checkpoint.seal else {
            return Err(TransportError::Validation(
                "this checkpoint is not sealed and cannot be opened".into(),
            ));
        };
        open(
            &self.key,
            &seal.scheme,
            &seal.key_id,
            &checkpoint_context(&checkpoint.workspace_id, checkpoint.server_sequence),
            &seal.nonce,
            ciphertext,
        )
        .map_err(crypto_failure)
    }

    fn seal_bytes(
        &self,
        context: &str,
        plaintext: &[u8],
    ) -> Result<skriuw_crypto::SealedBytes, TransportError> {
        seal(&self.key, context, plaintext).map_err(crypto_failure)
    }

    fn transport_for(
        &self,
        transport: &dyn SyncTransport,
        kind: ContentManifestKind,
        sealed: skriuw_crypto::SealedBytes,
        operation: &ClientSyncOperation,
        cancellation: &SyncCancellation,
    ) -> Result<SealedContent, TransportError> {
        let inline = SealedContent {
            scheme: SEAL_SCHEME_V1.into(),
            key_id: self.key.key_id(),
            nonce: sealed.nonce.clone(),
            transport: SealedTransport::Inline {
                ciphertext: sealed.ciphertext_base64(),
            },
        };
        let candidate = ClientSyncOperation {
            payload: SyncOperationPayload::sealed(inline.clone(), Vec::new()),
            ..operation.clone()
        };
        if !candidate.exceeds_inline_ceiling() {
            return Ok(inline);
        }
        let manifest =
            self.upload_sealed_content(transport, kind, &sealed.ciphertext, cancellation)?;
        Ok(SealedContent {
            transport: SealedTransport::Chunked { manifest },
            ..inline
        })
    }

    fn upload_sealed_content(
        &self,
        transport: &dyn SyncTransport,
        kind: ContentManifestKind,
        ciphertext: &[u8],
        cancellation: &SyncCancellation,
    ) -> Result<ContentManifest, TransportError> {
        let manifest = ContentManifest::build(kind, SEALED_CONTENT_MIME_TYPE, ciphertext)
            .map_err(|error| TransportError::Validation(error.to_string()))?;
        upload_missing_chunks(
            transport,
            &self.workspace_id,
            &manifest,
            ciphertext,
            cancellation,
        )?;
        Ok(manifest)
    }

    fn seal_declared_asset(
        &self,
        transport: &dyn SyncTransport,
        assets: &dyn SyncAssetStore,
        operation_id: &str,
        envelope: &WorkspaceOperationEnvelope,
        cancellation: &SyncCancellation,
    ) -> Result<SealedAsset, TransportError> {
        let Some(required) = envelope.operation.required_asset_content() else {
            return Ok(SealedAsset::None);
        };
        let Some(bytes) = assets
            .read_asset(required.content_hash, required.mime_type)
            .map_err(TransportError::Transient)?
        else {
            return Ok(SealedAsset::Missing);
        };
        if content_digest(&bytes) != required.content_hash
            || bytes.len() as u64 != required.byte_length
        {
            return Err(TransportError::Validation(format!(
                "local asset content for operation {operation_id} does not match its declared digest"
            )));
        }
        let sealed = self.seal_bytes(
            &asset_context(&self.workspace_id, operation_id, required.content_hash),
            &bytes,
        )?;
        let manifest = self.upload_sealed_content(
            transport,
            ContentManifestKind::Asset,
            &sealed.ciphertext,
            cancellation,
        )?;
        Ok(SealedAsset::Sealed(SealedContent {
            scheme: SEAL_SCHEME_V1.into(),
            key_id: self.key.key_id(),
            nonce: sealed.nonce,
            transport: SealedTransport::Chunked { manifest },
        }))
    }

    fn open_declared_asset(
        &self,
        transport: &dyn SyncTransport,
        assets: &dyn SyncAssetStore,
        operation_id: &str,
        envelope: &WorkspaceOperationEnvelope,
        sealed_assets: &[SealedContent],
        cancellation: &SyncCancellation,
    ) -> Result<Vec<ContentManifest>, TransportError> {
        let Some(required) = envelope.operation.required_asset_content() else {
            if sealed_assets.is_empty() {
                return Ok(Vec::new());
            }
            return Err(TransportError::Validation(format!(
                "sealed operation {operation_id} carries asset content it does not declare"
            )));
        };
        let [sealed] = sealed_assets else {
            return Err(TransportError::Validation(format!(
                "sealed operation {operation_id} arrived without its declared asset content"
            )));
        };
        let ciphertext = self.fetch_ciphertext(transport, sealed, cancellation)?;
        let bytes = open(
            &self.key,
            &sealed.scheme,
            &sealed.key_id,
            &asset_context(&self.workspace_id, operation_id, required.content_hash),
            &sealed.nonce,
            &ciphertext,
        )
        .map_err(crypto_failure)?;
        if content_digest(&bytes) != required.content_hash
            || bytes.len() as u64 != required.byte_length
        {
            return Err(TransportError::Validation(format!(
                "opened asset content for operation {operation_id} does not match its declared digest"
            )));
        }
        assets
            .store_asset(required.content_hash, required.mime_type, &bytes)
            .map_err(TransportError::Validation)?;
        let manifest =
            ContentManifest::build(ContentManifestKind::Asset, required.mime_type, &bytes)
                .map_err(|error| TransportError::Validation(error.to_string()))?;
        Ok(vec![manifest])
    }

    fn open_content(
        &self,
        transport: &dyn SyncTransport,
        content: &SealedContent,
        context: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Vec<u8>, TransportError> {
        let ciphertext = self.fetch_ciphertext(transport, content, cancellation)?;
        open(
            &self.key,
            &content.scheme,
            &content.key_id,
            context,
            &content.nonce,
            &ciphertext,
        )
        .map_err(crypto_failure)
    }

    fn fetch_ciphertext(
        &self,
        transport: &dyn SyncTransport,
        content: &SealedContent,
        cancellation: &SyncCancellation,
    ) -> Result<Vec<u8>, TransportError> {
        match &content.transport {
            SealedTransport::Inline { ciphertext } => {
                decode_base64(ciphertext).map_err(crypto_failure)
            }
            SealedTransport::Chunked { manifest } => {
                download_content(transport, &self.workspace_id, manifest, cancellation)
            }
        }
    }
}

enum SealedAsset {
    None,
    Missing,
    Sealed(SealedContent),
}

/// Sealed content is bound to the slot it belongs in, so a ciphertext cannot
/// be replayed into another operation, another asset, or another workspace.
fn operation_context(workspace_id: &str, operation_id: &str) -> String {
    format!("skriuw/sync/operation/{workspace_id}/{operation_id}")
}

fn asset_context(workspace_id: &str, operation_id: &str, content_hash: &str) -> String {
    format!("skriuw/sync/asset/{workspace_id}/{operation_id}/{content_hash}")
}

fn checkpoint_context(workspace_id: &str, server_sequence: u64) -> String {
    format!("skriuw/sync/checkpoint/{workspace_id}/{server_sequence}")
}

/// Encryption failures are never retried into silence: a wrong key, a
/// tampered ciphertext, and an unknown scheme all surface as visible,
/// actionable validation failures that park the work.
fn crypto_failure(error: CryptoError) -> TransportError {
    TransportError::Validation(error.to_string())
}

/// The base64 helper the wire format uses, re-exported so callers that build
/// sealed payloads in tests do not depend on the crypto crate directly.
#[must_use]
pub fn sealed_ciphertext_base64(bytes: &[u8]) -> String {
    encode_base64(bytes)
}
