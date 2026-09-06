use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use git2::{Commit, ObjectType, Oid, Repository, RepositoryOpenFlags, Signature, Time};
use skriuw_domain::{HistoryHeader, count_words};
use skriuw_history::{
    HistoryMaterializer, HistoryReadError, HistoryReader, HistoryVersion, MaterializationError,
};
use skriuw_storage::{Diagnostic, DiagnosticCategory, DiagnosticContext};
use skriuw_storage::{HistoryMaterialization, HistoryProvenance, PendingHistoryRevision};
use thiserror::Error;

const HISTORY_REF: &str = "refs/heads/history";

#[derive(Debug, Error)]
pub enum GitHistoryError {
    #[error("history repository I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("history repository failed: {0}")]
    Git(#[from] git2::Error),
    #[error("history materializer lock is poisoned")]
    Poisoned,
    #[error("invalid history {0}")]
    InvalidIdentifier(&'static str),
    #[error("history timestamp cannot be negative")]
    InvalidTimestamp,
    #[error("history revision must be positive")]
    InvalidRevision,
    #[error("history repository has no worktree")]
    MissingWorktree,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HistoryMetadataField {
    CommitMessage,
    Outbox,
    Note,
    Revision,
    CreatedAt,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HistoryIntegrityIssue {
    InvalidHistoryReference,
    MergeCommit,
    BrokenAncestry,
    InvalidMetadata(HistoryMetadataField),
    DuplicateOutbox,
    DuplicateNoteRevision,
    MissingNoteContent,
    NonBlobNoteContent,
    InvalidMarkdownUtf8,
    UnreadableDiff,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryIntegrityReport {
    pub commit_count: usize,
    pub note_count: usize,
    pub issues: Vec<HistoryIntegrityIssue>,
}

impl HistoryIntegrityReport {
    #[must_use]
    pub fn healthy(&self) -> bool {
        self.issues.is_empty()
    }

    #[must_use]
    pub fn diagnostic(&self) -> Diagnostic {
        Diagnostic::new(
            DiagnosticContext::Integrity,
            DiagnosticCategory::Backend,
            format!(
                "Git history integrity check found {} issue(s)",
                self.issues.len()
            ),
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum GitHistoryIntegrityError {
    #[error("history repository was not found")]
    MissingRepository,
    #[error("history repository is not a repository")]
    NotRepository,
    #[error("history repository could not be read")]
    UnreadableRepository,
    #[error("history repository is bare")]
    BareRepository,
    #[error("history repository has no worktree")]
    MissingWorktree,
}

impl GitHistoryIntegrityError {
    #[must_use]
    pub fn diagnostic(self) -> Diagnostic {
        let (category, message) = match self {
            Self::MissingRepository => (
                DiagnosticCategory::NotFound,
                "history repository was not found",
            ),
            Self::NotRepository => (
                DiagnosticCategory::InvalidInput,
                "history repository is not a valid repository",
            ),
            Self::UnreadableRepository => (
                DiagnosticCategory::Backend,
                "history repository could not be read",
            ),
            Self::BareRepository => (
                DiagnosticCategory::InvalidInput,
                "history repository must not be bare",
            ),
            Self::MissingWorktree => (
                DiagnosticCategory::InvalidInput,
                "history repository must have a worktree",
            ),
        };
        Diagnostic::new(DiagnosticContext::Integrity, category, message)
    }
}

#[derive(Debug)]
pub struct GitHistoryReader {
    root: PathBuf,
}

impl GitHistoryReader {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, GitHistoryIntegrityError> {
        let root = root.as_ref().to_path_buf();
        open_read_only(&root)?;
        Ok(Self { root })
    }

    pub fn integrity_check(&self) -> Result<HistoryIntegrityReport, GitHistoryIntegrityError> {
        Ok(inspect_history(&self.root)?.report)
    }

    fn validated_headers(&self) -> Result<Vec<HistoryHeader>, HistoryReadError> {
        let inspection = inspect_history(&self.root).map_err(integrity_read_error)?;
        if inspection.report.healthy() {
            Ok(inspection.headers)
        } else {
            Err(HistoryReadError::backend(format!(
                "history integrity check found {} issue(s)",
                inspection.report.issues.len()
            )))
        }
    }
}

pub struct GitHistoryMaterializer {
    root: PathBuf,
    gate: Mutex<()>,
}

impl GitHistoryMaterializer {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, GitHistoryError> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(&root)?;
        let repository = match Repository::open(&root) {
            Ok(repository) => repository,
            Err(error) if error.code() == git2::ErrorCode::NotFound => Repository::init(&root)?,
            Err(error) => return Err(error.into()),
        };
        if repository.is_bare() || repository.workdir().is_none() {
            return Err(GitHistoryError::MissingWorktree);
        }
        Ok(Self {
            root,
            gate: Mutex::new(()),
        })
    }

    pub fn materialize_revision(
        &self,
        item: &PendingHistoryRevision,
    ) -> Result<HistoryMaterialization, GitHistoryError> {
        validate_item(item)?;
        let _guard = self.gate.lock().map_err(|_| GitHistoryError::Poisoned)?;
        let repository = Repository::open(&self.root)?;
        if let Some(materialization) = existing_materialization(&repository, &item.id)? {
            return Ok(materialization);
        }

        let relative_path = PathBuf::from("notes").join(format!("{}.md", item.note_id));
        let absolute_path = self.root.join(&relative_path);
        let parent = absolute_path
            .parent()
            .ok_or(GitHistoryError::MissingWorktree)?;
        fs::create_dir_all(parent)?;
        fs::write(&absolute_path, item.markdown.as_bytes())?;

        let mut index = repository.index()?;
        index.add_path(&relative_path)?;
        index.write()?;
        let tree_id = index.write_tree()?;
        let tree = repository.find_tree(tree_id)?;
        let parent = history_commit(&repository)?;
        let parents = parent.iter().collect::<Vec<_>>();
        let signature = signature(item.created_at)?;
        let summary = summary(item);
        let word_count = count_words(&item.markdown);
        let message = format!(
            "{summary}\n\nSkriuw-Outbox: {}\nSkriuw-Note: {}\nSkriuw-Revision: {}\nSkriuw-Created-At: {}\nSkriuw-Word-Count: {word_count}\nSkriuw-Provenance: {}",
            item.id,
            item.note_id,
            item.revision,
            item.created_at,
            item.provenance.as_str()
        );
        let commit_id = repository.commit(
            Some(HISTORY_REF),
            &signature,
            &signature,
            &message,
            &tree,
            &parents,
        )?;
        repository.set_head(HISTORY_REF)?;
        let commit = repository.find_commit(commit_id)?;
        let (additions, deletions) = revision_diff_stats(&repository, &commit)?;

        Ok(HistoryMaterialization {
            version_id: commit_id.to_string(),
            summary,
            additions,
            deletions,
            word_count: Some(word_count),
        })
    }

    pub fn list_history_headers(&self) -> Result<Vec<HistoryHeader>, HistoryReadError> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| HistoryReadError::backend("history materializer lock is poisoned"))?;
        GitHistoryReader {
            root: self.root.clone(),
        }
        .validated_headers()
    }

    pub fn read_history_version(
        &self,
        note_id: &str,
        version_id: &str,
    ) -> Result<HistoryVersion, HistoryReadError> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| HistoryReadError::backend("history materializer lock is poisoned"))?;
        read_history_version(&self.root, note_id, version_id)
    }
}

impl HistoryMaterializer for GitHistoryMaterializer {
    fn materialize(
        &self,
        item: &PendingHistoryRevision,
    ) -> Result<HistoryMaterialization, MaterializationError> {
        self.materialize_revision(item)
            .map_err(|error| MaterializationError::new(error.to_string()))
    }
}

impl HistoryReader for GitHistoryMaterializer {
    fn list_headers(&self) -> Result<Vec<HistoryHeader>, HistoryReadError> {
        self.list_history_headers()
    }

    fn read_version(
        &self,
        note_id: &str,
        version_id: &str,
    ) -> Result<HistoryVersion, HistoryReadError> {
        self.read_history_version(note_id, version_id)
    }
}

impl HistoryReader for GitHistoryReader {
    fn list_headers(&self) -> Result<Vec<HistoryHeader>, HistoryReadError> {
        self.validated_headers()
    }

    fn read_version(
        &self,
        note_id: &str,
        version_id: &str,
    ) -> Result<HistoryVersion, HistoryReadError> {
        read_history_version(&self.root, note_id, version_id)
    }
}

struct HistoryInspection {
    report: HistoryIntegrityReport,
    headers: Vec<HistoryHeader>,
}

struct CommitMetadata {
    header: HistoryHeader,
    revision: i64,
}

fn commit_metadata(
    repository: &Repository,
    commit: &Commit<'_>,
) -> Result<CommitMetadata, HistoryReadError> {
    let message = commit
        .message()
        .map_err(|_| HistoryReadError::backend("history commit message is not UTF-8"))?;
    let note_id = trailer(message, "Skriuw-Note")
        .filter(|value| valid_identifier(value))
        .ok_or_else(|| HistoryReadError::backend("history commit has invalid note metadata"))?;
    trailer(message, "Skriuw-Outbox")
        .filter(|value| valid_identifier(value))
        .ok_or_else(|| HistoryReadError::backend("history commit has invalid outbox metadata"))?;
    let revision = trailer(message, "Skriuw-Revision")
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|revision| *revision > 0)
        .ok_or_else(|| HistoryReadError::backend("history commit has invalid revision metadata"))?;
    let created_at = trailer(message, "Skriuw-Created-At")
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|created_at| *created_at >= 0)
        .ok_or_else(|| {
            HistoryReadError::backend("history commit has invalid timestamp metadata")
        })?;
    let summary = commit
        .summary()
        .ok()
        .flatten()
        .unwrap_or("Saved note")
        .to_owned();
    let word_count = trailer(message, "Skriuw-Word-Count")
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|count| *count >= 0);
    let (additions, deletions) = revision_diff_stats(repository, commit).map_err(read_backend)?;
    Ok(CommitMetadata {
        header: HistoryHeader {
            note_id: note_id.into(),
            version_id: commit.id().to_string(),
            created_at,
            summary,
            additions: Some(additions),
            deletions: Some(deletions),
            word_count,
        },
        revision,
    })
}

