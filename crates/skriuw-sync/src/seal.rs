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
//! `docs/adr/0043-end-to-end-encrypted-sync.md`.

use skriuw_crypto::{
    ContentKey, CryptoError, RecoveryCode, SEAL_SCHEME_V2, decode_base64, derive_content_key,
    encode_base64, open, seal,
};
use skriuw_domain::{
    CheckpointSeal, ClientSyncOperation, ContentManifest, ContentManifestKind,
    SEALED_CONTENT_MIME_TYPE, SealedContent, SealedTransport, SyncOperationPayload,
    SyncPullResponse, SyncPushRequest, WORKSPACE_SYNC_PROTOCOL_VERSION, WorkspaceCheckpoint,
    WorkspaceOperationEnvelope, content_digest,
};
use skriuw_storage::{WorkspaceSeal, WorkspaceSyncQueue};

use crate::content::{
    AssetExternalization, SyncAssetStore, download_content, upload_missing_chunks,
};
use crate::transport::{SyncCancellation, SyncTransport, TransportError};

/// Formats fresh cryptographic entropy as the recovery code shown once at
/// enable time. The caller owns the randomness: the desktop runtime uses the
/// platform generator and the browser worker uses `crypto.getRandomValues`,
/// so no random-number dependency enters the shared crates.
pub fn new_recovery_code(entropy: &[u8]) -> Result<String, String> {
    RecoveryCode::from_entropy(entropy)
        .map(|code| code.formatted())
        .map_err(|error| error.to_string())
}

/// Derives the device-local seal record for a workspace from a recovery code.
/// The same code and workspace always derive the same key, which is what lets
/// a second device join by typing the code and nothing else.
pub fn derive_workspace_seal(
    workspace_id: &str,
    recovery_code: &str,
    encrypted_from_server_sequence: u64,
    now_ms: i64,
) -> Result<WorkspaceSeal, String> {
    let code = RecoveryCode::parse(recovery_code).map_err(|error| error.to_string())?;
    let key = derive_content_key(&code, workspace_id).map_err(|error| error.to_string())?;
    Ok(WorkspaceSeal {
        workspace_id: workspace_id.to_string(),
        key_id: key.key_id(),
        scheme: SEAL_SCHEME_V2.into(),
        key_material: key.material().to_vec().into(),
        enabled_at: now_ms.max(0),
        sealed_checkpoint_at: None,
        encrypted_from_server_sequence,
    })
}

/// Turns encryption on and returns the recovery code exactly once.
///
/// The key is stored before the service is asked to record it, so a crash
/// after the claim never leaves the cloud encrypted under a key no device
/// holds. The service's write-once record then arbitrates: if another device
/// claimed the workspace first, the local key is removed again and the user is
/// told to enter that device's recovery code instead.
pub fn enable_workspace_encryption(
    queue: &dyn WorkspaceSyncQueue,
    transport: &dyn SyncTransport,
    cancellation: &SyncCancellation,
    entropy: &[u8],
    now_ms: i64,
) -> Result<String, String> {
    let connection = queue
        .sync_connection()
        .map_err(|error| format!("could not read the local sync connection: {error}"))?
        .ok_or_else(|| "connect this workspace to Skriuw cloud before encrypting it".to_string())?;
    if queue
        .workspace_seal()
        .map_err(|error| format!("could not read the workspace encryption state: {error}"))?
        .is_some_and(|seal| seal.workspace_id == connection.workspace_id)
    {
        return Err("this workspace is already encrypted on this device".into());
    }
    let recovery_code = new_recovery_code(entropy)?;
    let seal = derive_workspace_seal(
        &connection.workspace_id,
        &recovery_code,
        connection.observed_server_sequence,
        now_ms,
    )?;
    queue
        .set_workspace_seal(&seal)
        .map_err(|error| format!("could not store the workspace encryption key: {error}"))?;
    let claimed = transport.claim_workspace_encryption(
        &connection.workspace_id,
        &seal.scheme,
        &seal.key_id,
        cancellation,
    );
    let refusal = match claimed {
        Ok(marker) if marker.key_id == seal.key_id => {
            return queue
                .set_workspace_seal(&WorkspaceSeal {
                    encrypted_from_server_sequence: marker.encrypted_from_server_sequence,
                    ..seal
                })
                .map(|()| recovery_code)
                .map_err(|error| format!("could not store the workspace encryption key: {error}"));
        }
        Ok(_) => "another device already encrypted this workspace; enter its recovery code instead"
            .to_string(),
        Err(error) => format!("could not reach Skriuw cloud to encrypt this workspace: {error}"),
    };
    queue.clear_workspace_seal().map_err(|error| {
        format!("{refusal}; the unused key could not be removed from this device: {error}")
    })?;
    Err(refusal)
}

