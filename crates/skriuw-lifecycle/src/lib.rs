use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};

use skriuw_domain::WorkspaceSnapshot;
use skriuw_runtime::WorkspaceRuntime;
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{
    Diagnostic, DiagnosticCategory, DiagnosticContext, WorkspaceMaintenance, WorkspaceStorage,
};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DatabaseSwapStage {
    Preflight,
    Shutdown,
    VerifyOriginal,
    MoveOriginal,
    MoveReplacement,
    VerifyReplacement,
    Rollback,
    ReopenOriginal,
}

impl DatabaseSwapStage {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Preflight => "preflight",
            Self::Shutdown => "shutdown",
            Self::VerifyOriginal => "verify_original",
            Self::MoveOriginal => "move_original",
            Self::MoveReplacement => "move_replacement",
            Self::VerifyReplacement => "verify_replacement",
            Self::Rollback => "rollback",
            Self::ReopenOriginal => "reopen_original",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RollbackStatus {
    NotRequired,
    FilesystemRestored,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error("database swap failed during {stage}: {message}", stage = .stage.as_str())]
pub struct DatabaseSwapFailure {
    pub stage: DatabaseSwapStage,
    message: String,
}

impl DatabaseSwapFailure {
    fn new(stage: DatabaseSwapStage, message: impl Into<String>) -> Self {
        Self {
            stage,
            message: message.into(),
        }
    }

    #[must_use]
    pub fn message(&self) -> &str {
        &self.message
    }

