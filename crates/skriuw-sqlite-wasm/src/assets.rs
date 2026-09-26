//! Durable content-addressed asset storage for the browser runtime.
//!
//! The desktop runtime keeps image bytes in a filesystem blob store; the
//! browser has no filesystem, so replicated asset bytes persist in a small
//! dedicated SQLite database behind the same OPFS VFS as the workspace. The
//! store stays outside the canonical workspace schema so the two runtimes
//! keep one workspace database shape.

use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, params};
use skriuw_domain::content_digest;
use skriuw_sync::SyncAssetStore;

use crate::protocol::{
    BrowserAssetChunk, BrowserAssetWrite, BrowserStorageError, BrowserWorkerCommand,
    BrowserWorkerRequest, BrowserWorkerResponse, BrowserWorkerValue, MAX_ASSET_BYTES,
    MAX_ASSET_CHUNK_BYTES,
};
use crate::runtime::validate_header;

const SCHEMA_SQL: &str = "CREATE TABLE IF NOT EXISTS asset_blobs (
    content_hash TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    bytes BLOB NOT NULL,
    stored_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (content_hash, mime_type)
) STRICT;
CREATE TABLE IF NOT EXISTS asset_uploads (
    content_hash TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    bytes BLOB NOT NULL,
    PRIMARY KEY (content_hash, mime_type)
) STRICT;";

pub struct BrowserAssetStore {
    connection: Mutex<Connection>,
}

impl BrowserAssetStore {
    pub fn open(database_name: &str) -> Result<Self, String> {
        let connection = Connection::open(database_name)
            .map_err(|error| format!("could not open the browser asset store: {error}"))?;
        Self::initialize(connection)
    }

    pub fn open_in_memory() -> Result<Self, String> {
        let connection = Connection::open_in_memory()
            .map_err(|error| format!("could not open the browser asset store: {error}"))?;
        Self::initialize(connection)
    }

    fn initialize(connection: Connection) -> Result<Self, String> {
        connection
            .execute_batch(SCHEMA_SQL)
            .map_err(|error| format!("could not prepare the browser asset store: {error}"))?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }
}

impl BrowserAssetStore {
    /// Appends one in-order chunk of a locally added blob. The blob moves into
    /// the replicated store once the last chunk arrives and its digest
    /// matches; an already stored blob reports complete immediately.
    pub fn write_chunk(
        &self,
        content_hash: &str,
        mime_type: &str,
        offset: u64,
        total_size: u64,
        bytes: &[u8],
    ) -> Result<bool, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| "browser asset store lock is unavailable".to_string())?;
        let stored: Option<i64> = connection
            .query_row(
                "SELECT 1 FROM asset_blobs WHERE content_hash = ?1 AND mime_type = ?2",
                params![content_hash, mime_type],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| format!("could not read the asset store: {error}"))?;
        if stored.is_some() {
            return Ok(true);
        }
        if offset == 0 {
            connection
                .execute(
                    "INSERT OR REPLACE INTO asset_uploads (content_hash, mime_type, bytes)
                     VALUES (?1, ?2, ?3)",
                    params![content_hash, mime_type, bytes],
                )
                .map_err(|error| format!("could not stage the asset: {error}"))?;
        } else {
            let staged: Option<Vec<u8>> = connection
                .query_row(
                    "SELECT bytes FROM asset_uploads WHERE content_hash = ?1 AND mime_type = ?2",
                    params![content_hash, mime_type],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| format!("could not read the staged asset: {error}"))?;
            let Some(mut staged) = staged.filter(|staged| staged.len() as u64 == offset) else {
                return Err("asset chunk does not continue the staged upload".into());
            };
            staged.extend_from_slice(bytes);
            connection
                .execute(
                    "UPDATE asset_uploads SET bytes = ?3 WHERE content_hash = ?1 AND mime_type = ?2",
                    params![content_hash, mime_type, staged],
                )
                .map_err(|error| format!("could not stage the asset: {error}"))?;
        }
        if offset + bytes.len() as u64 != total_size {
            return Ok(false);
        }
        let staged: Vec<u8> = connection
            .query_row(
                "SELECT bytes FROM asset_uploads WHERE content_hash = ?1 AND mime_type = ?2",
                params![content_hash, mime_type],
                |row| row.get(0),
            )
            .map_err(|error| format!("could not read the staged asset: {error}"))?;
        connection
            .execute(
                "DELETE FROM asset_uploads WHERE content_hash = ?1 AND mime_type = ?2",
                params![content_hash, mime_type],
            )
            .map_err(|error| format!("could not clear the staged asset: {error}"))?;
        drop(connection);
        self.store_asset(content_hash, mime_type, &staged)?;
        Ok(true)
    }

    /// Reads `length` bytes from `offset` of a replicated blob, or `None` when
    /// this device has not received it.
    pub fn read_chunk(
        &self,
        content_hash: &str,
        mime_type: &str,
        offset: u64,
        length: u64,
    ) -> Result<Option<BrowserAssetChunk>, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| "browser asset store lock is unavailable".to_string())?;
        connection
            .query_row(
                "SELECT length(bytes), substr(bytes, ?3 + 1, ?4) FROM asset_blobs
                 WHERE content_hash = ?1 AND mime_type = ?2",
                params![content_hash, mime_type, offset as i64, length as i64],
                |row| {
                    Ok(BrowserAssetChunk {
                        total_size: row.get::<_, i64>(0)? as u64,
                        bytes: row.get::<_, Option<Vec<u8>>>(1)?.unwrap_or_default(),
                    })
                },
            )
            .optional()
            .map_err(|error| format!("could not read the stored asset: {error}"))
    }
}