/// Joins an already-encrypted workspace from the recovery code alone. The
/// derived key must match the key the service recorded for the workspace;
/// a wrong code stores nothing, so it can never seal work under a key the
/// other devices cannot open.
pub fn unlock_workspace_encryption(
    queue: &dyn WorkspaceSyncQueue,
    transport: &dyn SyncTransport,
    cancellation: &SyncCancellation,
    recovery_code: &str,
    now_ms: i64,
) -> Result<(), String> {
    let connection = queue
        .sync_connection()
        .map_err(|error| format!("could not read the local sync connection: {error}"))?
        .ok_or_else(|| {
            "connect this workspace to Skriuw cloud before entering its recovery code".to_string()
        })?;
    let marker = transport
        .workspace_encryption(&connection.workspace_id, cancellation)
        .map_err(|error| {
            format!("could not reach Skriuw cloud to check the recovery code: {error}")
        })?
        .ok_or_else(|| {
            "this workspace is not encrypted in Skriuw cloud, so there is no recovery code to enter"
                .to_string()
        })?;
    let seal = derive_workspace_seal(
        &connection.workspace_id,
        recovery_code,
        marker.encrypted_from_server_sequence,
        now_ms,
    )?;
    if seal.key_id != marker.key_id {
        return Err(
            "that recovery code does not open this workspace; check the code and try again".into(),
        );
    }
    let existing = queue
        .workspace_seal()
        .map_err(|error| format!("could not read the workspace encryption state: {error}"))?
        .filter(|existing| {
            existing.workspace_id == seal.workspace_id && existing.key_id == seal.key_id
        });
    let seal = match existing {
        Some(existing) => WorkspaceSeal {
            enabled_at: existing.enabled_at,
            sealed_checkpoint_at: existing.sealed_checkpoint_at,
            ..seal
        },
        None => seal,
    };
    queue
        .set_workspace_seal(&seal)
        .map_err(|error| format!("could not store the workspace encryption key: {error}"))
}

/// Why a pulled page could not be opened. The cycle maps each to a different
/// visible reason, because a downgrade is not a key problem and a key problem
/// is not a transport problem.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum OpenFailure {
    /// Sealed content this device's key cannot open.
    Unreadable(String),
    /// Plaintext where the workspace's encryption floor requires sealed
    /// content.
    Downgrade(String),
    /// Content that opened but does not describe a valid operation or asset.
    Rejected(String),
    /// The opened content could not be written to local storage.
    Storage(String),
    Transport(TransportError),
}

/// The device's workspace content key, in the one shape the cycle needs it.
pub struct WorkspaceSealer {
    key: ContentKey,
    workspace_id: String,
    encrypted_from_server_sequence: u64,
}