fn revision_diff_stats(
    repository: &Repository,
    commit: &Commit<'_>,
) -> Result<(i64, i64), git2::Error> {
    let tree = commit.tree()?;
    let parent_tree = if commit.parent_count() == 0 {
        None
    } else {
        Some(commit.parent(0)?.tree()?)
    };
    let diff = repository.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)?;
    let stats = diff.stats()?;
    Ok((stats.insertions() as i64, stats.deletions() as i64))
}

fn trailer<'a>(message: &'a str, key: &str) -> Option<&'a str> {
    let prefix = format!("{key}: ");
    let mut values = message
        .lines()
        .filter_map(|line| line.strip_prefix(&prefix));
    let value = values.next()?;
    values.next().is_none().then_some(value)
}

fn open_read_only(root: &Path) -> Result<Repository, GitHistoryIntegrityError> {
    match fs::metadata(root) {
        Ok(metadata) if metadata.is_dir() => {}
        Ok(_) => return Err(GitHistoryIntegrityError::NotRepository),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(GitHistoryIntegrityError::MissingRepository);
        }
        Err(_) => return Err(GitHistoryIntegrityError::UnreadableRepository),
    }
    let repository = Repository::open_ext(
        root,
        RepositoryOpenFlags::NO_SEARCH,
        std::iter::empty::<&Path>(),
    )
    .map_err(|error| match error.code() {
        git2::ErrorCode::NotFound | git2::ErrorCode::Invalid => {
            GitHistoryIntegrityError::NotRepository
        }
        _ => GitHistoryIntegrityError::UnreadableRepository,
    })?;
    if repository.is_bare() {
        return Err(GitHistoryIntegrityError::BareRepository);
    }
    if repository.workdir().is_none() {
        return Err(GitHistoryIntegrityError::MissingWorktree);
    }
    Ok(repository)
}