/// True for the commands [`dispatch_asset_command`] serves.
pub fn is_asset_command(command: &BrowserWorkerCommand) -> bool {
    matches!(
        command,
        BrowserWorkerCommand::WriteAssetChunk { .. } | BrowserWorkerCommand::ReadAssetChunk { .. }
    )
}

/// Serves the media chunk commands against the worker's asset store.
pub fn dispatch_asset_command(
    request: BrowserWorkerRequest,
    store: Result<&BrowserAssetStore, String>,
) -> BrowserWorkerResponse {
    let request_id = request.request_id;
    if let Err(response) = validate_header(&request) {
        return response;
    }
    let outcome = store.and_then(|store| match request.command {
        BrowserWorkerCommand::WriteAssetChunk {
            content_hash,
            mime_type,
            offset,
            total_size,
            bytes,
        } => {
            validate_asset_identity(&content_hash, &mime_type)?;
            if bytes.len() > MAX_ASSET_CHUNK_BYTES || total_size > MAX_ASSET_BYTES {
                return Err("asset chunk is too large".into());
            }
            if offset + bytes.len() as u64 > total_size {
                return Err("asset chunk runs past the declared size".into());
            }
            store
                .write_chunk(&content_hash, &mime_type, offset, total_size, &bytes)
                .map(|complete| BrowserWorkerValue::AssetWrite(BrowserAssetWrite { complete }))
        }
        BrowserWorkerCommand::ReadAssetChunk {
            content_hash,
            mime_type,
            offset,
            length,
        } => {
            validate_asset_identity(&content_hash, &mime_type)?;
            store
                .read_chunk(
                    &content_hash,
                    &mime_type,
                    offset,
                    length.min(MAX_ASSET_CHUNK_BYTES as u64),
                )
                .map(BrowserWorkerValue::AssetChunk)
        }
        _ => Err("not an asset command".into()),
    });
    match outcome {
        Ok(value) => BrowserWorkerResponse::success(request_id, value),
        Err(message) => {
            BrowserWorkerResponse::failure(request_id, BrowserStorageError::invalid(message))
        }
    }
}

