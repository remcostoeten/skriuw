use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const CONTENT_MANIFEST_VERSION: u16 = 1;
pub const CONTENT_DIGEST_HEX_BYTES: usize = 64;
pub const CANONICAL_CHUNK_BYTES: usize = 1024 * 1024;
pub const MAX_MANIFEST_CHUNKS: usize = 256;
pub const MAX_CONTENT_BYTES: u64 = (CANONICAL_CHUNK_BYTES * MAX_MANIFEST_CHUNKS) as u64;
pub const MAX_CONTENT_MIME_BYTES: usize = 128;

const SUPPORTED_CONTENT_MIME_PREFIXES: [&str; 5] =
    ["application/", "image/", "text/", "audio/", "video/"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ContentHashAlgorithm {
    Sha256,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ContentEncoding {
    Identity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ContentManifestKind {
    OperationEnvelope,
    Asset,
    Checkpoint,
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ContentValidationError {
    #[error("unsupported content manifest version {0}")]
    UnsupportedManifestVersion(u16),
    #[error("content manifest cannot be empty")]
    EmptyManifest,
    #[error("content manifest exceeds {maximum} chunks")]
    TooManyChunks { maximum: usize },
    #[error("{field} is not a lowercase hexadecimal sha-256 digest")]
    InvalidDigest { field: &'static str },
    #[error("content exceeds {maximum} bytes")]
    ContentTooLarge { maximum: u64 },
    #[error("chunk {index} must be exactly {expected} bytes")]
    NonCanonicalChunkLength { index: usize, expected: usize },
    #[error("chunk {index} cannot be empty")]
    EmptyChunk { index: usize },
    #[error("declared total length does not match the sum of chunk lengths")]
    InconsistentTotalLength,
    #[error("chunk index {index} is outside the manifest")]
    ChunkIndexOutOfRange { index: usize },
    #[error("{field} does not match the content it describes")]
    DigestMismatch { field: &'static str },
    #[error("content mime type is empty, oversized, or outside the supported types")]
    InvalidMimeType,
}

fn validate_content_mime_type(value: &str) -> Result<(), ContentValidationError> {
    if value.len() > MAX_CONTENT_MIME_BYTES {
        return Err(ContentValidationError::InvalidMimeType);
    }
    let subtype = SUPPORTED_CONTENT_MIME_PREFIXES
        .iter()
        .find_map(|prefix| value.strip_prefix(prefix))
        .unwrap_or("");
    if subtype.is_empty()
        || !subtype
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'+' | b'.'))
    {
        return Err(ContentValidationError::InvalidMimeType);
    }
    Ok(())
}

#[must_use]
pub fn content_digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn validate_content_digest(
    field: &'static str,
    value: &str,
) -> Result<(), ContentValidationError> {
    if value.len() != CONTENT_DIGEST_HEX_BYTES
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(ContentValidationError::InvalidDigest { field });
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentChunkRef {
    pub digest: String,
    pub byte_length: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentManifest {
    pub manifest_version: u16,
    pub kind: ContentManifestKind,
    pub algorithm: ContentHashAlgorithm,
    pub encoding: ContentEncoding,
    pub content_digest: String,
    pub mime_type: String,
    pub total_byte_length: u64,
    pub chunks: Vec<ContentChunkRef>,
}

impl ContentManifest {
    pub fn build(
        kind: ContentManifestKind,
        mime_type: impl Into<String>,
        bytes: &[u8],
    ) -> Result<Self, ContentValidationError> {
        let mime_type = mime_type.into();
        validate_content_mime_type(&mime_type)?;
        if bytes.is_empty() {
            return Err(ContentValidationError::EmptyManifest);
        }
        if bytes.len() as u64 > MAX_CONTENT_BYTES {
            return Err(ContentValidationError::ContentTooLarge {
                maximum: MAX_CONTENT_BYTES,
            });
        }

        let chunks = bytes
            .chunks(CANONICAL_CHUNK_BYTES)
            .map(|chunk| ContentChunkRef {
                digest: content_digest(chunk),
                byte_length: chunk.len() as u32,
            })
            .collect::<Vec<_>>();

        let manifest = Self {
            manifest_version: CONTENT_MANIFEST_VERSION,
            kind,
            algorithm: ContentHashAlgorithm::Sha256,
            encoding: ContentEncoding::Identity,
            content_digest: content_digest(bytes),
            mime_type,
            total_byte_length: bytes.len() as u64,
            chunks,
        };
        manifest.validate()?;
        Ok(manifest)
    }

    pub fn validate(&self) -> Result<(), ContentValidationError> {
        if self.manifest_version != CONTENT_MANIFEST_VERSION {
            return Err(ContentValidationError::UnsupportedManifestVersion(
                self.manifest_version,
            ));
        }
        validate_content_digest("content digest", &self.content_digest)?;
        validate_content_mime_type(&self.mime_type)?;
        if self.chunks.is_empty() {
            return Err(ContentValidationError::EmptyManifest);
        }
        if self.chunks.len() > MAX_MANIFEST_CHUNKS {
            return Err(ContentValidationError::TooManyChunks {
                maximum: MAX_MANIFEST_CHUNKS,
            });
        }
        if self.total_byte_length > MAX_CONTENT_BYTES {
            return Err(ContentValidationError::ContentTooLarge {
                maximum: MAX_CONTENT_BYTES,
            });
        }

        let last = self.chunks.len() - 1;
        let mut total = 0u64;
        for (index, chunk) in self.chunks.iter().enumerate() {
            validate_content_digest("chunk digest", &chunk.digest)?;
            if chunk.byte_length == 0 {
                return Err(ContentValidationError::EmptyChunk { index });
            }
            if index < last && chunk.byte_length as usize != CANONICAL_CHUNK_BYTES {
                return Err(ContentValidationError::NonCanonicalChunkLength {
                    index,
                    expected: CANONICAL_CHUNK_BYTES,
                });
            }
            if chunk.byte_length as usize > CANONICAL_CHUNK_BYTES {
                return Err(ContentValidationError::NonCanonicalChunkLength {
                    index,
                    expected: CANONICAL_CHUNK_BYTES,
                });
            }
            total += u64::from(chunk.byte_length);
        }
        if total != self.total_byte_length {
            return Err(ContentValidationError::InconsistentTotalLength);
        }
        Ok(())
    }

    #[must_use]
    pub fn chunk_offset(&self, index: usize) -> u64 {
        (index as u64) * CANONICAL_CHUNK_BYTES as u64
    }

    pub fn verify_chunk(&self, index: usize, bytes: &[u8]) -> Result<(), ContentValidationError> {
        let chunk = self
            .chunks
            .get(index)
            .ok_or(ContentValidationError::ChunkIndexOutOfRange { index })?;
        if bytes.len() != chunk.byte_length as usize {
            return Err(ContentValidationError::DigestMismatch {
                field: "chunk length",
            });
        }
        if content_digest(bytes) != chunk.digest {
            return Err(ContentValidationError::DigestMismatch {
                field: "chunk digest",
            });
        }
        Ok(())
    }

    pub fn verify_assembled(&self, bytes: &[u8]) -> Result<(), ContentValidationError> {
        self.validate()?;
        if bytes.len() as u64 != self.total_byte_length {
            return Err(ContentValidationError::DigestMismatch {
                field: "content length",
            });
        }
        for (index, chunk) in bytes.chunks(CANONICAL_CHUNK_BYTES).enumerate() {
            self.verify_chunk(index, chunk)?;
        }
        if content_digest(bytes) != self.content_digest {
            return Err(ContentValidationError::DigestMismatch {
                field: "content digest",
            });
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        CANONICAL_CHUNK_BYTES, ContentManifest, ContentManifestKind, ContentValidationError,
        MAX_CONTENT_BYTES, MAX_MANIFEST_CHUNKS, content_digest,
    };

    fn payload(length: usize) -> Vec<u8> {
        (0..length).map(|index| (index % 251) as u8).collect()
    }

    fn asset_manifest(bytes: &[u8]) -> ContentManifest {
        ContentManifest::build(ContentManifestKind::Asset, "image/png", bytes)
            .expect("valid manifest")
    }

    #[test]
    fn canonical_chunking_is_deterministic_and_verifiable() {
        let bytes = payload(CANONICAL_CHUNK_BYTES * 2 + 17);
        let manifest = asset_manifest(&bytes);

        assert_eq!(manifest.chunks.len(), 3);
        assert_eq!(
            manifest.chunks[0].byte_length as usize,
            CANONICAL_CHUNK_BYTES
        );
        assert_eq!(manifest.chunks[2].byte_length, 17);
        assert_eq!(manifest.total_byte_length, bytes.len() as u64);
        assert_eq!(manifest.content_digest, content_digest(&bytes));
        assert_eq!(manifest.chunk_offset(2), CANONICAL_CHUNK_BYTES as u64 * 2);
        assert_eq!(manifest, asset_manifest(&bytes));
        manifest
            .verify_assembled(&bytes)
            .expect("assembled content");
    }

    #[test]
    fn rejects_content_above_the_configured_ceiling() {
        let error = ContentManifest::build(
            ContentManifestKind::Asset,
            "image/png",
            &vec![0u8; MAX_CONTENT_BYTES as usize + 1],
        )
        .expect_err("oversized content must fail");
        assert_eq!(
            error,
            ContentValidationError::ContentTooLarge {
                maximum: MAX_CONTENT_BYTES
            }
        );
    }

    #[test]
    fn rejects_non_canonical_interior_chunk_lengths() {
        let bytes = payload(CANONICAL_CHUNK_BYTES + 8);
        let mut manifest = asset_manifest(&bytes);
        manifest.chunks[0].byte_length -= 1;
        manifest.total_byte_length -= 1;

        assert_eq!(
            manifest.validate(),
            Err(ContentValidationError::NonCanonicalChunkLength {
                index: 0,
                expected: CANONICAL_CHUNK_BYTES
            })
        );
    }

    #[test]
    fn rejects_declared_length_that_disagrees_with_chunks() {
        let bytes = payload(64);
        let mut manifest = asset_manifest(&bytes);
        manifest.total_byte_length += 1;

        assert_eq!(
            manifest.validate(),
            Err(ContentValidationError::InconsistentTotalLength)
        );
    }

    #[test]
    fn rejects_chunk_bytes_that_do_not_hash_to_the_manifest() {
        let bytes = payload(128);
        let manifest = asset_manifest(&bytes);
        let mut tampered = bytes.clone();
        tampered[0] ^= 0xff;

        assert_eq!(
            manifest.verify_chunk(0, &tampered),
            Err(ContentValidationError::DigestMismatch {
                field: "chunk digest"
            })
        );
        assert_eq!(
            manifest.verify_assembled(&tampered),
            Err(ContentValidationError::DigestMismatch {
                field: "chunk digest"
            })
        );
    }

    #[test]
    fn rejects_content_digest_forged_over_matching_chunks() {
        let bytes = payload(32);
        let mut manifest = asset_manifest(&bytes);
        manifest.content_digest = content_digest(b"different");

        assert_eq!(
            manifest.verify_assembled(&bytes),
            Err(ContentValidationError::DigestMismatch {
                field: "content digest"
            })
        );
    }

    #[test]
    fn rejects_uppercase_and_malformed_digests() {
        let bytes = payload(32);
        let mut manifest = asset_manifest(&bytes);
        manifest.chunks[0].digest = manifest.chunks[0].digest.to_uppercase();
        assert_eq!(
            manifest.validate(),
            Err(ContentValidationError::InvalidDigest {
                field: "chunk digest"
            })
        );

        let mut manifest = asset_manifest(&bytes);
        manifest.content_digest = "zz".repeat(32);
        assert_eq!(
            manifest.validate(),
            Err(ContentValidationError::InvalidDigest {
                field: "content digest"
            })
        );
    }

    #[test]
    fn rejects_manifests_above_the_chunk_ceiling() {
        let bytes = payload(64);
        let mut manifest = asset_manifest(&bytes);
        manifest.chunks = (0..MAX_MANIFEST_CHUNKS + 1)
            .map(|_| manifest.chunks[0].clone())
            .collect();

        assert_eq!(
            manifest.validate(),
            Err(ContentValidationError::TooManyChunks {
                maximum: MAX_MANIFEST_CHUNKS
            })
        );
    }

    #[test]
    fn rejects_unknown_algorithms_and_manifest_versions() {
        let bytes = payload(32);
        let mut manifest = asset_manifest(&bytes);
        manifest.manifest_version = 2;
        assert_eq!(
            manifest.validate(),
            Err(ContentValidationError::UnsupportedManifestVersion(2))
        );

        let json = serde_json::to_string(&asset_manifest(&bytes)).expect("serialize manifest");
        let unknown = json.replace("\"sha256\"", "\"md5\"");
        assert!(serde_json::from_str::<ContentManifest>(&unknown).is_err());

        let extra = json.replace(
            "{\"manifestVersion\"",
            "{\"attacker\":1,\"manifestVersion\"",
        );
        assert!(serde_json::from_str::<ContentManifest>(&extra).is_err());
    }
}
