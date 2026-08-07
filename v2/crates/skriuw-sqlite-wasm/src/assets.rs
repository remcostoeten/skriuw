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

const SCHEMA_SQL: &str = "CREATE TABLE IF NOT EXISTS asset_blobs (
    content_hash TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    bytes BLOB NOT NULL,
    stored_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (content_hash, mime_type)
) STRICT";

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
            .execute(SCHEMA_SQL, [])
            .map_err(|error| format!("could not prepare the browser asset store: {error}"))?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }
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
}