fn validate_asset_identity(content_hash: &str, mime_type: &str) -> Result<(), String> {
    let hash_valid = content_hash.len() == 64
        && content_hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
    if !hash_valid || mime_type.is_empty() || mime_type.len() > 64 {
        return Err("invalid asset identity".into());
    }
    Ok(())
}

impl SyncAssetStore for BrowserAssetStore {
    fn read_asset(&self, content_hash: &str, mime_type: &str) -> Result<Option<Vec<u8>>, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| "browser asset store lock is unavailable".to_string())?;
        connection
            .query_row(
                "SELECT bytes FROM asset_blobs WHERE content_hash = ?1 AND mime_type = ?2",
                params![content_hash, mime_type],
                |row| row.get::<_, Vec<u8>>(0),
            )
            .optional()
            .map_err(|error| format!("could not read the stored asset: {error}"))
    }

    fn store_asset(&self, content_hash: &str, mime_type: &str, bytes: &[u8]) -> Result<(), String> {
        if content_digest(bytes) != content_hash {
            return Err("asset bytes do not match their declared content hash".into());
        }
        let connection = self
            .connection
            .lock()
            .map_err(|_| "browser asset store lock is unavailable".to_string())?;
        connection
            .execute(
                "INSERT OR REPLACE INTO asset_blobs
                   (content_hash, mime_type, byte_size, bytes, stored_at)
                 VALUES (?1, ?2, ?3, ?4, 0)",
                params![content_hash, mime_type, bytes.len() as i64, bytes],
            )
            .map_err(|error| format!("could not store the replicated asset: {error}"))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_bytes_and_rejects_digest_mismatches() {
        let store = BrowserAssetStore::open_in_memory().expect("open asset store");
        let bytes = b"browser asset bytes".to_vec();
        let digest = content_digest(&bytes);

        assert_eq!(store.read_asset(&digest, "image/png"), Ok(None));
        store
            .store_asset(&digest, "image/png", &bytes)
            .expect("store asset");
        store
            .store_asset(&digest, "image/png", &bytes)
            .expect("storing identical bytes twice is a no-op");
        assert_eq!(store.read_asset(&digest, "image/png"), Ok(Some(bytes)));
        assert!(
            store
                .store_asset(&digest, "image/png", b"different bytes")
                .is_err()
        );
    }

    #[test]
    fn chunked_writes_land_verified_and_read_back_in_chunks() {
        let store = BrowserAssetStore::open_in_memory().expect("open asset store");
        let bytes = b"chunked media bytes".to_vec();
        let digest = content_digest(&bytes);
        let total = bytes.len() as u64;

        assert_eq!(
            store.write_chunk(&digest, "image/png", 0, total, &bytes[..7]),
            Ok(false)
        );
        assert!(
            store
                .write_chunk(&digest, "image/png", 3, total, &bytes[3..])
                .is_err()
        );
        assert_eq!(
            store.write_chunk(&digest, "image/png", 7, total, &bytes[7..]),
            Ok(true)
        );
        assert_eq!(
            store.read_asset(&digest, "image/png"),
            Ok(Some(bytes.clone()))
        );
        assert_eq!(
            store.write_chunk(&digest, "image/png", 0, total, &bytes[..7]),
            Ok(true)
        );

        let chunk = store
            .read_chunk(&digest, "image/png", 7, 5)
            .expect("read chunk")
            .expect("stored");
        assert_eq!(chunk.total_size, total);
        assert_eq!(chunk.bytes, bytes[7..12].to_vec());
        assert_eq!(store.read_chunk(&digest, "image/jpeg", 0, 5), Ok(None));
    }

    #[test]
    fn corrupt_chunked_upload_is_rejected() {
        let store = BrowserAssetStore::open_in_memory().expect("open asset store");
        let digest = content_digest(b"expected");
        assert!(
            store
                .write_chunk(&digest, "image/png", 0, 8, b"tampered")
                .is_err()
        );
        assert_eq!(store.read_asset(&digest, "image/png"), Ok(None));
    }
}