impl WorkspaceSealer {
    /// Rebuilds the sealer from the device-local seal record. A record whose
    /// scheme this build does not implement fails here rather than at the
    /// first ciphertext.
    pub fn from_seal(workspace_id: &str, seal: &WorkspaceSeal) -> Result<Self, TransportError> {
        if seal.scheme != SEAL_SCHEME_V2 {
            return Err(TransportError::Validation(format!(
                "this workspace is encrypted with the unsupported scheme {}; update Skriuw to open it",
                seal.scheme
            )));
        }
        if seal.workspace_id != workspace_id {
            return Err(TransportError::Validation(
                "the stored workspace encryption key belongs to another workspace; enter this workspace's recovery code".into(),
            ));
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
            encrypted_from_server_sequence: seal.encrypted_from_server_sequence,
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
        let device_id = request.device_id.clone();
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
            let slot = OperationSlot {
                operation_id: &operation.operation_id,
                device_id: &device_id,
                client_sequence: operation.client_sequence,
                base_server_sequence: operation.base_server_sequence,
            };
            let sealed = self.seal_bytes(&operation_context(&self.workspace_id, &slot), &bytes)?;
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
    ///
    /// Plaintext at or below the encryption floor is what the workspace
    /// replicated before encryption began and passes through unchanged;
    /// plaintext above it is a forgery or a downgrade and fails the page.
    pub(crate) fn open_pull_response(
        &self,
        transport: &dyn SyncTransport,
        assets: &dyn SyncAssetStore,
        response: &mut SyncPullResponse,
        cancellation: &SyncCancellation,
    ) -> Result<usize, OpenFailure> {
        let mut opened = 0;
        for operation in &mut response.operations {
            if cancellation.is_cancelled() {
                return Err(OpenFailure::Transport(TransportError::Cancelled));
            }
            let Some((content, sealed_assets)) = operation.payload.sealed_content() else {
                if operation.server_sequence > self.encrypted_from_server_sequence {
                    return Err(OpenFailure::Downgrade(format!(
                        "the cloud returned unencrypted operation {} at sequence {}, after this workspace was encrypted from sequence {}; it was refused",
                        operation.operation_id,
                        operation.server_sequence,
                        self.encrypted_from_server_sequence
                    )));
                }
                continue;
            };
            let slot = OperationSlot {
                operation_id: &operation.operation_id,
                device_id: &operation.device_id,
                client_sequence: operation.client_sequence,
                base_server_sequence: operation.base_server_sequence,
            };
            let bytes = self.open_content(
                transport,
                content,
                &operation_context(&self.workspace_id, &slot),
                cancellation,
            )?;
            let envelope =
                serde_json::from_slice::<WorkspaceOperationEnvelope>(&bytes).map_err(|error| {
                    OpenFailure::Rejected(format!(
                        "sealed operation {} did not open into a readable envelope: {error}",
                        operation.operation_id
                    ))
                })?;
            envelope
                .validate()
                .map_err(|error| OpenFailure::Rejected(error.to_string()))?;

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
                scheme: SEAL_SCHEME_V2.into(),
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
            &checkpoint_context(&self.workspace_id, checkpoint.server_sequence),
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
            scheme: SEAL_SCHEME_V2.into(),
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
            scheme: SEAL_SCHEME_V2.into(),
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
    ) -> Result<Vec<ContentManifest>, OpenFailure> {
        let Some(required) = envelope.operation.required_asset_content() else {
            if sealed_assets.is_empty() {
                return Ok(Vec::new());
            }
            return Err(OpenFailure::Rejected(format!(
                "sealed operation {operation_id} carries asset content it does not declare"
            )));
        };
        let [sealed] = sealed_assets else {
            return Err(OpenFailure::Rejected(format!(
                "sealed operation {operation_id} arrived without its declared asset content"
            )));
        };
        let bytes = self.open_content(
            transport,
            sealed,
            &asset_context(&self.workspace_id, operation_id, required.content_hash),
            cancellation,
        )?;
        if content_digest(&bytes) != required.content_hash
            || bytes.len() as u64 != required.byte_length
        {
            return Err(OpenFailure::Rejected(format!(
                "opened asset content for operation {operation_id} does not match its declared digest"
            )));
        }
        assets
            .store_asset(required.content_hash, required.mime_type, &bytes)
            .map_err(|error| {
                OpenFailure::Storage(format!(
                    "could not store the asset for operation {operation_id}: {error}"
                ))
            })?;
        let manifest =
            ContentManifest::build(ContentManifestKind::Asset, required.mime_type, &bytes)
                .map_err(|error| OpenFailure::Rejected(error.to_string()))?;
        Ok(vec![manifest])
    }

    fn open_content(
        &self,
        transport: &dyn SyncTransport,
        content: &SealedContent,
        context: &str,
        cancellation: &SyncCancellation,
    ) -> Result<Vec<u8>, OpenFailure> {
        let ciphertext = self
            .fetch_ciphertext(transport, content, cancellation)
            .map_err(OpenFailure::Transport)?;
        open(
            &self.key,
            &content.scheme,
            &content.key_id,
            context,
            &content.nonce,
            &ciphertext,
        )
        .map_err(|error| OpenFailure::Unreadable(error.to_string()))
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

/// Everything the service stores next to a sealed operation that decides how
/// it is applied. All of it is authenticated, so the service cannot move a
/// ciphertext to another device, sequence, or causal base.
struct OperationSlot<'a> {
    operation_id: &'a str,
    device_id: &'a str,
    client_sequence: u64,
    base_server_sequence: u64,
}

/// Sealed content is bound to the slot it belongs in, so a ciphertext cannot
/// be replayed into another operation, another asset, or another workspace.
fn operation_context(workspace_id: &str, slot: &OperationSlot<'_>) -> String {
    format!(
        "skriuw/sync/operation/{workspace_id}/{}/{}/{}/{}",
        slot.device_id, slot.client_sequence, slot.base_server_sequence, slot.operation_id
    )
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