    #[must_use]
    pub fn diagnostic(&self) -> Diagnostic {
        let category = match self.stage {
            DatabaseSwapStage::Preflight => DiagnosticCategory::InvalidInput,
            DatabaseSwapStage::Shutdown => DiagnosticCategory::Unavailable,
            DatabaseSwapStage::VerifyOriginal
            | DatabaseSwapStage::MoveOriginal
            | DatabaseSwapStage::MoveReplacement
            | DatabaseSwapStage::VerifyReplacement
            | DatabaseSwapStage::Rollback
            | DatabaseSwapStage::ReopenOriginal => DiagnosticCategory::Backend,
        };
        Diagnostic::new(
            DiagnosticContext::Recovery,
            category,
            "database replacement failed",
        )
    }
}

#[derive(Debug, Error)]
#[error("{failure}; rollback status: {rollback:?}")]
pub struct DatabaseSwapError {
    pub failure: DatabaseSwapFailure,
    pub rollback: RollbackStatus,
}

impl DatabaseSwapError {
    #[must_use]
    pub fn diagnostic(&self) -> Diagnostic {
        self.failure.diagnostic()
    }
}

pub enum DatabaseSwapOutcome {
    Replaced {
        runtime: WorkspaceRuntime,
        snapshot: WorkspaceSnapshot,
        rollback_path: PathBuf,
    },
    RolledBack {
        runtime: WorkspaceRuntime,
        snapshot: WorkspaceSnapshot,
        failure: DatabaseSwapFailure,
    },
}

pub fn replace_live_database(
    runtime: &WorkspaceRuntime,
    canonical_path: impl AsRef<Path>,
    candidate_path: impl AsRef<Path>,
    rollback_path: impl AsRef<Path>,
) -> Result<DatabaseSwapOutcome, DatabaseSwapError> {
    replace_live_database_gated(
        runtime,
        canonical_path,
        candidate_path,
        rollback_path,
        |_| Ok(()),
    )
}

pub fn replace_live_database_gated(
    runtime: &WorkspaceRuntime,
    canonical_path: impl AsRef<Path>,
    candidate_path: impl AsRef<Path>,
    rollback_path: impl AsRef<Path>,
    gate: impl FnMut(DatabaseSwapStage) -> Result<(), String>,
) -> Result<DatabaseSwapOutcome, DatabaseSwapError> {
    replace_live_database_inner(
        runtime,
        canonical_path.as_ref(),
        candidate_path.as_ref(),
        rollback_path.as_ref(),
        gate,
    )
}

fn replace_live_database_inner(
    runtime: &WorkspaceRuntime,
    canonical_path: &Path,
    candidate_path: &Path,
    rollback_path: &Path,
    mut gate: impl FnMut(DatabaseSwapStage) -> Result<(), String>,
) -> Result<DatabaseSwapOutcome, DatabaseSwapError> {
    let paths = SwapPaths::validate(canonical_path, candidate_path, rollback_path)
        .map_err(|failure| unrecovered(failure, RollbackStatus::NotRequired))?;
    SqliteWorkspace::verify_database_file(&paths.candidate)
        .map_err(|error| preflight(error.to_string()))?;
    require_sidecars_absent(&paths.candidate).map_err(preflight)?;

    runtime.shutdown().map_err(|error| {
        unrecovered(
            DatabaseSwapFailure::new(DatabaseSwapStage::Shutdown, error.to_string()),
            RollbackStatus::NotRequired,
        )
    })?;

    let original_ready = (|| {
        gate(DatabaseSwapStage::VerifyOriginal).map_err(|message| {
            DatabaseSwapFailure::new(DatabaseSwapStage::VerifyOriginal, message)
        })?;
        require_sidecars_absent(&paths.canonical).map_err(|message| {
            DatabaseSwapFailure::new(DatabaseSwapStage::VerifyOriginal, message)
        })?;
        SqliteWorkspace::verify_database_file(&paths.canonical).map_err(|error| {
            DatabaseSwapFailure::new(DatabaseSwapStage::VerifyOriginal, error.to_string())
        })?;
        Ok::<(), DatabaseSwapFailure>(())
    })();
    if let Err(failure) = original_ready {
        return reopen_unchanged(&paths.canonical, failure);
    }

    if let Err(message) = gate(DatabaseSwapStage::MoveOriginal) {
        return reopen_unchanged(
            &paths.canonical,
            DatabaseSwapFailure::new(DatabaseSwapStage::MoveOriginal, message),
        );
    }
    if let Err(error) = fs::rename(&paths.canonical, &paths.rollback) {
        return reopen_unchanged(
            &paths.canonical,
            DatabaseSwapFailure::new(DatabaseSwapStage::MoveOriginal, error.to_string()),
        );
    }
    if let Err(message) = sync_directory(&paths.canonical) {
        return rollback_and_reopen(
            &paths,
            false,
            DatabaseSwapFailure::new(DatabaseSwapStage::MoveOriginal, message),
        );
    }

    if let Err(message) = gate(DatabaseSwapStage::MoveReplacement) {
        return rollback_and_reopen(
            &paths,
            false,
            DatabaseSwapFailure::new(DatabaseSwapStage::MoveReplacement, message),
        );
    }
    if let Err(error) = fs::rename(&paths.candidate, &paths.canonical) {
        return rollback_and_reopen(
            &paths,
            false,
            DatabaseSwapFailure::new(DatabaseSwapStage::MoveReplacement, error.to_string()),
        );
    }
    if let Err(message) = sync_directory(&paths.canonical) {
        return rollback_and_reopen(
            &paths,
            true,
            DatabaseSwapFailure::new(DatabaseSwapStage::MoveReplacement, message),
        );
    }

    let replacement = (|| {
        gate(DatabaseSwapStage::VerifyReplacement).map_err(|message| {
            DatabaseSwapFailure::new(DatabaseSwapStage::VerifyReplacement, message)
        })?;
        SqliteWorkspace::verify_database_file(&paths.canonical).map_err(|error| {
            DatabaseSwapFailure::new(DatabaseSwapStage::VerifyReplacement, error.to_string())
        })?;
        let storage = SqliteWorkspace::open(&paths.canonical).map_err(|error| {
            DatabaseSwapFailure::new(DatabaseSwapStage::VerifyReplacement, error.to_string())
        })?;
        let report = storage.integrity_check().map_err(|error| {
            DatabaseSwapFailure::new(DatabaseSwapStage::VerifyReplacement, error.to_string())
        })?;
        if !report.healthy {
            return Err(DatabaseSwapFailure::new(
                DatabaseSwapStage::VerifyReplacement,
                format!("replacement integrity failed: {}", report.issues.join("; ")),
            ));
        }
        let snapshot = storage.bootstrap().map_err(|error| {
            DatabaseSwapFailure::new(DatabaseSwapStage::VerifyReplacement, error.to_string())
        })?;
        Ok((storage, snapshot))
    })();
    match replacement {
        Ok((storage, snapshot)) => Ok(DatabaseSwapOutcome::Replaced {
            runtime: WorkspaceRuntime::spawn(storage),
            snapshot,
            rollback_path: paths.rollback,
        }),
        Err(failure) => rollback_and_reopen(&paths, true, failure),
    }
}

struct SwapPaths {
    canonical: PathBuf,
    candidate: PathBuf,
    rollback: PathBuf,
}

impl SwapPaths {
    fn validate(
        canonical: &Path,
        candidate: &Path,
        rollback: &Path,
    ) -> Result<Self, DatabaseSwapFailure> {
        if canonical == candidate || canonical == rollback || candidate == rollback {
            return Err(DatabaseSwapFailure::new(
                DatabaseSwapStage::Preflight,
                "database swap paths must be distinct",
            ));
        }
        require_regular_file(canonical)?;
        require_regular_file(candidate)?;
        if fs::symlink_metadata(rollback).is_ok() {
            return Err(DatabaseSwapFailure::new(
                DatabaseSwapStage::Preflight,
                "rollback path already exists",
            ));
        }
        let canonical_directory = canonical_parent(canonical)?;
        let candidate_parent = canonical_parent(candidate)?;
        let rollback_parent = canonical_parent(rollback)?;
        if canonical_directory != candidate_parent || canonical_directory != rollback_parent {
            return Err(DatabaseSwapFailure::new(
                DatabaseSwapStage::Preflight,
                "database swap paths must share one directory",
            ));
        }
        let canonical_file = fs::canonicalize(canonical).map_err(|error| {
            DatabaseSwapFailure::new(DatabaseSwapStage::Preflight, error.to_string())
        })?;
        let candidate_file = fs::canonicalize(candidate).map_err(|error| {
            DatabaseSwapFailure::new(DatabaseSwapStage::Preflight, error.to_string())
        })?;
        if canonical_file == candidate_file {
            return Err(DatabaseSwapFailure::new(
                DatabaseSwapStage::Preflight,
                "canonical and candidate paths resolve to the same file",
            ));
        }
        Ok(Self {
            canonical: canonical.to_path_buf(),
            candidate: candidate.to_path_buf(),
            rollback: rollback.to_path_buf(),
        })
    }
}

fn canonical_parent(path: &Path) -> Result<PathBuf, DatabaseSwapFailure> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::canonicalize(parent)
        .map_err(|error| DatabaseSwapFailure::new(DatabaseSwapStage::Preflight, error.to_string()))
}