fn inspect_history(root: &Path) -> Result<HistoryInspection, GitHistoryIntegrityError> {
    let repository = open_read_only(root)?;
    let reference = match repository.find_reference(HISTORY_REF) {
        Ok(reference) => reference,
        Err(error) if error.code() == git2::ErrorCode::NotFound => {
            return Ok(HistoryInspection {
                report: HistoryIntegrityReport {
                    commit_count: 0,
                    note_count: 0,
                    issues: Vec::new(),
                },
                headers: Vec::new(),
            });
        }
        Err(_) => return Err(GitHistoryIntegrityError::UnreadableRepository),
    };
    let mut issues = Vec::new();
    let tip = match reference.peel_to_commit() {
        Ok(commit) => Some(commit),
        Err(_) => {
            issues.push(HistoryIntegrityIssue::InvalidHistoryReference);
            None
        }
    };
    let mut commit_count = 0;
    let mut notes = HashSet::new();
    let mut outboxes = HashSet::new();
    let mut note_revisions = HashSet::new();
    let mut visited = HashSet::new();
    let mut headers = Vec::new();
    let mut pending = tip.into_iter().collect::<Vec<_>>();

    while let Some(commit) = pending.pop() {
        if !visited.insert(commit.id()) {
            continue;
        }
        commit_count += 1;
        if commit.parent_count() > 1 {
            issues.push(HistoryIntegrityIssue::MergeCommit);
        }

        let metadata = inspect_commit_metadata(&repository, &commit, &mut issues);
        if let Some(metadata) = metadata {
            if !outboxes.insert(metadata.outbox) {
                issues.push(HistoryIntegrityIssue::DuplicateOutbox);
            }
            if !note_revisions.insert((metadata.header.note_id.clone(), metadata.revision)) {
                issues.push(HistoryIntegrityIssue::DuplicateNoteRevision);
            }
            notes.insert(metadata.header.note_id.clone());
            inspect_note_content(&repository, &commit, &metadata.header.note_id, &mut issues);
            headers.push(metadata.header);
        }

        for parent_index in (0..commit.parent_count()).rev() {
            match commit.parent(parent_index) {
                Ok(parent) => pending.push(parent),
                Err(_) => {
                    issues.push(HistoryIntegrityIssue::BrokenAncestry);
                }
            }
        }
    }

    Ok(HistoryInspection {
        report: HistoryIntegrityReport {
            commit_count,
            note_count: notes.len(),
            issues,
        },
        headers,
    })
}

struct IntegrityCommitMetadata {
    header: HistoryHeader,
    outbox: String,
    revision: i64,
}

fn inspect_commit_metadata(
    repository: &Repository,
    commit: &Commit<'_>,
    issues: &mut Vec<HistoryIntegrityIssue>,
) -> Option<IntegrityCommitMetadata> {
    let Ok(message) = commit.message() else {
        issues.push(HistoryIntegrityIssue::InvalidMetadata(
            HistoryMetadataField::CommitMessage,
        ));
        return None;
    };
    let outbox = inspect_identifier_trailer(
        message,
        "Skriuw-Outbox",
        HistoryMetadataField::Outbox,
        issues,
    );
    let note_id =
        inspect_identifier_trailer(message, "Skriuw-Note", HistoryMetadataField::Note, issues);
    let revision = inspect_number_trailer(
        message,
        "Skriuw-Revision",
        HistoryMetadataField::Revision,
        |value| value > 0,
        issues,
    );
    let created_at = inspect_number_trailer(
        message,
        "Skriuw-Created-At",
        HistoryMetadataField::CreatedAt,
        |value| value >= 0,
        issues,
    );
    let (Some(outbox), Some(note_id), Some(revision), Some(created_at)) =
        (outbox, note_id, revision, created_at)
    else {
        return None;
    };
    let summary = commit
        .summary()
        .ok()
        .flatten()
        .unwrap_or("Saved note")
        .to_owned();
    let (additions, deletions) = match revision_diff_stats(repository, commit) {
        Ok(stats) => stats,
        Err(_) => {
            issues.push(HistoryIntegrityIssue::UnreadableDiff);
            return None;
        }
    };
    Some(IntegrityCommitMetadata {
        header: HistoryHeader {
            note_id,
            version_id: commit.id().to_string(),
            created_at,
            summary,
            additions: Some(additions),
            deletions: Some(deletions),
            word_count: trailer(message, "Skriuw-Word-Count")
                .and_then(|value| value.parse::<i64>().ok())
                .filter(|count| *count >= 0),
        },
        outbox,
        revision,
    })
}

fn inspect_identifier_trailer(
    message: &str,
    key: &str,
    field: HistoryMetadataField,
    issues: &mut Vec<HistoryIntegrityIssue>,
) -> Option<String> {
    let value = trailer(message, key).filter(|value| valid_identifier(value));
    if value.is_none() {
        issues.push(HistoryIntegrityIssue::InvalidMetadata(field));
    }
    value.map(str::to_owned)
}

