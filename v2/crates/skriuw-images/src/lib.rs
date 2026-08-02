//! Workspace-local, content-addressed image blob store.
//!
//! Blobs live as `<sha256-hex>.<ext>` files inside one flat directory that
//! sits next to the SQLite database. The store never touches the database;
//! callers pass in the set of live hashes when sweeping.

use std::{
    collections::BTreeSet,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, SystemTime},
};

use sha2::{Digest, Sha256};
use thiserror::Error;

pub const CONTENT_HASH_HEX_LENGTH: usize = 64;
static TEMPORARY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlobEntry {
    pub content_hash: String,
    pub mime_type: &'static str,
    pub byte_size: u64,
    pub modified_at_ms: u64,
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
        if target.exists() {
            verify_content(&target, &content_hash)?;
        } else {
            self.publish(&target, &content_hash, bytes)?;
        }
        Ok(StoredImage {
            content_hash,
            mime_type,
            byte_size: bytes.len() as u64,
        })
    }

    fn publish(
        &self,
        target: &Path,
        content_hash: &str,
        bytes: &[u8],
    ) -> Result<(), ImageStoreError> {
        let sequence = TEMPORARY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let temporary = self.root.join(format!(
            ".{content_hash}.{}.{}",
            std::process::id(),
            sequence
        ));
        let result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)?;
            file.write_all(bytes)?;
            file.sync_all()?;
            drop(file);
            match fs::rename(&temporary, target) {
                Ok(()) => sync_directory(target),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                    verify_content(target, content_hash)
                }
                Err(error) => Err(error),
            }
        })();
        if result.is_err() || temporary.exists() {
            let _ = fs::remove_file(&temporary);
        }
        result.map_err(ImageStoreError::from)
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

    /// Lists every valid blob file in the store, newest first.
    pub fn list(&self) -> Result<Vec<BlobEntry>, ImageStoreError> {
        let mut entries = Vec::new();
        for entry in fs::read_dir(&self.root)? {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }
            let name = entry.file_name();
            let Some((hash, extension)) = name
                .to_str()
                .and_then(|name| name.split_once('.'))
                .filter(|(hash, _)| validate_content_hash(hash).is_ok())
            else {
                continue;
            };
            let Some(mime_type) = mime_for_extension(extension) else {
                continue;
            };
            let metadata = entry.metadata()?;
            let modified_at_ms = metadata
                .modified()
                .ok()
                .and_then(|modified| modified.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map_or(0, |elapsed| elapsed.as_millis() as u64);
            entries.push(BlobEntry {
                content_hash: hash.to_string(),
                mime_type,
                byte_size: metadata.len(),
                modified_at_ms,
            });
        }
        entries.sort_by(|left, right| {
            right
                .modified_at_ms
                .cmp(&left.modified_at_ms)
                .then_with(|| left.content_hash.cmp(&right.content_hash))
        });
        Ok(entries)
    }

    /// Removes one blob file. Deleting an already-absent blob is an error so
    /// callers surface stale UI state instead of silently succeeding.
    pub fn delete(&self, content_hash: &str, mime_type: &str) -> Result<(), ImageStoreError> {
        let path = self.blob_path(content_hash, mime_type)?;
        if !path.exists() {
            return Err(ImageStoreError::MissingBlob);
        }
        fs::remove_file(path)?;
        Ok(())
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

fn verify_content(path: &Path, expected_hash: &str) -> io::Result<()> {
    let bytes = fs::read(path)?;
    let actual_hash = format!("{:x}", Sha256::digest(bytes));
    if actual_hash == expected_hash {
        Ok(())
    } else {
        Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "existing image blob does not match its content hash",
        ))
    }
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> io::Result<()> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::File::open(parent)?.sync_all()
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> io::Result<()> {
    Ok(())
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

/// Inverse of [`extension_for`] for blob files found on disk.
#[must_use]
pub fn mime_for_extension(extension: &str) -> Option<&'static str> {
    match extension {
        "png" => Some("image/png"),
        "jpg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
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
    use std::{
        collections::BTreeSet,
        fs,
        sync::{Arc, Barrier},
        thread,
        time::Duration,
    };

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
    fn concurrent_identical_puts_publish_one_complete_blob() {
        let dir = tempdir().expect("tempdir");
        let store = Arc::new(ImageStore::open(dir.path().join("blobs")).expect("open store"));
        let barrier = Arc::new(Barrier::new(16));
        let workers = (0..16)
            .map(|_| {
                let store = Arc::clone(&store);
                let barrier = Arc::clone(&barrier);
                thread::spawn(move || {
                    barrier.wait();
                    store.put(PNG).expect("concurrent put")
                })
            })
            .collect::<Vec<_>>();
        let stored = workers
            .into_iter()
            .map(|worker| worker.join().expect("join put"))
            .collect::<Vec<_>>();

        assert!(stored.windows(2).all(|pair| pair[0] == pair[1]));
        assert_eq!(fs::read_dir(store.root()).expect("list").count(), 1);
        assert_eq!(
            store
                .read(&stored[0].content_hash, stored[0].mime_type)
                .expect("read blob"),
            PNG
        );
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
        assert!(
            !store
                .exists(&stored.content_hash, stored.mime_type)
                .expect("exists")
        );
    }

    #[test]
    fn lists_and_deletes_blobs() {
        let dir = tempdir().expect("tempdir");
        let store = ImageStore::open(dir.path().join("blobs")).expect("open store");
        let stored = store.put(PNG).expect("store png");
        fs::write(store.root().join("not-a-blob.txt"), b"junk").expect("write junk");

        let listed = store.list().expect("list blobs");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].content_hash, stored.content_hash);
        assert_eq!(listed[0].mime_type, "image/png");
        assert_eq!(listed[0].byte_size, PNG.len() as u64);

        store
            .delete(&stored.content_hash, stored.mime_type)
            .expect("delete blob");
        assert!(store.list().expect("list after delete").is_empty());
        assert!(matches!(
            store.delete(&stored.content_hash, stored.mime_type),
            Err(ImageStoreError::MissingBlob)
        ));
    }

    #[test]
    fn sniffs_supported_formats() {
        assert_eq!(sniff_mime(PNG), Some("image/png"));
        assert_eq!(sniff_mime(&[0xff, 0xd8, 0xff, 0xe0]), Some("image/jpeg"));
        assert_eq!(sniff_mime(b"GIF89a......"), Some("image/gif"));
        assert_eq!(
            sniff_mime(b"RIFF\x00\x00\x00\x00WEBPVP8 "),
            Some("image/webp")
        );
        assert_eq!(sniff_mime(b"<svg></svg>"), None);
    }
}