fn require_regular_file(path: &Path) -> Result<(), DatabaseSwapFailure> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        DatabaseSwapFailure::new(DatabaseSwapStage::Preflight, error.to_string())
    })?;
    if !metadata.file_type().is_file() {
        return Err(DatabaseSwapFailure::new(
            DatabaseSwapStage::Preflight,
            "database swap inputs must be regular files",
        ));
    }
    Ok(())
}

fn require_sidecars_absent(path: &Path) -> Result<(), String> {
    for sidecar in sqlite_sidecars(path) {
        if fs::symlink_metadata(sidecar).is_ok() {
            return Err("database has a live SQLite sidecar".into());
        }
    }
    Ok(())
}

fn sqlite_sidecars(path: &Path) -> [PathBuf; 2] {
    let mut wal = OsString::from(path.as_os_str());
    wal.push("-wal");
    let mut shared_memory = OsString::from(path.as_os_str());
    shared_memory.push("-shm");
    [PathBuf::from(wal), PathBuf::from(shared_memory)]
}

fn rollback_and_reopen(
    paths: &SwapPaths,
    replacement_moved: bool,
    failure: DatabaseSwapFailure,
) -> Result<DatabaseSwapOutcome, DatabaseSwapError> {
    let rollback = (|| {
        if replacement_moved {
            remove_replacement_sidecars(&paths.canonical)?;
            fs::rename(&paths.canonical, &paths.candidate).map_err(|error| error.to_string())?;
        }
        fs::rename(&paths.rollback, &paths.canonical).map_err(|error| error.to_string())?;
        sync_directory(&paths.canonical)
    })();
    if let Err(rollback_error) = rollback {
        return Err(unrecovered(
            DatabaseSwapFailure::new(
                DatabaseSwapStage::Rollback,
                format!("{failure}; rollback failed: {rollback_error}"),
            ),
            RollbackStatus::Failed,
        ));
    }
    reopen_original(&paths.canonical, failure)
}