fn inspect_number_trailer(
    message: &str,
    key: &str,
    field: HistoryMetadataField,
    valid: impl FnOnce(i64) -> bool,
    issues: &mut Vec<HistoryIntegrityIssue>,
) -> Option<i64> {
    let value = trailer(message, key)
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|value| valid(*value));
    if value.is_none() {
        issues.push(HistoryIntegrityIssue::InvalidMetadata(field));
    }
    value
}

fn inspect_note_content(
    repository: &Repository,
    commit: &Commit<'_>,
    note_id: &str,
    issues: &mut Vec<HistoryIntegrityIssue>,
) {
    let path = PathBuf::from("notes").join(format!("{note_id}.md"));
    let Ok(tree) = commit.tree() else {
        issues.push(HistoryIntegrityIssue::MissingNoteContent);
        return;
    };
    let Ok(entry) = tree.get_path(&path) else {
        issues.push(HistoryIntegrityIssue::MissingNoteContent);
        return;
    };
    if entry.kind() != Some(ObjectType::Blob) {
        issues.push(HistoryIntegrityIssue::NonBlobNoteContent);
        return;
    }
    let Ok(blob) = repository.find_blob(entry.id()) else {
        issues.push(HistoryIntegrityIssue::MissingNoteContent);
        return;
    };
    if std::str::from_utf8(blob.content()).is_err() {
        issues.push(HistoryIntegrityIssue::InvalidMarkdownUtf8);
    }
}

fn integrity_read_error(error: GitHistoryIntegrityError) -> HistoryReadError {
    HistoryReadError::backend(error.to_string())
}

fn read_history_version(
    root: &Path,
    note_id: &str,
    version_id: &str,
) -> Result<HistoryVersion, HistoryReadError> {
    if !valid_identifier(note_id) {
        return Err(HistoryReadError::NotFound(version_id.into()));
    }
    let commit_id =
        Oid::from_str(version_id).map_err(|_| HistoryReadError::NotFound(version_id.into()))?;
    let repository = Repository::open(root).map_err(read_backend)?;
    let commit = repository.find_commit(commit_id).map_err(|error| {
        if error.code() == git2::ErrorCode::NotFound {
            HistoryReadError::NotFound(version_id.into())
        } else {
            read_backend(error)
        }
    })?;
    let metadata = commit_metadata(&repository, &commit)?;
    if metadata.header.note_id != note_id {
        return Err(HistoryReadError::NotFound(version_id.into()));
    }
    let path = PathBuf::from("notes").join(format!("{note_id}.md"));
    let tree = commit.tree().map_err(read_backend)?;
    let entry = tree
        .get_path(&path)
        .map_err(|_| HistoryReadError::NotFound(version_id.into()))?;
    let object = entry.to_object(&repository).map_err(read_backend)?;
    let blob = object
        .peel_to_blob()
        .map_err(|_| HistoryReadError::NotFound(version_id.into()))?;
    let markdown = std::str::from_utf8(blob.content())
        .map_err(|error| HistoryReadError::backend(error.to_string()))?
        .to_owned();
    Ok(HistoryVersion {
        header: metadata.header,
        revision: metadata.revision,
        markdown,
    })
}

fn read_backend(error: impl std::fmt::Display) -> HistoryReadError {
    HistoryReadError::backend(error.to_string())
}

