use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use git2::{Commit, Oid, Repository, Signature, Time};
use skriuw_domain::HistoryHeader;
use skriuw_history::{
    HistoryMaterializer, HistoryReadError, HistoryReader, HistoryVersion, MaterializationError,
};
use skriuw_storage::{HistoryMaterialization, PendingHistoryRevision};
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
        let summary = summary(item.revision);
        let message = format!(
            "{summary}\n\nSkriuw-Outbox: {}\nSkriuw-Note: {}\nSkriuw-Revision: {}\nSkriuw-Created-At: {}",
            item.id, item.note_id, item.revision, item.created_at
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

        Ok(HistoryMaterialization {
            version_id: commit_id.to_string(),
            summary,
        })
    }

    pub fn list_history_headers(&self) -> Result<Vec<HistoryHeader>, HistoryReadError> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| HistoryReadError::backend("history materializer lock is poisoned"))?;
        let repository = Repository::open(&self.root).map_err(read_backend)?;
        let mut walk = repository.revwalk().map_err(read_backend)?;
        match walk.push_ref(HISTORY_REF) {
            Ok(()) => {}
            Err(error) if error.code() == git2::ErrorCode::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(read_backend(error)),
        }
        let mut headers = Vec::new();
        for commit_id in walk {
            let commit = repository
                .find_commit(commit_id.map_err(read_backend)?)
                .map_err(read_backend)?;
            headers.push(commit_metadata(&commit)?.header);
        }
        Ok(headers)
    }

    pub fn read_history_version(
        &self,
        note_id: &str,
        version_id: &str,
    ) -> Result<HistoryVersion, HistoryReadError> {
        if !valid_identifier(note_id) {
            return Err(HistoryReadError::NotFound(version_id.into()));
        }
        let commit_id =
            Oid::from_str(version_id).map_err(|_| HistoryReadError::NotFound(version_id.into()))?;
        let _guard = self
            .gate
            .lock()
            .map_err(|_| HistoryReadError::backend("history materializer lock is poisoned"))?;
        let repository = Repository::open(&self.root).map_err(read_backend)?;
        let commit = repository.find_commit(commit_id).map_err(|error| {
            if error.code() == git2::ErrorCode::NotFound {
                HistoryReadError::NotFound(version_id.into())
            } else {
                read_backend(error)
            }
        })?;
        let metadata = commit_metadata(&commit)?;
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

struct CommitMetadata {
    header: HistoryHeader,
    revision: i64,
}

fn commit_metadata(commit: &Commit<'_>) -> Result<CommitMetadata, HistoryReadError> {
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
        .unwrap_or_else(|| commit.time().seconds().saturating_mul(1_000));
    if created_at < 0 {
        return Err(HistoryReadError::backend(
            "history commit has invalid timestamp metadata",
        ));
    }
    let summary = commit
        .summary()
        .ok()
        .flatten()
        .unwrap_or("Saved note")
        .to_owned();
    Ok(CommitMetadata {
        header: HistoryHeader {
            note_id: note_id.into(),
            version_id: commit.id().to_string(),
            created_at,
            summary,
        },
        revision,
    })
}

fn trailer<'a>(message: &'a str, key: &str) -> Option<&'a str> {
    let prefix = format!("{key}: ");
    message.lines().find_map(|line| line.strip_prefix(&prefix))
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
    Ok(Some(HistoryMaterialization {
        version_id: commit.id().to_string(),
        summary: commit
            .summary()
            .ok()
            .flatten()
            .unwrap_or("Saved note")
            .into(),
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

fn summary(revision: i64) -> String {
    if revision == 1 {
        "Created note".into()
    } else {
        format!("Saved revision {revision}")
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use git2::Repository;
    use serde_json::json;
    use skriuw_domain::{NodePlacement, WorkspaceOperation, WorkspaceOperationEnvelope};
    use skriuw_history::rebuild_history_cache;
    use skriuw_history::{HistoryWorkResult, HistoryWorker};
    use skriuw_sqlite::SqliteWorkspace;
    use skriuw_storage::{HistoryCache, PendingHistoryRevision, WorkspaceStorage};
    use tempfile::tempdir;

    use super::{GitHistoryError, GitHistoryMaterializer, HISTORY_REF};

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

        let result = worker.process_next(2_000, 30_000).expect("process history");
        let snapshot = storage.bootstrap().expect("bootstrap");

        assert!(matches!(result, HistoryWorkResult::Materialized { .. }));
        assert_eq!(snapshot.history_headers.len(), 1);
        assert_eq!(snapshot.history_headers[0].summary, "Created note");
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
        worker.process_next(2_000, 30_000).expect("process history");
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

    fn item(id: &str, revision: i64, markdown: &str) -> PendingHistoryRevision {
        PendingHistoryRevision {
            id: id.into(),
            note_id: "note-1".into(),
            revision,
            markdown: markdown.into(),
            created_at: revision * 1_000,
            attempts: 1,
        }
    }
}