fn reopen_unchanged(
    canonical: &Path,
    failure: DatabaseSwapFailure,
) -> Result<DatabaseSwapOutcome, DatabaseSwapError> {
    reopen_original(canonical, failure)
}

fn reopen_original(
    canonical: &Path,
    failure: DatabaseSwapFailure,
) -> Result<DatabaseSwapOutcome, DatabaseSwapError> {
    SqliteWorkspace::verify_database_file(canonical).map_err(|error| {
        unrecovered(
            DatabaseSwapFailure::new(
                DatabaseSwapStage::ReopenOriginal,
                format!("{failure}; original verification failed: {error}"),
            ),
            RollbackStatus::FilesystemRestored,
        )
    })?;
    let storage = SqliteWorkspace::open(canonical).map_err(|error| {
        unrecovered(
            DatabaseSwapFailure::new(
                DatabaseSwapStage::ReopenOriginal,
                format!("{failure}; original reopen failed: {error}"),
            ),
            RollbackStatus::FilesystemRestored,
        )
    })?;
    let report = storage.integrity_check().map_err(|error| {
        unrecovered(
            DatabaseSwapFailure::new(
                DatabaseSwapStage::ReopenOriginal,
                format!("{failure}; original integrity check failed: {error}"),
            ),
            RollbackStatus::FilesystemRestored,
        )
    })?;
    if !report.healthy {
        return Err(unrecovered(
            DatabaseSwapFailure::new(
                DatabaseSwapStage::ReopenOriginal,
                format!(
                    "{failure}; original integrity failed: {}",
                    report.issues.join("; ")
                ),
            ),
            RollbackStatus::FilesystemRestored,
        ));
    }
    let snapshot = storage.bootstrap().map_err(|error| {
        unrecovered(
            DatabaseSwapFailure::new(
                DatabaseSwapStage::ReopenOriginal,
                format!("{failure}; original bootstrap failed: {error}"),
            ),
            RollbackStatus::FilesystemRestored,
        )
    })?;
    Ok(DatabaseSwapOutcome::RolledBack {
        runtime: WorkspaceRuntime::spawn(storage),
        snapshot,
        failure,
    })
}

