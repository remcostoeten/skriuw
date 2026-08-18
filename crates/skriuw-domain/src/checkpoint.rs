use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    ArchiveValidationError, ContentManifest, ContentManifestKind, ContentValidationError,
    MAX_SAFE_SYNC_SEQUENCE, SUPPORTED_ARCHIVE_VERSIONS, SUPPORTED_SYNC_PROTOCOL_VERSIONS,
    WORKSPACE_ARCHIVE_VERSION, WORKSPACE_SYNC_PROTOCOL_VERSION, WorkspaceArchive, validate_id,
};

pub const WORKSPACE_CHECKPOINT_VERSION: u16 = 1;
pub const CHECKPOINT_CONTENT_MIME_TYPE: &str = "application/json";

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum CheckpointValidationError {
    #[error("unsupported workspace checkpoint version {0}")]
    UnsupportedCheckpointVersion(u16),
    #[error("unsupported workspace sync protocol version {0}")]
    UnsupportedProtocol(u16),
    #[error("unsupported workspace archive version {0}")]
    UnsupportedArchiveVersion(u16),
    #[error("checkpoint server sequence is outside its supported range")]
    InvalidServerSequence,
    #[error("checkpoint timestamp cannot be negative")]
    NegativeTimestamp,
    #[error("checkpoint content must be a checkpoint manifest")]
    UnexpectedManifestKind,
    #[error("checkpoint content must be {expected}")]
    UnexpectedMimeType { expected: &'static str },
    #[error("checkpoint content is not a readable workspace archive")]
    UnreadableArchive,
    #[error("checkpoint archive version does not match its metadata")]
    ArchiveVersionMismatch,
    #[error(transparent)]
    Content(#[from] ContentValidationError),
    #[error(transparent)]
    Archive(#[from] ArchiveValidationError),
    #[error(transparent)]
    Identifier(#[from] crate::OperationValidationError),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceCheckpoint {
    pub checkpoint_version: u16,
    pub sync_protocol_version: u16,
    pub archive_version: u16,
    pub workspace_id: String,
    pub server_sequence: u64,
    pub created_at: i64,
    pub content: ContentManifest,
}

impl WorkspaceCheckpoint {
    pub fn build(
        workspace_id: impl Into<String>,
        server_sequence: u64,
        created_at: i64,
        archive: &WorkspaceArchive,
    ) -> Result<(Self, Vec<u8>), CheckpointValidationError> {
        archive.validate()?;
        let bytes = serde_json::to_vec(archive)
            .map_err(|_| CheckpointValidationError::UnreadableArchive)?;
        let content = ContentManifest::build(
            ContentManifestKind::Checkpoint,
            CHECKPOINT_CONTENT_MIME_TYPE,
            &bytes,
        )?;
        let checkpoint = Self {
            checkpoint_version: WORKSPACE_CHECKPOINT_VERSION,
            sync_protocol_version: WORKSPACE_SYNC_PROTOCOL_VERSION,
            archive_version: archive.archive_version,
            workspace_id: workspace_id.into(),
            server_sequence,
            created_at,
            content,
        };
        checkpoint.validate()?;
        Ok((checkpoint, bytes))
    }

    pub fn validate(&self) -> Result<(), CheckpointValidationError> {
        if self.checkpoint_version != WORKSPACE_CHECKPOINT_VERSION {
            return Err(CheckpointValidationError::UnsupportedCheckpointVersion(
                self.checkpoint_version,
            ));
        }
        if !SUPPORTED_SYNC_PROTOCOL_VERSIONS.contains(&self.sync_protocol_version) {
            return Err(CheckpointValidationError::UnsupportedProtocol(
                self.sync_protocol_version,
            ));
        }
        if !SUPPORTED_ARCHIVE_VERSIONS.contains(&self.archive_version) {
            return Err(CheckpointValidationError::UnsupportedArchiveVersion(
                self.archive_version,
            ));
        }
        validate_id("checkpoint workspace id", &self.workspace_id)?;
        if self.server_sequence > MAX_SAFE_SYNC_SEQUENCE {
            return Err(CheckpointValidationError::InvalidServerSequence);
        }
        if self.created_at < 0 {
            return Err(CheckpointValidationError::NegativeTimestamp);
        }
        if self.content.kind != ContentManifestKind::Checkpoint {
            return Err(CheckpointValidationError::UnexpectedManifestKind);
        }
        if self.content.mime_type != CHECKPOINT_CONTENT_MIME_TYPE {
            return Err(CheckpointValidationError::UnexpectedMimeType {
                expected: CHECKPOINT_CONTENT_MIME_TYPE,
            });
        }
        self.content.validate()?;
        Ok(())
    }

    /// Verify every byte of a downloaded checkpoint before it is allowed to
    /// replace local canonical state.
    pub fn verify_content(
        &self,
        bytes: &[u8],
    ) -> Result<WorkspaceArchive, CheckpointValidationError> {
        self.validate()?;
        self.content.verify_assembled(bytes)?;
        let archive = serde_json::from_slice::<WorkspaceArchive>(bytes)
            .map_err(|_| CheckpointValidationError::UnreadableArchive)?;
        if archive.archive_version != self.archive_version {
            return Err(CheckpointValidationError::ArchiveVersionMismatch);
        }
        archive.validate()?;
        Ok(archive)
    }

    #[must_use]
    pub fn is_current_archive_version(&self) -> bool {
        self.archive_version == WORKSPACE_ARCHIVE_VERSION
    }
}

#[cfg(test)]
mod tests {
    use super::{CheckpointValidationError, WORKSPACE_CHECKPOINT_VERSION, WorkspaceCheckpoint};
    use crate::{
        ContentManifestKind, ContentValidationError, WORKSPACE_ARCHIVE_VERSION,
        WORKSPACE_PROTOCOL_VERSION, WorkspaceArchive, WorkspaceSettings,
    };

    fn archive() -> WorkspaceArchive {
        WorkspaceArchive {
            archive_version: WORKSPACE_ARCHIVE_VERSION,
            protocol_version: WORKSPACE_PROTOCOL_VERSION,
            exported_at: 10,
            active_note_id: None,
            nodes: Vec::new(),
            documents: Vec::new(),
            settings: WorkspaceSettings::default(),
            tags: Vec::new(),
            people: Vec::new(),
            properties: Vec::new(),
            property_templates: Vec::new(),
            tasks: Vec::new(),
            prompts: Vec::new(),
        }
    }

    #[test]
    fn builds_and_verifies_a_checkpoint_round_trip() {
        let (checkpoint, bytes) =
            WorkspaceCheckpoint::build("workspace-1", 42, 99, &archive()).expect("build");

        assert_eq!(checkpoint.checkpoint_version, WORKSPACE_CHECKPOINT_VERSION);
        assert_eq!(checkpoint.server_sequence, 42);
        assert_eq!(checkpoint.content.kind, ContentManifestKind::Checkpoint);
        assert!(checkpoint.is_current_archive_version());
        assert_eq!(
            checkpoint.verify_content(&bytes).expect("verify"),
            archive()
        );
    }

    #[test]
    fn rejects_content_that_does_not_match_the_manifest() {
        let (checkpoint, bytes) =
            WorkspaceCheckpoint::build("workspace-1", 1, 1, &archive()).expect("build");
        let mut tampered = bytes.clone();
        let last = tampered.len() - 1;
        tampered[last] = b' ';

        assert_eq!(
            checkpoint.verify_content(&tampered),
            Err(CheckpointValidationError::Content(
                ContentValidationError::DigestMismatch {
                    field: "chunk digest"
                }
            ))
        );
    }

    #[test]
    fn rejects_metadata_that_disagrees_with_the_archive() {
        let (mut checkpoint, bytes) =
            WorkspaceCheckpoint::build("workspace-1", 1, 1, &archive()).expect("build");
        checkpoint.archive_version = 1;

        assert_eq!(
            checkpoint.verify_content(&bytes),
            Err(CheckpointValidationError::ArchiveVersionMismatch)
        );
    }

    #[test]
    fn rejects_unsupported_versions_and_manifest_kinds() {
        let (mut checkpoint, _) =
            WorkspaceCheckpoint::build("workspace-1", 1, 1, &archive()).expect("build");

        checkpoint.checkpoint_version = 2;
        assert_eq!(
            checkpoint.validate(),
            Err(CheckpointValidationError::UnsupportedCheckpointVersion(2))
        );
        checkpoint.checkpoint_version = WORKSPACE_CHECKPOINT_VERSION;

        checkpoint.archive_version = 99;
        assert_eq!(
            checkpoint.validate(),
            Err(CheckpointValidationError::UnsupportedArchiveVersion(99))
        );
        checkpoint.archive_version = WORKSPACE_ARCHIVE_VERSION;

        checkpoint.content.kind = ContentManifestKind::Asset;
        assert_eq!(
            checkpoint.validate(),
            Err(CheckpointValidationError::UnexpectedManifestKind)
        );
    }
}
