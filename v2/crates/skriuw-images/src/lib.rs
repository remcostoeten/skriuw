//! Workspace-local, content-addressed image blob store.
//!
//! Blobs live as `<sha256-hex>.<ext>` files inside one flat directory that
//! sits next to the SQLite database. The store never touches the database;
//! callers pass in the set of live hashes when sweeping.

use std::{
    collections::BTreeSet,
    fs, io,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

use sha2::{Digest, Sha256};
use thiserror::Error;

pub const CONTENT_HASH_HEX_LENGTH: usize = 64;

#[derive(Debug, Error)]
pub enum ImageStoreError {
    #[error("invalid content hash")]
    InvalidContentHash,
    #[error("unsupported image data")]
    UnsupportedImage,
    #[error("blob is missing")]
    MissingBlob,
    #[error("blob store i/o failed: {0}")]
    Io(#[from] io::Error),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredImage {
    pub content_hash: String,
    pub mime_type: &'static str,
    pub byte_size: u64,
}

pub struct ImageStore {
    root: PathBuf,
}

impl ImageStore {
    pub fn open(root: impl Into<PathBuf>) -> Result<Self, ImageStoreError> {
        let root = root.into();
        fs::create_dir_all(&root)?;
        Ok(Self { root })
    }

    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Sniffs, hashes, and durably writes one image. Re-storing identical
    /// bytes is a no-op that returns the existing hash.
    pub fn put(&self, bytes: &[u8]) -> Result<StoredImage, ImageStoreError> {
        let mime_type = sniff_mime(bytes).ok_or(ImageStoreError::UnsupportedImage)?;
        let content_hash = format!("{:x}", Sha256::digest(bytes));
        let target = self
            .root
            .join(blob_file_name(&content_hash, extension_for(mime_type)));
        if !target.exists() {
            let temporary = self
                .root
                .join(format!(".{content_hash}.{}", std::process::id()));
            fs::write(&temporary, bytes)?;
            if let Err(error) = fs::rename(&temporary, &target) {
                let _ = fs::remove_file(&temporary);
                return Err(error.into());
            }
        }
        Ok(StoredImage {
            content_hash,
            mime_type,
            byte_size: bytes.len() as u64,
        })
    }

    pub fn read(&self, content_hash: &str, mime_type: &str) -> Result<Vec<u8>, ImageStoreError> {
        let path = self.blob_path(content_hash, mime_type)?;
        if !path.exists() {
            return Err(ImageStoreError::MissingBlob);
        }
        Ok(fs::read(path)?)
    }

    pub fn exists(&self, content_hash: &str, mime_type: &str) -> Result<bool, ImageStoreError> {
        Ok(self.blob_path(content_hash, mime_type)?.exists())
    }

    pub fn blob_path(
        &self,
        content_hash: &str,
        mime_type: &str,
    ) -> Result<PathBuf, ImageStoreError> {
        validate_content_hash(content_hash)?;
        Ok(self
            .root
            .join(blob_file_name(content_hash, extension_for(mime_type))))
    }

    /// Deletes blob files whose hash is not in `live`. Files younger than
    /// `minimum_age` survive so a blob written just before its registering
    /// operation commits is never collected.
    pub fn sweep_unreferenced(
        &self,
        live: &BTreeSet<String>,
        minimum_age: Duration,
    ) -> Result<usize, ImageStoreError> {
        let now = SystemTime::now();
        let mut removed = 0;
        for entry in fs::read_dir(&self.root)? {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }
            let name = entry.file_name();
            let Some(hash) = name
                .to_str()
                .and_then(|name| name.split('.').next())
                .filter(|hash| validate_content_hash(hash).is_ok())
            else {
                continue;
            };
            if live.contains(hash) {
                continue;
            }
            let age = entry
                .metadata()?
                .modified()
                .ok()
                .and_then(|modified| now.duration_since(modified).ok());
            if age.is_none_or(|age| age < minimum_age) {
                continue;
            }
            fs::remove_file(entry.path())?;
            removed += 1;
        }
        Ok(removed)
    }
}

fn blob_file_name(content_hash: &str, extension: &str) -> String {
    format!("{content_hash}.{extension}")
}

fn validate_content_hash(value: &str) -> Result<(), ImageStoreError> {
    if value.len() == CONTENT_HASH_HEX_LENGTH
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        Ok(())
    } else {
        Err(ImageStoreError::InvalidContentHash)
    }
}

/// Maps a MIME type onto the blob file extension. Must stay in sync with the
/// renderer's `imageFileExtension` in `app/src/export/markdown-transfer-model.ts`.
#[must_use]
pub fn extension_for(mime_type: &str) -> &'static str {
    match mime_type {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "img",
    }
}

/// Identifies supported image formats by magic bytes.
#[must_use]
pub fn sniff_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    None
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeSet, fs, time::Duration};

    use tempfile::tempdir;

    use super::{ImageStore, ImageStoreError, sniff_mime};

    const PNG: &[u8] = &[
        0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ];

    #[test]
    fn stores_reads_and_deduplicates_blobs() {
        let dir = tempdir().expect("tempdir");
        let store = ImageStore::open(dir.path().join("blobs")).expect("open store");

        let first = store.put(PNG).expect("store png");
        let second = store.put(PNG).expect("store png again");
        assert_eq!(first, second);
        assert_eq!(first.mime_type, "image/png");
        assert_eq!(
            store
                .read(&first.content_hash, first.mime_type)
                .expect("read blob"),
            PNG
        );
        assert_eq!(fs::read_dir(store.root()).expect("list").count(), 1);
    }

    #[test]
    fn rejects_unsupported_bytes_and_invalid_hashes() {
        let dir = tempdir().expect("tempdir");
        let store = ImageStore::open(dir.path().join("blobs")).expect("open store");

        assert!(matches!(
            store.put(b"not an image"),
            Err(ImageStoreError::UnsupportedImage)
        ));
        assert!(matches!(
            store.read("../../etc/passwd", "image/png"),
            Err(ImageStoreError::InvalidContentHash)
        ));
        assert!(matches!(
            store.read(&"a".repeat(64), "image/png"),
            Err(ImageStoreError::MissingBlob)
        ));
    }

    #[test]
    fn sweeps_only_old_unreferenced_blobs() {
        let dir = tempdir().expect("tempdir");
        let store = ImageStore::open(dir.path().join("blobs")).expect("open store");
        let stored = store.put(PNG).expect("store png");

        let fresh = store
            .sweep_unreferenced(&BTreeSet::new(), Duration::from_secs(3600))
            .expect("sweep fresh");
        assert_eq!(fresh, 0);

        let live = BTreeSet::from([stored.content_hash.clone()]);
        assert_eq!(
            store
                .sweep_unreferenced(&live, Duration::ZERO)
                .expect("sweep live"),
            0
        );
        assert_eq!(
            store
                .sweep_unreferenced(&BTreeSet::new(), Duration::ZERO)
                .expect("sweep dead"),
            1
        );
        assert!(!store
            .exists(&stored.content_hash, stored.mime_type)
            .expect("exists"));
    }

    #[test]
    fn sniffs_supported_formats() {
        assert_eq!(sniff_mime(PNG), Some("image/png"));
        assert_eq!(sniff_mime(&[0xff, 0xd8, 0xff, 0xe0]), Some("image/jpeg"));
        assert_eq!(sniff_mime(b"GIF89a......"), Some("image/gif"));
        assert_eq!(sniff_mime(b"RIFF\x00\x00\x00\x00WEBPVP8 "), Some("image/webp"));
        assert_eq!(sniff_mime(b"<svg></svg>"), None);
    }
}