fn remove_replacement_sidecars(path: &Path) -> Result<(), String> {
    for sidecar in sqlite_sidecars(path) {
        match fs::symlink_metadata(&sidecar) {
            Ok(metadata) if metadata.file_type().is_file() => {
                fs::remove_file(sidecar).map_err(|error| error.to_string())?;
            }
            Ok(_) => return Err("replacement SQLite sidecar is not a regular file".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn preflight(message: impl Into<String>) -> DatabaseSwapError {
    unrecovered(
        DatabaseSwapFailure::new(DatabaseSwapStage::Preflight, message),
        RollbackStatus::NotRequired,
    )
}

fn unrecovered(failure: DatabaseSwapFailure, rollback: RollbackStatus) -> DatabaseSwapError {
    DatabaseSwapError { failure, rollback }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::json;
    use skriuw_domain::{NodePlacement, WorkspaceOperation, WorkspaceOperationEnvelope};
    use skriuw_runtime::{RuntimeError, WorkspaceRuntime};
    use skriuw_sqlite::SqliteWorkspace;
    use skriuw_storage::WorkspaceStorage;
    use tempfile::tempdir;

    use super::{
        DatabaseSwapOutcome, DatabaseSwapStage, RollbackStatus, replace_live_database,
        replace_live_database_inner,
    };

    #[test]
    fn replaces_live_database_after_draining_all_runtime_clones() {
        let fixture = fixture();
        let runtime = WorkspaceRuntime::spawn(
            SqliteWorkspace::open(&fixture.canonical).expect("open canonical"),
        );
        let stale_clone = runtime.clone();

        let outcome = replace_live_database(
            &runtime,
            &fixture.canonical,
            &fixture.candidate,
            &fixture.rollback,
        )
        .expect("replace database");
        let DatabaseSwapOutcome::Replaced {
            runtime,
            snapshot,
            rollback_path,
        } = outcome
        else {
            panic!("expected replacement");
        };

        assert_eq!(snapshot.nodes[0].id, "replacement-note");
        assert_eq!(rollback_path, fixture.rollback);
        assert!(fixture.canonical.is_file());
        assert!(fixture.rollback.is_file());
        assert!(!fixture.candidate.exists());
        assert!(matches!(
            stale_clone.bootstrap(),
            Err(RuntimeError::Unavailable)
        ));
        assert_eq!(
            SqliteWorkspace::verify_database_file(&fixture.rollback)
                .expect("verify rollback")
                .nodes[0]
                .id,
            "original-note"
        );
        runtime.shutdown().expect("shutdown replacement");
    }

    #[test]
    fn drains_accepted_save_into_rollback_before_swap() {
        let fixture = fixture();
        let runtime = WorkspaceRuntime::spawn(
            SqliteWorkspace::open(&fixture.canonical).expect("open canonical"),
        );
        let completion = runtime
            .apply_operations(vec![WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::SaveDocument {
                    note_id: "original-note".into(),
                    document_json: json!({"type": "doc", "revision": 2}),
                    markdown: "saved before swap".into(),
                    word_count: 3,
                    expected_revision: 1,
                    at: 2,
                },
            )])
            .expect("submit save");

        let outcome = replace_live_database(
            &runtime,
            &fixture.canonical,
            &fixture.candidate,
            &fixture.rollback,
        )
        .expect("replace database");
        let DatabaseSwapOutcome::Replaced { runtime, .. } = outcome else {
            panic!("expected replacement");
        };

        assert_eq!(
            completion.wait().expect("save completion").revisions[0].revision,
            2
        );
        let rollback =
            SqliteWorkspace::verify_database_file(&fixture.rollback).expect("verify rollback");
        assert_eq!(rollback.documents[0].revision, 2);
        assert_eq!(rollback.documents[0].markdown, "saved before swap");
        runtime.shutdown().expect("shutdown replacement");
    }

    #[test]
    fn rejects_invalid_candidate_before_runtime_shutdown() {
        let fixture = fixture();
        fs::write(&fixture.candidate, b"invalid database").expect("invalidate candidate");
        let runtime = WorkspaceRuntime::spawn(
            SqliteWorkspace::open(&fixture.canonical).expect("open canonical"),
        );

        let error = match replace_live_database(
            &runtime,
            &fixture.canonical,
            &fixture.candidate,
            &fixture.rollback,
        ) {
            Ok(_) => panic!("invalid candidate was accepted"),
            Err(error) => error,
        };

        assert_eq!(error.failure.stage, DatabaseSwapStage::Preflight);
        assert_eq!(error.rollback, RollbackStatus::NotRequired);
        assert_eq!(
            runtime
                .bootstrap()
                .expect("submit bootstrap")
                .wait()
                .expect("bootstrap")
                .nodes[0]
                .id,
            "original-note"
        );
        runtime.shutdown().expect("shutdown original");
    }

    #[test]
    fn rejects_existing_rollback_path_before_runtime_shutdown() {
        let fixture = fixture();
        fs::write(&fixture.rollback, b"occupied").expect("occupy rollback path");
        let runtime = WorkspaceRuntime::spawn(
            SqliteWorkspace::open(&fixture.canonical).expect("open canonical"),
        );

        let error = match replace_live_database(
            &runtime,
            &fixture.canonical,
            &fixture.candidate,
            &fixture.rollback,
        ) {
            Ok(_) => panic!("existing rollback path was accepted"),
            Err(error) => error,
        };

        assert_eq!(error.failure.stage, DatabaseSwapStage::Preflight);
        assert_eq!(error.rollback, RollbackStatus::NotRequired);
        assert_eq!(
            runtime
                .bootstrap()
                .expect("submit bootstrap")
                .wait()
                .expect("bootstrap")
                .nodes[0]
                .id,
            "original-note"
        );
        runtime.shutdown().expect("shutdown original");
    }

    #[test]
    fn restores_original_when_replacement_move_fails() {
        let fixture = fixture();
        let runtime = WorkspaceRuntime::spawn(
            SqliteWorkspace::open(&fixture.canonical).expect("open canonical"),
        );

        let outcome = replace_live_database_inner(
            &runtime,
            &fixture.canonical,
            &fixture.candidate,
            &fixture.rollback,
            |stage| {
                if stage == DatabaseSwapStage::MoveReplacement {
                    Err("injected replacement move failure".into())
                } else {
                    Ok(())
                }
            },
        )
        .expect("restore original");
        let DatabaseSwapOutcome::RolledBack {
            runtime,
            snapshot,
            failure,
        } = outcome
        else {
            panic!("expected rollback");
        };

        assert_eq!(failure.stage, DatabaseSwapStage::MoveReplacement);
        assert_eq!(snapshot.nodes[0].id, "original-note");
        assert!(fixture.canonical.is_file());
        assert!(fixture.candidate.is_file());
        assert!(!fixture.rollback.exists());
        runtime.shutdown().expect("shutdown restored original");
    }

    #[test]
    fn rolls_back_and_reopens_original_after_post_move_failure() {
        let fixture = fixture();
        let runtime = WorkspaceRuntime::spawn(
            SqliteWorkspace::open(&fixture.canonical).expect("open canonical"),
        );

        let outcome = replace_live_database_inner(
            &runtime,
            &fixture.canonical,
            &fixture.candidate,
            &fixture.rollback,
            |stage| {
                if stage == DatabaseSwapStage::VerifyReplacement {
                    Err("injected replacement verification failure".into())
                } else {
                    Ok(())
                }
            },
        )
        .expect("rollback replacement");
        let DatabaseSwapOutcome::RolledBack {
            runtime,
            snapshot,
            failure,
        } = outcome
        else {
            panic!("expected rollback");
        };

        assert_eq!(failure.stage, DatabaseSwapStage::VerifyReplacement);
        assert_eq!(snapshot.nodes[0].id, "original-note");
        assert!(fixture.canonical.is_file());
        assert!(fixture.candidate.is_file());
        assert!(!fixture.rollback.exists());
        assert_eq!(
            SqliteWorkspace::verify_database_file(&fixture.candidate)
                .expect("verify restored candidate")
                .nodes[0]
                .id,
            "replacement-note"
        );
        runtime.shutdown().expect("shutdown restored original");
    }

    #[test]
    fn reports_failed_rollback_without_deleting_replacement() {
        let fixture = fixture();
        let runtime = WorkspaceRuntime::spawn(
            SqliteWorkspace::open(&fixture.canonical).expect("open canonical"),
        );
        let rollback = fixture.rollback.clone();

        let error = match replace_live_database_inner(
            &runtime,
            &fixture.canonical,
            &fixture.candidate,
            &fixture.rollback,
            move |stage| {
                if stage == DatabaseSwapStage::VerifyReplacement {
                    fs::remove_file(&rollback).expect("remove rollback fixture");
                    Err("injected replacement verification failure".into())
                } else {
                    Ok(())
                }
            },
        ) {
            Ok(_) => panic!("failed rollback was accepted"),
            Err(error) => error,
        };

        assert_eq!(error.failure.stage, DatabaseSwapStage::Rollback);
        assert_eq!(error.rollback, RollbackStatus::Failed);
        assert!(!fixture.canonical.exists());
        assert!(fixture.candidate.is_file());
    }

    struct Fixture {
        _directory: tempfile::TempDir,
        canonical: std::path::PathBuf,
        candidate: std::path::PathBuf,
        rollback: std::path::PathBuf,
    }

    fn fixture() -> Fixture {
        let directory = tempdir().expect("temporary directory");
        let canonical = directory.path().join("workspace.sqlite");
        let replacement_source = directory.path().join("replacement-source.sqlite");
        let replacement_backup = directory.path().join("replacement-backup.sqlite");
        let candidate = directory.path().join("replacement-candidate.sqlite");
        let rollback = directory.path().join("workspace.rollback.sqlite");
        seed(&canonical, "original-note");
        let replacement = seed(&replacement_source, "replacement-note");
        replacement
            .backup_to(&replacement_backup)
            .expect("backup replacement");
        drop(replacement);
        SqliteWorkspace::restore_backup_to(&replacement_backup, &candidate)
            .expect("restore candidate");
        Fixture {
            _directory: directory,
            canonical,
            candidate,
            rollback,
        }
    }

    fn seed(path: &std::path::Path, id: &str) -> SqliteWorkspace {
        let storage = SqliteWorkspace::open(path).expect("open seed database");
        storage
            .apply_operations(&[WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::CreateNote {
                    id: id.into(),
                    title: id.into(),
                    placement: NodePlacement::last(None),
                    document_json: json!({"type": "doc", "content": []}),
                    markdown: format!("# {id}"),
                    at: 1,
                },
            )])
            .expect("seed database");
        storage
    }
}