fn validate_item(item: &PendingHistoryRevision) -> Result<(), GitHistoryError> {
    if !valid_identifier(&item.id) {
        return Err(GitHistoryError::InvalidIdentifier("item id"));
    }
    if !valid_identifier(&item.note_id) {
        return Err(GitHistoryError::InvalidIdentifier("note id"));
    }
    if item.created_at < 0 {
        return Err(GitHistoryError::InvalidTimestamp);
    }
    if item.revision < 1 {
        return Err(GitHistoryError::InvalidRevision);
    }
    Ok(())
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn existing_materialization(
    repository: &Repository,
    item_id: &str,
) -> Result<Option<HistoryMaterialization>, GitHistoryError> {
    let Some(commit) = history_commit(repository)? else {
        return Ok(None);
    };
    let message = commit.message().unwrap_or_default();
    let expected_trailer = format!("Skriuw-Outbox: {item_id}");
    let matches_item = message.lines().any(|line| line == expected_trailer);
    if !matches_item {
        return Ok(None);
    }
    let (additions, deletions) = revision_diff_stats(repository, &commit)?;
    Ok(Some(HistoryMaterialization {
        version_id: commit.id().to_string(),
        summary: commit
            .summary()
            .ok()
            .flatten()
            .unwrap_or("Saved note")
            .into(),
        additions,
        deletions,
        word_count: trailer(message, "Skriuw-Word-Count")
            .and_then(|value| value.parse::<i64>().ok())
            .filter(|count| *count >= 0),
    }))
}

fn history_commit(repository: &Repository) -> Result<Option<Commit<'_>>, GitHistoryError> {
    match repository.find_reference(HISTORY_REF) {
        Ok(reference) => Ok(Some(reference.peel_to_commit()?)),
        Err(error) if error.code() == git2::ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn signature(created_at: i64) -> Result<Signature<'static>, GitHistoryError> {
    let seconds = created_at
        .checked_div(1_000)
        .ok_or(GitHistoryError::InvalidTimestamp)?;
    Ok(Signature::new(
        "Skriuw",
        "history@skriuw.local",
        &Time::new(seconds, 0),
    )?)
}

fn summary(item: &PendingHistoryRevision) -> String {
    match item.provenance {
        HistoryProvenance::Superseded => "Version from another device (superseded)".into(),
        HistoryProvenance::Local | HistoryProvenance::Remote if item.revision == 1 => {
            "Created note".into()
        }
        HistoryProvenance::Local | HistoryProvenance::Remote => {
            format!("Saved revision {}", item.revision)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, sync::Arc};

    use git2::{Oid, Repository, Signature, Time};
    use serde_json::json;
    use skriuw_domain::{NodePlacement, WorkspaceOperation, WorkspaceOperationEnvelope};
    use skriuw_history::rebuild_history_cache;
    use skriuw_history::{HistoryReader, HistoryWorkResult, HistoryWorker};
    use skriuw_sqlite::{HISTORY_COALESCE_WINDOW_MS, SqliteWorkspace};
    use skriuw_storage::{
        HistoryCache, HistoryProvenance, PendingHistoryRevision, WorkspaceStorage,
    };
    use tempfile::tempdir;

    use super::{
        GitHistoryError, GitHistoryIntegrityError, GitHistoryMaterializer, GitHistoryReader,
        HISTORY_REF, HistoryIntegrityIssue, HistoryMetadataField,
    };

    #[test]
    fn creates_repository_commit_and_stable_note_path() {
        let directory = tempdir().expect("temporary directory");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");
        let result = materializer
            .materialize_revision(&item("item-1", 1, "# First"))
            .expect("materialize history");

        let repository = Repository::open(directory.path()).expect("open repository");
        let commit = repository
            .find_reference(HISTORY_REF)
            .expect("history reference")
            .peel_to_commit()
            .expect("history commit");

        assert_eq!(commit.id().to_string(), result.version_id);
        assert_eq!(result.summary, "Created note");
        assert_eq!((result.additions, result.deletions), (1, 0));
        assert_eq!(
            std::fs::read_to_string(directory.path().join("notes/note-1.md"))
                .expect("note projection"),
            "# First"
        );
        assert!(commit.message().expect("commit message").contains("item-1"));
    }

    #[test]
    fn retry_returns_existing_commit() {
        let directory = tempdir().expect("temporary directory");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");
        let item = item("item-1", 1, "# First");

        let first = materializer
            .materialize_revision(&item)
            .expect("first materialization");
        let retry = materializer
            .materialize_revision(&item)
            .expect("retry materialization");
        let repository = Repository::open(directory.path()).expect("open repository");
        let count = repository
            .revwalk()
            .and_then(|mut walk| {
                walk.push_ref(HISTORY_REF)?;
                Ok(walk.count())
            })
            .expect("commit count");

        assert_eq!(retry.version_id, first.version_id);
        assert_eq!(count, 1);
    }

    #[test]
    fn appends_revisions_in_order() {
        let directory = tempdir().expect("temporary directory");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");
        let first = materializer
            .materialize_revision(&item("item-1", 1, "# First"))
            .expect("first materialization");
        let second = materializer
            .materialize_revision(&item("item-2", 2, "# Second"))
            .expect("second materialization");
        let repository = Repository::open(directory.path()).expect("open repository");
        let commit = repository
            .find_commit(second.version_id.parse().expect("commit id"))
            .expect("second commit");

        assert_eq!(commit.parent_count(), 1);
        assert_eq!(
            commit.parent_id(0).expect("parent id").to_string(),
            first.version_id
        );
        assert_eq!(second.summary, "Saved revision 2");
        assert_eq!((second.additions, second.deletions), (1, 1));
    }

    #[test]
    fn records_the_word_count_of_each_revision() {
        let directory = tempdir().expect("temporary directory");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");

        let first = materializer
            .materialize_revision(&item("item-1", 1, "# Notes\n\nOne two three"))
            .expect("first materialization");
        let second = materializer
            .materialize_revision(&item("item-2", 2, "# Notes\n\nOne two"))
            .expect("second materialization");

        assert_eq!(first.word_count, Some(4));
        assert_eq!(second.word_count, Some(3));

        let headers = GitHistoryReader::open(directory.path())
            .expect("open reader")
            .list_headers()
            .expect("list headers");
        assert_eq!(
            headers
                .iter()
                .map(|header| header.word_count)
                .collect::<Vec<_>>(),
            vec![Some(3), Some(4)],
        );
    }

    #[test]
    fn reads_no_word_count_from_commits_written_before_it_was_recorded() {
        let directory = tempdir().expect("temporary directory");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");
        materializer
            .materialize_revision(&item("item-1", 1, "# First"))
            .expect("materialize history");

        let repository = Repository::open(directory.path()).expect("open repository");
        let commit = repository
            .find_reference(HISTORY_REF)
            .expect("history reference")
            .peel_to_commit()
            .expect("history commit");
        let legacy = commit
            .message()
            .expect("commit message")
            .lines()
            .filter(|line| !line.starts_with("Skriuw-Word-Count:"))
            .collect::<Vec<_>>()
            .join("\n");
        commit
            .amend(Some(HISTORY_REF), None, None, None, Some(&legacy), None)
            .expect("amend commit");

        let headers = GitHistoryReader::open(directory.path())
            .expect("open reader")
            .list_headers()
            .expect("list headers");
        assert_eq!(headers.len(), 1);
        assert_eq!(headers[0].word_count, None);
    }

    #[test]
    fn rejects_unsafe_note_identifier() {
        let directory = tempdir().expect("temporary directory");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");
        let mut item = item("item-1", 1, "# First");
        item.note_id = "../escape".into();

        let error = materializer
            .materialize_revision(&item)
            .expect_err("unsafe identifier");

        assert!(matches!(
            error,
            GitHistoryError::InvalidIdentifier("note id")
        ));
    }

    #[test]
    fn processes_sqlite_outbox_into_git_and_history_cache() {
        let directory = tempdir().expect("temporary directory");
        let storage = Arc::new(SqliteWorkspace::open_in_memory().expect("open database"));
        storage
            .apply_operations(&[WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::CreateNote {
                    id: "note-1".into(),
                    title: "History".into(),
                    placement: NodePlacement::last(None),
                    document_json: json!({"type": "doc", "content": []}),
                    markdown: "# History".into(),
                    at: 1_000,
                },
            )])
            .expect("create note");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");
        let worker = HistoryWorker::new("worker-1", Arc::clone(&storage), materializer)
            .expect("create worker");

        let result = worker
            .process_next(HISTORY_COALESCE_WINDOW_MS + 2_000, 30_000)
            .expect("process history");
        let snapshot = storage.bootstrap().expect("bootstrap");

        assert!(matches!(result, HistoryWorkResult::Materialized { .. }));
        assert_eq!(snapshot.history_headers.len(), 1);
        assert_eq!(snapshot.history_headers[0].summary, "Created note");
        assert_eq!(snapshot.history_headers[0].additions, Some(1));
        assert_eq!(snapshot.history_headers[0].deletions, Some(0));
        assert_eq!(snapshot.history_headers[0].additions, Some(1));
        assert_eq!(snapshot.history_headers[0].deletions, Some(0));
        assert_eq!(
            std::fs::read_to_string(directory.path().join("notes/note-1.md"))
                .expect("note projection"),
            "# History"
        );
    }

    #[test]
    fn lists_headers_and_reads_historical_markdown() {
        let directory = tempdir().expect("temporary directory");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");
        let first = materializer
            .materialize_revision(&PendingHistoryRevision {
                created_at: 1_234,
                ..item("item-1", 1, "# First")
            })
            .expect("first materialization");
        materializer
            .materialize_revision(&PendingHistoryRevision {
                created_at: 2_345,
                ..item("item-2", 2, "# Second")
            })
            .expect("second materialization");

        let headers = materializer.list_history_headers().expect("list history");
        let version = materializer
            .read_history_version("note-1", &first.version_id)
            .expect("read first version");

        assert_eq!(headers.len(), 2);
        assert_eq!(headers[0].created_at, 2_345);
        assert_eq!(headers[1].created_at, 1_234);
        assert_eq!(
            (headers[0].additions, headers[0].deletions),
            (Some(1), Some(1))
        );
        assert_eq!(
            (headers[0].additions, headers[0].deletions),
            (Some(1), Some(1))
        );
        assert_eq!(
            (headers[1].additions, headers[1].deletions),
            (Some(1), Some(0))
        );
        assert_eq!(version.revision, 1);
        assert_eq!(version.markdown, "# First");
    }

    #[test]
    fn rebuilds_sqlite_history_cache_from_git() {
        let directory = tempdir().expect("temporary directory");
        let storage = Arc::new(SqliteWorkspace::open_in_memory().expect("open database"));
        storage
            .apply_operations(&[WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::CreateNote {
                    id: "note-1".into(),
                    title: "History".into(),
                    placement: NodePlacement::last(None),
                    document_json: json!({"type": "doc", "content": []}),
                    markdown: "# History".into(),
                    at: 1_000,
                },
            )])
            .expect("create note");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");
        let worker = HistoryWorker::new("worker-1", Arc::clone(&storage), materializer)
            .expect("create worker");
        worker
            .process_next(HISTORY_COALESCE_WINDOW_MS + 2_000, 30_000)
            .expect("process history");
        storage
            .replace_history_headers(&[])
            .expect("clear history cache");
        assert!(
            storage
                .bootstrap()
                .expect("empty bootstrap")
                .history_headers
                .is_empty()
        );
        let reader = GitHistoryMaterializer::open(directory.path()).expect("open history reader");

        let rebuilt = rebuild_history_cache(&reader, storage.as_ref()).expect("rebuild cache");
        let snapshot = storage.bootstrap().expect("rebuilt bootstrap");

        assert_eq!(rebuilt, 1);
        assert_eq!(snapshot.history_headers.len(), 1);
        assert_eq!(snapshot.history_headers[0].summary, "Created note");
    }

    #[test]
    fn verifies_healthy_empty_and_multi_note_repositories() {
        let empty_directory = tempdir().expect("temporary directory");
        Repository::init(empty_directory.path()).expect("initialize empty repository");
        let empty_reader = GitHistoryReader::open(empty_directory.path()).expect("open reader");
        let empty_report = empty_reader.integrity_check().expect("check empty history");

        assert!(empty_report.healthy());
        assert_eq!(empty_report.commit_count, 0);
        assert_eq!(empty_report.note_count, 0);

        let directory = tempdir().expect("temporary directory");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");
        materializer
            .materialize_revision(&item("item-1", 1, "# First"))
            .expect("first note");
        materializer
            .materialize_revision(&PendingHistoryRevision {
                id: "item-2".into(),
                note_id: "note-2".into(),
                revision: 1,
                markdown: "# Second".into(),
                created_at: 2_000,
                attempts: 1,
                provenance: HistoryProvenance::Local,
            })
            .expect("second note");
        let report = GitHistoryReader::open(directory.path())
            .expect("open reader")
            .integrity_check()
            .expect("check history");

        assert!(report.healthy());
        assert_eq!(report.commit_count, 2);
        assert_eq!(report.note_count, 2);
    }

    #[test]
    fn rejects_missing_non_repository_and_bare_paths_without_creation() {
        let directory = tempdir().expect("temporary directory");
        let missing = directory.path().join("missing-history");
        let error = GitHistoryReader::open(&missing).expect_err("missing repository");
        assert_eq!(error, GitHistoryIntegrityError::MissingRepository);
        assert!(!missing.exists());

        let non_repository = directory.path().join("not-a-repository");
        fs::create_dir(&non_repository).expect("create ordinary directory");
        fs::write(non_repository.join("sentinel"), b"unchanged").expect("write sentinel");
        let error = GitHistoryReader::open(&non_repository).expect_err("non repository");
        assert_eq!(error, GitHistoryIntegrityError::NotRepository);
        assert_eq!(
            fs::read(non_repository.join("sentinel")).expect("read sentinel"),
            b"unchanged"
        );
        assert!(!non_repository.join(".git").exists());

        let bare = directory.path().join("bare.git");
        Repository::init_bare(&bare).expect("initialize bare repository");
        let before = directory_entries(&bare);
        let error = GitHistoryReader::open(&bare).expect_err("bare repository");
        assert_eq!(error, GitHistoryIntegrityError::BareRepository);
        assert_eq!(directory_entries(&bare), before);
    }

    #[test]
    fn rejects_merge_history() {
        let directory = tempdir().expect("temporary directory");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");
        let first = materializer
            .materialize_revision(&item("item-1", 1, "# First"))
            .expect("first commit");
        let second = materializer
            .materialize_revision(&item("item-2", 2, "# Second"))
            .expect("second commit");
        let repository = Repository::open(directory.path()).expect("open repository");
        let side = raw_commit(
            &repository,
            valid_message("item-side", "note-2", 1, 2_500),
            RawContent::Blob("note-2", b"# Side"),
            &[oid(&first.version_id)],
            None,
        );
        raw_commit(
            &repository,
            valid_message("item-merge", "note-3", 1, 3_000),
            RawContent::Blob("note-3", b"# Merge"),
            &[oid(&second.version_id), side],
            Some(HISTORY_REF),
        );

        let report = GitHistoryReader::open(directory.path())
            .expect("open reader")
            .integrity_check()
            .expect("check history");

        assert!(report.issues.contains(&HistoryIntegrityIssue::MergeCommit));
    }

    #[test]
    fn rejects_invalid_metadata_and_duplicate_identities() {
        let directory = tempdir().expect("temporary directory");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");
        let first = materializer
            .materialize_revision(&item("item-1", 1, "# First"))
            .expect("first commit");
        let repository = Repository::open(directory.path()).expect("open repository");
        let duplicate = raw_commit(
            &repository,
            valid_message("item-1", "note-1", 1, 2_000),
            RawContent::Blob("note-1", b"# Duplicate"),
            &[oid(&first.version_id)],
            Some(HISTORY_REF),
        );
        raw_commit(
            &repository,
            "Saved note\n\nSkriuw-Outbox: invalid/path".into(),
            RawContent::Blob("note-1", b"# Invalid"),
            &[duplicate],
            Some(HISTORY_REF),
        );

        let report = GitHistoryReader::open(directory.path())
            .expect("open reader")
            .integrity_check()
            .expect("check history");

        assert!(
            report
                .issues
                .contains(&HistoryIntegrityIssue::DuplicateOutbox)
        );
        assert!(
            report
                .issues
                .contains(&HistoryIntegrityIssue::DuplicateNoteRevision)
        );
        for field in [
            HistoryMetadataField::Outbox,
            HistoryMetadataField::Note,
            HistoryMetadataField::Revision,
            HistoryMetadataField::CreatedAt,
        ] {
            assert!(
                report
                    .issues
                    .contains(&HistoryIntegrityIssue::InvalidMetadata(field))
            );
        }
    }

    #[test]
    fn rejects_missing_non_blob_and_non_utf8_note_content() {
        let cases = [
            (
                RawContent::Missing,
                HistoryIntegrityIssue::MissingNoteContent,
            ),
            (
                RawContent::Tree("note-1"),
                HistoryIntegrityIssue::NonBlobNoteContent,
            ),
            (
                RawContent::Blob("note-1", &[0xff, 0xfe]),
                HistoryIntegrityIssue::InvalidMarkdownUtf8,
            ),
        ];

        for (content, expected) in cases {
            let directory = tempdir().expect("temporary directory");
            let repository = Repository::init(directory.path()).expect("initialize repository");
            raw_commit(
                &repository,
                valid_message("item-1", "note-1", 1, 1_000),
                content,
                &[],
                Some(HISTORY_REF),
            );
            let report = GitHistoryReader::open(directory.path())
                .expect("open reader")
                .integrity_check()
                .expect("check history");
            assert!(report.issues.contains(&expected));
        }
    }

    #[test]
    fn rebuilds_empty_cache_and_preserves_old_cache_after_corrupt_git() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::CreateNote {
                    id: "note-1".into(),
                    title: "History".into(),
                    placement: NodePlacement::last(None),
                    document_json: json!({"type": "doc", "content": []}),
                    markdown: "# History".into(),
                    at: 1_000,
                },
            )])
            .expect("create note");
        storage
            .replace_history_headers(&[skriuw_domain::HistoryHeader {
                note_id: "note-1".into(),
                version_id: "version-old".into(),
                created_at: 1,
                summary: "Old".into(),
                additions: None,
                deletions: None,
                word_count: None,
            }])
            .expect("seed cache");

        let empty_directory = tempdir().expect("temporary directory");
        Repository::init(empty_directory.path()).expect("initialize empty repository");
        let empty_reader = GitHistoryReader::open(empty_directory.path()).expect("open reader");
        assert_eq!(
            rebuild_history_cache(&empty_reader, &storage).expect("empty rebuild"),
            0
        );
        assert!(
            storage
                .bootstrap()
                .expect("empty cache")
                .history_headers
                .is_empty()
        );

        storage
            .replace_history_headers(&[skriuw_domain::HistoryHeader {
                note_id: "note-1".into(),
                version_id: "version-old".into(),
                created_at: 1,
                summary: "Old".into(),
                additions: None,
                deletions: None,
                word_count: None,
            }])
            .expect("restore old cache");
        let corrupt_directory = tempdir().expect("temporary directory");
        let repository = Repository::init(corrupt_directory.path()).expect("initialize repository");
        raw_commit(
            &repository,
            "invalid metadata".into(),
            RawContent::Missing,
            &[],
            Some(HISTORY_REF),
        );
        let corrupt_reader = GitHistoryReader::open(corrupt_directory.path()).expect("open reader");

        rebuild_history_cache(&corrupt_reader, &storage).expect_err("corrupt rebuild");
        let snapshot = storage.bootstrap().expect("old cache");
        assert_eq!(snapshot.history_headers.len(), 1);
        assert_eq!(snapshot.history_headers[0].version_id, "version-old");
    }

    #[test]
    fn public_integrity_diagnostics_redact_paths_object_ids_and_backend_text() {
        let directory = tempdir().expect("temporary directory");
        let repository = Repository::init(directory.path()).expect("initialize repository");
        let commit = raw_commit(
            &repository,
            "backend exploded at /private/history.git".into(),
            RawContent::Missing,
            &[],
            Some(HISTORY_REF),
        );
        let report = GitHistoryReader::open(directory.path())
            .expect("open reader")
            .integrity_check()
            .expect("check history");
        let diagnostic = report.diagnostic().to_string();

        assert!(!diagnostic.contains(directory.path().to_string_lossy().as_ref()));
        assert!(!diagnostic.contains(&commit.to_string()));
        assert!(!diagnostic.contains("backend exploded"));
        assert_eq!(
            diagnostic,
            "integrity.backend: Git history integrity check found 4 issue(s)"
        );

        let missing = directory.path().join("secret-repository");
        let diagnostic = GitHistoryReader::open(&missing)
            .expect_err("missing repository")
            .diagnostic()
            .to_string();
        assert!(!diagnostic.contains("secret-repository"));
    }

    fn item(id: &str, revision: i64, markdown: &str) -> PendingHistoryRevision {
        PendingHistoryRevision {
            id: id.into(),
            note_id: "note-1".into(),
            revision,
            markdown: markdown.into(),
            created_at: revision * 1_000,
            attempts: 1,
            provenance: HistoryProvenance::Local,
        }
    }

    #[test]
    fn a_superseded_version_is_named_after_its_origin() {
        let directory = tempdir().expect("temporary directory");
        let materializer = GitHistoryMaterializer::open(directory.path()).expect("open history");
        materializer
            .materialize_revision(&item("item-1", 1, "# First"))
            .expect("first note");
        let superseded = materializer
            .materialize_revision(&PendingHistoryRevision {
                provenance: HistoryProvenance::Superseded,
                ..item("item-2", 1, "# Lost")
            })
            .expect("superseded version");
        let remote = materializer
            .materialize_revision(&PendingHistoryRevision {
                provenance: HistoryProvenance::Remote,
                ..item("item-3", 2, "# Remote")
            })
            .expect("remote version");

        assert_eq!(
            superseded.summary,
            "Version from another device (superseded)"
        );
        assert_eq!(remote.summary, "Saved revision 2");
        let version = materializer
            .read_history_version("note-1", &superseded.version_id)
            .expect("read superseded version");
        assert_eq!(version.markdown, "# Lost");
    }

    #[derive(Clone, Copy)]
    enum RawContent<'a> {
        Missing,
        Blob(&'a str, &'a [u8]),
        Tree(&'a str),
    }

    fn raw_commit(
        repository: &Repository,
        message: String,
        content: RawContent<'_>,
        parent_ids: &[Oid],
        reference: Option<&str>,
    ) -> Oid {
        let mut root_builder = repository.treebuilder(None).expect("root tree builder");
        if let RawContent::Blob(note_id, _) | RawContent::Tree(note_id) = content {
            let mut notes_builder = repository.treebuilder(None).expect("notes tree builder");
            match content {
                RawContent::Blob(_, bytes) => {
                    let blob = repository.blob(bytes).expect("note blob");
                    notes_builder
                        .insert(format!("{note_id}.md"), blob, 0o100644)
                        .expect("insert note blob");
                }
                RawContent::Tree(_) => {
                    let empty_tree = repository
                        .treebuilder(None)
                        .expect("empty tree builder")
                        .write()
                        .expect("empty tree");
                    notes_builder
                        .insert(format!("{note_id}.md"), empty_tree, 0o040000)
                        .expect("insert note tree");
                }
                RawContent::Missing => unreachable!(),
            }
            let notes = notes_builder.write().expect("notes tree");
            root_builder
                .insert("notes", notes, 0o040000)
                .expect("insert notes tree");
        }
        let tree_id = root_builder.write().expect("root tree");
        let tree = repository.find_tree(tree_id).expect("find root tree");
        let parents = parent_ids
            .iter()
            .map(|id| repository.find_commit(*id).expect("find parent"))
            .collect::<Vec<_>>();
        let parent_refs = parents.iter().collect::<Vec<_>>();
        let signature =
            Signature::new("Skriuw", "history@skriuw.local", &Time::new(1, 0)).expect("signature");
        repository
            .commit(
                reference,
                &signature,
                &signature,
                &message,
                &tree,
                &parent_refs,
            )
            .expect("commit")
    }

    fn valid_message(outbox: &str, note: &str, revision: i64, created_at: i64) -> String {
        format!(
            "Saved note\n\nSkriuw-Outbox: {outbox}\nSkriuw-Note: {note}\nSkriuw-Revision: {revision}\nSkriuw-Created-At: {created_at}"
        )
    }

    fn oid(value: &str) -> Oid {
        Oid::from_str(value).expect("object id")
    }

    fn directory_entries(path: &std::path::Path) -> Vec<String> {
        let mut entries = fs::read_dir(path)
            .expect("read directory")
            .map(|entry| {
                entry
                    .expect("directory entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect::<Vec<_>>();
        entries.sort();
        entries
    }
}
