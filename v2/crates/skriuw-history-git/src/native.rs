use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use git2::{Commit, Repository, Signature, Time};
use skriuw_history::{HistoryMaterializer, MaterializationError};
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
            "{summary}\n\nSkriuw-Outbox: {}\nSkriuw-Note: {}\nSkriuw-Revision: {}",
            item.id, item.note_id, item.revision
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
    use skriuw_domain::{WorkspaceOperation, WorkspaceOperationEnvelope};
    use skriuw_history::{HistoryWorkResult, HistoryWorker};
    use skriuw_sqlite::SqliteWorkspace;
    use skriuw_storage::{PendingHistoryRevision, WorkspaceStorage};
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
                    parent_id: None,
                    title: "History".into(),
                    rank: 1024,
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
