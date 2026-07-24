use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use serde::Serialize;
use skriuw_domain::{HistoryHeader, WorkspaceArchive, WorkspaceSnapshot};
use skriuw_history::{HistoryWorkResult, HistoryWorker};
use skriuw_history_git::GitHistoryMaterializer;
use skriuw_lifecycle::{DatabaseSwapOutcome, DatabaseSwapStage, replace_live_database_gated};
use skriuw_runtime::WorkspaceRuntime;
use skriuw_sqlite::{
    BackupRetentionPolicy, BackupRotationOutcome, RecoveryManifest, SqliteWorkspace,
};
use skriuw_storage::{
    Diagnostic, DiagnosticCategory, DiagnosticContext, WorkspaceMaintenance, WorkspaceStorage,
};

const HISTORY_DRAIN_WORKER_ID: &str = "desktop-history-drain";
const HISTORY_DRAIN_IDLE_DELAY: Duration = Duration::from_millis(250);
const HISTORY_DRAIN_LEASE_MS: i64 = 30_000;
const ROLLBACK_PREFIX: &str = ".rollback-";
const CANDIDATE_PREFIX: &str = ".restore-candidate-";
const SAFETY_BACKUP_PREFIX: &str = ".pre-import-";

type HistoryPublisher = Arc<dyn Fn(HistoryHeader) + Send + Sync>;

pub struct HistoryDrainHandle {
    stop: Arc<AtomicBool>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl HistoryDrainHandle {
    pub fn shutdown(&self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Ok(mut guard) = self.worker.lock()
            && let Some(handle) = guard.take()
        {
            let _ = handle.join();
        }
    }
}

pub fn spawn_history_drain(
    database_path: &Path,
    repository_path: &Path,
    now_millis: fn() -> i64,
    publish: HistoryPublisher,
) -> Result<HistoryDrainHandle, String> {
    let storage = Arc::new(
        SqliteWorkspace::open(database_path)
            .map_err(|error| format!("open {}: {error}", database_path.display()))?,
    );
    let materializer = GitHistoryMaterializer::open(repository_path)
        .map_err(|error| format!("open {}: {error}", repository_path.display()))?;
    let worker = HistoryWorker::new(HISTORY_DRAIN_WORKER_ID, storage, materializer)
        .map_err(|error| error.to_string())?;
    let stop = Arc::new(AtomicBool::new(false));
    let stop_flag = Arc::clone(&stop);
    let handle = thread::Builder::new()
        .name("skriuw-history-drain".into())
        .spawn(move || {
            while !stop_flag.load(Ordering::Relaxed) {
                match worker.process_next(now_millis(), HISTORY_DRAIN_LEASE_MS) {
                    Ok(HistoryWorkResult::Materialized { header, .. }) => publish(header),
                    Ok(HistoryWorkResult::Idle) => thread::sleep(HISTORY_DRAIN_IDLE_DELAY),
                    Err(error) => {
                        eprintln!("history drain failed: {error}");
                        thread::sleep(HISTORY_DRAIN_IDLE_DELAY);
                    }
                }
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(HistoryDrainHandle {
        stop,
        worker: Mutex::new(Some(handle)),
    })
}

pub struct BackupRotationHandle {
    stop: Arc<(Mutex<bool>, Condvar)>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl BackupRotationHandle {
    pub fn shutdown(&self) {
        let (stopped, wake) = &*self.stop;
        if let Ok(mut flag) = stopped.lock() {
            *flag = true;
        }
        wake.notify_all();
        if let Ok(mut guard) = self.worker.lock()
            && let Some(handle) = guard.take()
        {
            let _ = handle.join();
        }
    }
}

pub fn spawn_backup_rotation(
    coordinator: Arc<MaintenanceCoordinator>,
    retry_delay: Duration,
) -> Result<BackupRotationHandle, String> {
    let stop = Arc::new((Mutex::new(false), Condvar::new()));
    let stop_signal = Arc::clone(&stop);
    let handle = thread::Builder::new()
        .name("skriuw-backup-rotation".into())
        .spawn(move || {
            let cadence = Duration::from_millis(BackupRetentionPolicy::default().cadence_ms as u64);
            loop {
                let now = (coordinator.now_millis)();
                let delay = match coordinator.rotate_backups(false) {
                    Ok(report) => rotation_delay(report.next_due_at, now, cadence, retry_delay),
                    Err(_) => retry_delay,
                };
                let (stopped, wake) = &*stop_signal;
                let Ok(flag) = stopped.lock() else {
                    break;
                };
                let Ok((flag, _)) = wake.wait_timeout_while(flag, delay, |value| !*value) else {
                    break;
                };
                if *flag {
                    break;
                }
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(BackupRotationHandle {
        stop,
        worker: Mutex::new(Some(handle)),
    })
}

fn rotation_delay(
    next_due_at: Option<i64>,
    now: i64,
    cadence: Duration,
    retry_delay: Duration,
) -> Duration {
    match next_due_at {
        Some(due) if due > now => Duration::from_millis((due - now) as u64).min(cadence),
        Some(_) => retry_delay,
        None => cadence,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveExportReport {
    pub nodes: usize,
    pub documents: usize,
    pub exported_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveImportReport {
    pub nodes: usize,
    pub documents: usize,
    pub safety_backup_file_name: String,
    pub snapshot: WorkspaceSnapshot,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRotationReport {
    pub status: &'static str,
    pub artifact_file_name: Option<String>,
    pub pruned: usize,
    pub next_due_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RollbackArtifactReport {
    pub file_name: String,
    pub created_at: i64,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryInventoryReport {
    pub manifest: Option<RecoveryManifest>,
    pub rollbacks: Vec<RollbackArtifactReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseSwapReport {
    pub status: &'static str,
    pub snapshot: WorkspaceSnapshot,
    pub rollback_file_name: Option<String>,
    pub failure: Option<String>,
}

pub struct MaintenanceCoordinator {
    database_path: PathBuf,
    history_repository_path: PathBuf,
    history_publisher: HistoryPublisher,
    recovery_directory: PathBuf,
    now_millis: fn() -> i64,
    active: Mutex<WorkspaceHandle>,
    operation: Mutex<Option<&'static str>>,
    cancel: Arc<AtomicBool>,
}

struct WorkspaceHandle {
    runtime: WorkspaceRuntime,
    history_drain: Option<HistoryDrainHandle>,
}

struct OperationGuard<'a> {
    coordinator: &'a MaintenanceCoordinator,
}

impl Drop for OperationGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut operation) = self.coordinator.operation.lock() {
            *operation = None;
        }
        self.coordinator.cancel.store(false, Ordering::Relaxed);
    }
}

impl MaintenanceCoordinator {
    pub fn start(
        database_path: PathBuf,
        history_repository_path: PathBuf,
        now_millis: fn() -> i64,
        history_publisher: HistoryPublisher,
    ) -> Result<Self, String> {
        let storage = SqliteWorkspace::open(&database_path)
            .map_err(|error| format!("open {}: {error}", database_path.display()))?;
        let history_drain = spawn_history_drain(
            &database_path,
            &history_repository_path,
            now_millis,
            Arc::clone(&history_publisher),
        )?;
        let recovery_directory = database_path
            .parent()
            .unwrap_or(Path::new("."))
            .join("recovery");
        Ok(Self {
            database_path,
            history_repository_path,
            history_publisher,
            recovery_directory,
            now_millis,
            active: Mutex::new(WorkspaceHandle {
                runtime: WorkspaceRuntime::spawn(storage),
                history_drain: Some(history_drain),
            }),
            operation: Mutex::new(None),
            cancel: Arc::new(AtomicBool::new(false)),
        })
    }

    pub fn runtime(&self) -> Result<WorkspaceRuntime, Diagnostic> {
        self.active
            .lock()
            .map(|handle| handle.runtime.clone())
            .map_err(|_| internal("workspace state is unavailable"))
    }

    pub fn status(&self) -> Option<&'static str> {
        self.operation.lock().ok().and_then(|operation| *operation)
    }

    pub fn cancel_active_operation(&self) -> bool {
        let running = self
            .operation
            .lock()
            .map(|operation| operation.is_some())
            .unwrap_or(false);
        if running {
            self.cancel.store(true, Ordering::Relaxed);
        }
        running
    }

    pub fn shutdown(&self) {
        if let Ok(mut handle) = self.active.lock() {
            if let Some(drain) = handle.history_drain.take() {
                drain.shutdown();
            }
            if let Err(error) = handle.runtime.shutdown() {
                eprintln!("runtime shutdown failed: {error}");
            }
        }
    }

    pub fn export_archive(&self, target: &Path) -> Result<ArchiveExportReport, Diagnostic> {
        let _operation = self.begin("export")?;
        if fs::symlink_metadata(target).is_ok() {
            return Err(Diagnostic::new(
                DiagnosticContext::Recovery,
                DiagnosticCategory::AlreadyExists,
                "export target already exists",
            ));
        }
        let storage = SqliteWorkspace::open(&self.database_path).map_err(recovery_error)?;
        let exported_at = (self.now_millis)();
        let archive = storage
            .export_archive(exported_at)
            .map_err(recovery_error)?;
        drop(storage);
        self.check_cancelled()?;
        let mut bytes = serde_json::to_vec_pretty(&archive)
            .map_err(|_| internal("workspace archive could not be serialized"))?;
        bytes.push(b'\n');
        write_new_file(target, &bytes)?;
        Ok(ArchiveExportReport {
            nodes: archive.nodes.len(),
            documents: archive.documents.len(),
            exported_at,
        })
    }

    pub fn import_archive(&self, source: &Path) -> Result<ArchiveImportReport, Diagnostic> {
        self.import_archive_gated(source, |_| {})
    }

    fn import_archive_gated(
        &self,
        source: &Path,
        after_safety_backup: impl FnOnce(&Self),
    ) -> Result<ArchiveImportReport, Diagnostic> {
        let _operation = self.begin("import")?;
        let raw = fs::read(source).map_err(|_| {
            Diagnostic::new(
                DiagnosticContext::Recovery,
                DiagnosticCategory::NotFound,
                "workspace archive could not be read",
            )
        })?;
        let archive = serde_json::from_slice::<WorkspaceArchive>(&raw).map_err(|_| {
            Diagnostic::new(
                DiagnosticContext::Recovery,
                DiagnosticCategory::InvalidInput,
                "workspace archive is not valid JSON",
            )
        })?;
        archive.validate().map_err(|_| {
            Diagnostic::new(
                DiagnosticContext::Recovery,
                DiagnosticCategory::InvalidInput,
                "workspace archive is invalid",
            )
        })?;
        self.check_cancelled()?;

        self.stop_active_workspace()?;
        let result = self.import_into_stopped_workspace(&archive, after_safety_backup);
        if result.is_err() {
            self.reopen_workspace_after_failure();
        }
        result
    }

    fn import_into_stopped_workspace(
        &self,
        archive: &WorkspaceArchive,
        after_safety_backup: impl FnOnce(&Self),
    ) -> Result<ArchiveImportReport, Diagnostic> {
        let storage = SqliteWorkspace::open(&self.database_path).map_err(recovery_error)?;
        let safety_backup_file_name = format!(
            "{}{}{}.sqlite",
            database_file_name(&self.database_path)?,
            SAFETY_BACKUP_PREFIX,
            (self.now_millis)()
        );
        let safety_backup = self.database_path.with_file_name(&safety_backup_file_name);
        storage
            .backup_to(&safety_backup)
            .map_err(|error| error.diagnostic(DiagnosticContext::Backup))?;
        after_safety_backup(self);
        if let Err(cancelled) = self.check_cancelled() {
            let _ = fs::remove_file(&safety_backup);
            return Err(cancelled);
        }
        let summary = storage
            .replace_from_archive(archive)
            .map_err(recovery_error)?;
        let snapshot = storage.bootstrap().map_err(recovery_error)?;
        self.publish_workspace(WorkspaceRuntime::spawn(storage))?;
        Ok(ArchiveImportReport {
            nodes: summary.nodes,
            documents: summary.documents,
            safety_backup_file_name,
            snapshot,
        })
    }

    pub fn rotate_backups(&self, force: bool) -> Result<BackupRotationReport, Diagnostic> {
        let _operation = self.begin("backup")?;
        let mut policy = BackupRetentionPolicy::default();
        if force {
            policy.cadence_ms = 1;
        }
        let storage = SqliteWorkspace::open(&self.database_path)
            .map_err(|error| error.diagnostic(DiagnosticContext::Backup))?;
        let outcome = storage
            .create_scheduled_backup(&self.recovery_directory, (self.now_millis)(), policy)
            .map_err(|error| error.diagnostic(DiagnosticContext::Backup))?;
        Ok(match outcome {
            BackupRotationOutcome::Skipped { next_due_at } => BackupRotationReport {
                status: "skipped",
                artifact_file_name: None,
                pruned: 0,
                next_due_at: Some(next_due_at),
            },
            BackupRotationOutcome::Created {
                artifact, pruned, ..
            } => BackupRotationReport {
                status: "created",
                artifact_file_name: Some(artifact.filename),
                pruned: pruned.len(),
                next_due_at: None,
            },
        })
    }

    pub fn recovery_inventory(&self) -> Result<RecoveryInventoryReport, Diagnostic> {
        let manifest = SqliteWorkspace::read_recovery_manifest(&self.recovery_directory)
            .map_err(recovery_error)?;
        Ok(RecoveryInventoryReport {
            manifest,
            rollbacks: self.list_rollback_artifacts()?,
        })
    }

    fn list_rollback_artifacts(&self) -> Result<Vec<RollbackArtifactReport>, Diagnostic> {
        let directory = self.database_path.parent().unwrap_or(Path::new("."));
        let database_name = database_file_name(&self.database_path)?;
        let prefix = format!("{database_name}{ROLLBACK_PREFIX}");
        let mut rollbacks = Vec::new();
        let entries = match fs::read_dir(directory) {
            Ok(entries) => entries,
            Err(_) => return Ok(rollbacks),
        };
        for entry in entries.flatten() {
            let Some(file_name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let Some(created_at) = file_name
                .strip_prefix(&prefix)
                .and_then(|value| value.parse::<i64>().ok())
            else {
                continue;
            };
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if !metadata.file_type().is_file() {
                continue;
            }
            rollbacks.push(RollbackArtifactReport {
                file_name,
                created_at,
                size_bytes: metadata.len(),
            });
        }
        rollbacks.sort_by_key(|rollback| std::cmp::Reverse(rollback.created_at));
        Ok(rollbacks)
    }

    pub fn restore_backup(
        &self,
        artifact_file_name: &str,
    ) -> Result<DatabaseSwapReport, Diagnostic> {
        self.restore_backup_gated(artifact_file_name, |_| Ok(()))
    }

    fn restore_backup_gated(
        &self,
        artifact_file_name: &str,
        mut gate: impl FnMut(DatabaseSwapStage) -> Result<(), String>,
    ) -> Result<DatabaseSwapReport, Diagnostic> {
        let _operation = self.begin("restore")?;
        let manifest = SqliteWorkspace::read_recovery_manifest(&self.recovery_directory)
            .map_err(recovery_error)?
            .ok_or_else(|| {
                Diagnostic::new(
                    DiagnosticContext::Recovery,
                    DiagnosticCategory::NotFound,
                    "recovery manifest was not found",
                )
            })?;
        if !manifest
            .artifacts
            .iter()
            .any(|artifact| artifact.filename == artifact_file_name)
        {
            return Err(Diagnostic::new(
                DiagnosticContext::Recovery,
                DiagnosticCategory::InvalidInput,
                "backup artifact is not listed in the recovery manifest",
            ));
        }
        self.check_cancelled()?;

        let now = (self.now_millis)();
        let database_name = database_file_name(&self.database_path)?;
        let candidate = self
            .database_path
            .with_file_name(format!("{database_name}{CANDIDATE_PREFIX}{now}"));
        let rollback_file_name = format!("{database_name}{ROLLBACK_PREFIX}{now}");
        let rollback = self.database_path.with_file_name(&rollback_file_name);
        SqliteWorkspace::restore_backup_to(
            self.recovery_directory.join(artifact_file_name),
            &candidate,
        )
        .map_err(recovery_error)?;
        if let Err(cancelled) = self.check_cancelled() {
            let _ = fs::remove_file(&candidate);
            return Err(cancelled);
        }

        let runtime = self.stop_active_workspace()?;
        let cancel = Arc::clone(&self.cancel);
        let outcome = replace_live_database_gated(
            &runtime,
            &self.database_path,
            &candidate,
            &rollback,
            |stage| {
                if cancel.load(Ordering::Relaxed) {
                    return Err("maintenance operation was cancelled".into());
                }
                gate(stage)
            },
        );
        match outcome {
            Ok(DatabaseSwapOutcome::Replaced {
                runtime, snapshot, ..
            }) => {
                self.publish_workspace(runtime)?;
                Ok(DatabaseSwapReport {
                    status: "replaced",
                    snapshot,
                    rollback_file_name: Some(rollback_file_name),
                    failure: None,
                })
            }
            Ok(DatabaseSwapOutcome::RolledBack {
                runtime,
                snapshot,
                failure,
            }) => {
                let _ = fs::remove_file(&candidate);
                self.publish_workspace(runtime)?;
                Ok(DatabaseSwapReport {
                    status: "rolledBack",
                    snapshot,
                    rollback_file_name: None,
                    failure: Some(failure.diagnostic().to_string()),
                })
            }
            Err(error) => {
                let _ = fs::remove_file(&candidate);
                self.reopen_workspace_after_failure();
                Err(error.diagnostic())
            }
        }
    }

    fn begin(&self, label: &'static str) -> Result<OperationGuard<'_>, Diagnostic> {
        let mut operation = self
            .operation
            .lock()
            .map_err(|_| internal("maintenance state is unavailable"))?;
        if operation.is_some() {
            return Err(Diagnostic::new(
                DiagnosticContext::Recovery,
                DiagnosticCategory::Conflict,
                "another maintenance operation is already running",
            ));
        }
        *operation = Some(label);
        self.cancel.store(false, Ordering::Relaxed);
        Ok(OperationGuard { coordinator: self })
    }

    fn check_cancelled(&self) -> Result<(), Diagnostic> {
        if self.cancel.load(Ordering::Relaxed) {
            return Err(Diagnostic::new(
                DiagnosticContext::Recovery,
                DiagnosticCategory::Unavailable,
                "maintenance operation was cancelled",
            ));
        }
        Ok(())
    }

    fn stop_active_workspace(&self) -> Result<WorkspaceRuntime, Diagnostic> {
        let mut handle = self
            .active
            .lock()
            .map_err(|_| internal("workspace state is unavailable"))?;
        if let Some(drain) = handle.history_drain.take() {
            drain.shutdown();
        }
        handle
            .runtime
            .shutdown()
            .map_err(|error| error.diagnostic())?;
        Ok(handle.runtime.clone())
    }

    fn publish_workspace(&self, runtime: WorkspaceRuntime) -> Result<(), Diagnostic> {
        let history_drain = spawn_history_drain(
            &self.database_path,
            &self.history_repository_path,
            self.now_millis,
            Arc::clone(&self.history_publisher),
        )
        .map_err(|error| {
            eprintln!("history drain restart failed: {error}");
            internal("history drain could not restart")
        })?;
        let mut handle = self
            .active
            .lock()
            .map_err(|_| internal("workspace state is unavailable"))?;
        if let Some(previous) = handle.history_drain.take() {
            previous.shutdown();
        }
        handle.runtime = runtime;
        handle.history_drain = Some(history_drain);
        Ok(())
    }

    fn reopen_workspace_after_failure(&self) {
        let reopened = SqliteWorkspace::open(&self.database_path)
            .map(WorkspaceRuntime::spawn)
            .map_err(|error| error.to_string())
            .and_then(|runtime| {
                self.publish_workspace(runtime)
                    .map_err(|error| error.to_string())
            });
        if let Err(error) = reopened {
            eprintln!("workspace reopen after maintenance failure failed: {error}");
        }
    }
}

fn database_file_name(path: &Path) -> Result<String, Diagnostic> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .ok_or_else(|| internal("database path has no file name"))
}

fn write_new_file(target: &Path, bytes: &[u8]) -> Result<(), Diagnostic> {
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target)?;
        file.write_all(bytes)?;
        file.sync_all()
    })();
    result.map_err(|error| {
        let category = if error.kind() == std::io::ErrorKind::AlreadyExists {
            DiagnosticCategory::AlreadyExists
        } else {
            DiagnosticCategory::Backend
        };
        Diagnostic::new(
            DiagnosticContext::Recovery,
            category,
            "export target could not be written",
        )
    })
}

fn recovery_error(error: skriuw_storage::StorageError) -> Diagnostic {
    error.diagnostic(DiagnosticContext::Recovery)
}

fn internal(message: &str) -> Diagnostic {
    Diagnostic::new(
        DiagnosticContext::Recovery,
        DiagnosticCategory::Internal,
        message,
    )
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        sync::{Arc, atomic::Ordering},
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    use serde_json::json;
    use skriuw_domain::{
        NodePlacement, WorkspaceArchive, WorkspaceOperation, WorkspaceOperationEnvelope,
    };
    use skriuw_lifecycle::DatabaseSwapStage;
    use skriuw_sqlite::SqliteWorkspace;
    use skriuw_storage::{DiagnosticCategory, WorkspaceMaintenance, WorkspaceStorage};
    use tempfile::{TempDir, tempdir};

    use super::MaintenanceCoordinator;

    fn test_now() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or(0)
    }

    fn create_note(id: &str) -> WorkspaceOperationEnvelope {
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateNote {
            id: id.into(),
            title: id.into(),
            placement: NodePlacement::last(None),
            document_json: json!({"type": "doc", "content": []}),
            markdown: format!("# {id}"),
            at: test_now(),
        })
    }

    struct Fixture {
        directory: TempDir,
        coordinator: MaintenanceCoordinator,
    }

    impl Fixture {
        fn database_path(&self) -> std::path::PathBuf {
            self.directory.path().join("workspace.db")
        }

        fn note_ids(&self) -> Vec<String> {
            let snapshot = self
                .coordinator
                .runtime()
                .expect("runtime")
                .bootstrap()
                .expect("submit bootstrap")
                .wait()
                .expect("bootstrap");
            snapshot.nodes.into_iter().map(|node| node.id).collect()
        }

        fn apply(&self, envelope: WorkspaceOperationEnvelope) {
            self.coordinator
                .runtime()
                .expect("runtime")
                .apply_operations(vec![envelope])
                .expect("submit operation")
                .wait()
                .expect("apply operation");
        }

        fn assert_no_leaked_paths(&self, message: &str) {
            let root = self.directory.path().to_str().expect("directory path");
            assert!(
                !message.contains(root),
                "diagnostic leaked a filesystem path: {message}"
            );
        }
    }

    fn fixture() -> Fixture {
        let directory = tempdir().expect("temporary directory");
        let database_path = directory.path().join("workspace.db");
        {
            let storage = SqliteWorkspace::open(&database_path).expect("open seed database");
            storage
                .apply_operations(&[create_note("original-note")])
                .expect("seed database");
        }
        let coordinator = MaintenanceCoordinator::start(
            database_path,
            directory.path().join("history"),
            test_now,
            Arc::new(|_| {}),
        )
        .expect("start coordinator");
        Fixture {
            directory,
            coordinator,
        }
    }

    fn foreign_archive(directory: &TempDir, note_id: &str) -> std::path::PathBuf {
        let source_path = directory.path().join("foreign.db");
        let archive_path = directory.path().join("foreign-archive.json");
        let storage = SqliteWorkspace::open(&source_path).expect("open foreign database");
        storage
            .apply_operations(&[create_note(note_id)])
            .expect("seed foreign database");
        let archive = storage.export_archive(test_now()).expect("export archive");
        fs::write(
            &archive_path,
            serde_json::to_vec_pretty(&archive).expect("serialize archive"),
        )
        .expect("write archive");
        archive_path
    }

    #[test]
    fn shutdown_drains_an_accepted_active_note_operation() {
        let fixture = fixture();
        fixture.apply(create_note("second-note"));
        let completion = fixture
            .coordinator
            .runtime()
            .expect("runtime")
            .apply_operations(vec![WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::SetActiveNote {
                    note_id: Some("second-note".into()),
                },
            )])
            .expect("submit active note");

        fixture.coordinator.shutdown();

        completion.wait().expect("accepted operation completes");
        let snapshot = SqliteWorkspace::open(fixture.database_path())
            .expect("reopen database")
            .bootstrap()
            .expect("bootstrap persisted state");
        assert_eq!(snapshot.active_note_id.as_deref(), Some("second-note"));
    }

    #[test]
    fn exports_archive_to_new_target_and_rejects_existing_target() {
        let fixture = fixture();
        let target = fixture.directory.path().join("export.json");

        let report = fixture
            .coordinator
            .export_archive(&target)
            .expect("export archive");
        assert_eq!(report.nodes, 1);
        assert_eq!(report.documents, 1);
        let archive = serde_json::from_slice::<WorkspaceArchive>(
            &fs::read(&target).expect("read exported archive"),
        )
        .expect("parse exported archive");
        archive.validate().expect("valid exported archive");
        assert_eq!(archive.nodes[0].id, "original-note");

        let error = fixture
            .coordinator
            .export_archive(&target)
            .expect_err("existing target must be rejected");
        assert_eq!(error.category, DiagnosticCategory::AlreadyExists);
        fixture.assert_no_leaked_paths(&error.to_string());
    }

    #[test]
    fn rejects_malformed_archive_without_mutation_or_safety_backup() {
        let fixture = fixture();
        let malformed = fixture.directory.path().join("malformed.json");
        fs::write(&malformed, b"not json").expect("write malformed archive");

        let error = fixture
            .coordinator
            .import_archive(&malformed)
            .expect_err("malformed archive must be rejected");

        assert_eq!(error.category, DiagnosticCategory::InvalidInput);
        fixture.assert_no_leaked_paths(&error.to_string());
        assert_eq!(fixture.note_ids(), ["original-note"]);
        let leaked_backups = fs::read_dir(fixture.directory.path())
            .expect("read directory")
            .flatten()
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .contains(super::SAFETY_BACKUP_PREFIX)
            })
            .count();
        assert_eq!(leaked_backups, 0);
    }

    #[test]
    fn rejects_invalid_archive_version_without_mutation() {
        let fixture = fixture();
        let archive_path = foreign_archive(&fixture.directory, "imported-note");
        let mut raw: serde_json::Value =
            serde_json::from_slice(&fs::read(&archive_path).expect("read archive"))
                .expect("parse archive");
        raw["archiveVersion"] = json!(99);
        fs::write(&archive_path, serde_json::to_vec(&raw).expect("serialize")).expect("rewrite");

        let error = fixture
            .coordinator
            .import_archive(&archive_path)
            .expect_err("invalid archive must be rejected");

        assert_eq!(error.category, DiagnosticCategory::InvalidInput);
        assert_eq!(fixture.note_ids(), ["original-note"]);
    }

    #[test]
    fn imports_archive_with_safety_backup_before_mutation() {
        let fixture = fixture();
        let archive_path = foreign_archive(&fixture.directory, "imported-note");

        let report = fixture
            .coordinator
            .import_archive(&archive_path)
            .expect("import archive");

        assert_eq!(report.nodes, 1);
        assert_eq!(report.documents, 1);
        assert_eq!(report.snapshot.nodes[0].id, "imported-note");
        let safety_backup = fixture
            .database_path()
            .with_file_name(&report.safety_backup_file_name);
        let preserved =
            SqliteWorkspace::verify_database_file(&safety_backup).expect("verify safety backup");
        assert_eq!(preserved.nodes[0].id, "original-note");
        assert_eq!(fixture.note_ids(), ["imported-note"]);
        fixture.apply(create_note("post-import-note"));
        assert_eq!(fixture.note_ids().len(), 2);
    }

    #[test]
    fn cancelled_import_keeps_workspace_untouched_and_removes_safety_backup() {
        let fixture = fixture();
        let archive_path = foreign_archive(&fixture.directory, "imported-note");

        let error = fixture
            .coordinator
            .import_archive_gated(&archive_path, |coordinator| {
                coordinator.cancel.store(true, Ordering::Relaxed);
            })
            .expect_err("cancelled import must fail");

        assert_eq!(error.category, DiagnosticCategory::Unavailable);
        assert_eq!(fixture.note_ids(), ["original-note"]);
        let leaked_backups = fs::read_dir(fixture.directory.path())
            .expect("read directory")
            .flatten()
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .contains(super::SAFETY_BACKUP_PREFIX)
            })
            .count();
        assert_eq!(leaked_backups, 0);
        fixture.apply(create_note("post-cancel-note"));
        assert_eq!(fixture.note_ids().len(), 2);
    }

    #[test]
    fn rotates_backups_with_cadence_and_lists_recovery_inventory() {
        let fixture = fixture();

        let first = fixture
            .coordinator
            .rotate_backups(false)
            .expect("first rotation");
        assert_eq!(first.status, "created");
        let second = fixture
            .coordinator
            .rotate_backups(false)
            .expect("second rotation");
        assert_eq!(second.status, "skipped");
        assert!(second.next_due_at.is_some());
        let forced = fixture
            .coordinator
            .rotate_backups(true)
            .expect("forced rotation");
        assert_eq!(forced.status, "created");

        let inventory = fixture
            .coordinator
            .recovery_inventory()
            .expect("recovery inventory");
        let manifest = inventory.manifest.expect("manifest");
        assert_eq!(manifest.artifacts.len(), 2);
        assert!(manifest.artifacts.iter().all(|artifact| artifact.verified));
        assert!(inventory.rollbacks.is_empty());
    }

    #[test]
    fn restore_replaces_live_database_and_bootstraps_after_swap() {
        let fixture = fixture();
        let created = fixture
            .coordinator
            .rotate_backups(true)
            .expect("create backup");
        let artifact = created.artifact_file_name.expect("artifact file name");
        fixture.apply(create_note("post-backup-note"));
        assert_eq!(fixture.note_ids().len(), 2);

        let report = fixture
            .coordinator
            .restore_backup(&artifact)
            .expect("restore backup");

        assert_eq!(report.status, "replaced");
        assert_eq!(report.snapshot.nodes.len(), 1);
        assert_eq!(report.snapshot.nodes[0].id, "original-note");
        let rollback_file_name = report.rollback_file_name.expect("rollback file name");
        let rollback = fixture.database_path().with_file_name(&rollback_file_name);
        let preserved =
            SqliteWorkspace::verify_database_file(&rollback).expect("verify rollback artifact");
        assert_eq!(preserved.nodes.len(), 2);
        let inventory = fixture
            .coordinator
            .recovery_inventory()
            .expect("recovery inventory");
        assert_eq!(inventory.rollbacks.len(), 1);
        assert_eq!(inventory.rollbacks[0].file_name, rollback_file_name);
        assert_eq!(fixture.note_ids(), ["original-note"]);
        fixture.apply(create_note("post-swap-note"));
        assert_eq!(fixture.note_ids().len(), 2);
    }

    #[test]
    fn failed_swap_rolls_back_and_reopens_original() {
        let fixture = fixture();
        let created = fixture
            .coordinator
            .rotate_backups(true)
            .expect("create backup");
        let artifact = created.artifact_file_name.expect("artifact file name");

        let report = fixture
            .coordinator
            .restore_backup_gated(&artifact, |stage| {
                if stage == DatabaseSwapStage::VerifyReplacement {
                    Err("injected replacement verification failure".into())
                } else {
                    Ok(())
                }
            })
            .expect("rolled-back restore still reopens");

        assert_eq!(report.status, "rolledBack");
        assert_eq!(report.snapshot.nodes[0].id, "original-note");
        let failure = report.failure.expect("failure diagnostic");
        fixture.assert_no_leaked_paths(&failure);
        let leftovers = fs::read_dir(fixture.directory.path())
            .expect("read directory")
            .flatten()
            .filter(|entry| {
                let name = entry.file_name().to_string_lossy().into_owned();
                name.contains(super::CANDIDATE_PREFIX) || name.contains(super::ROLLBACK_PREFIX)
            })
            .count();
        assert_eq!(leftovers, 0);
        assert_eq!(fixture.note_ids(), ["original-note"]);
        fixture.apply(create_note("post-rollback-note"));
        assert_eq!(fixture.note_ids().len(), 2);
    }

    #[test]
    fn cancelled_swap_reopens_original_workspace() {
        let fixture = fixture();
        let created = fixture
            .coordinator
            .rotate_backups(true)
            .expect("create backup");
        let artifact = created.artifact_file_name.expect("artifact file name");
        let cancel = std::sync::Arc::clone(&fixture.coordinator.cancel);

        let report = fixture
            .coordinator
            .restore_backup_gated(&artifact, move |stage| {
                if stage == DatabaseSwapStage::VerifyOriginal {
                    cancel.store(true, Ordering::Relaxed);
                }
                Ok(())
            })
            .expect("cancelled restore still reopens");

        assert_eq!(report.status, "rolledBack");
        let failure = report.failure.expect("failure diagnostic");
        fixture.assert_no_leaked_paths(&failure);
        assert_eq!(fixture.note_ids(), ["original-note"]);
    }

    #[test]
    fn restore_rejects_artifacts_outside_the_manifest() {
        let fixture = fixture();

        let missing_manifest = fixture
            .coordinator
            .restore_backup("skriuw-backup-1.sqlite")
            .expect_err("restore without manifest must fail");
        assert_eq!(missing_manifest.category, DiagnosticCategory::NotFound);

        fixture
            .coordinator
            .rotate_backups(true)
            .expect("create backup");
        let unknown = fixture
            .coordinator
            .restore_backup("../workspace.db")
            .expect_err("unlisted artifact must be rejected");
        assert_eq!(unknown.category, DiagnosticCategory::InvalidInput);
        fixture.assert_no_leaked_paths(&unknown.to_string());
        assert_eq!(fixture.note_ids(), ["original-note"]);
    }

    #[test]
    fn concurrent_maintenance_operations_are_rejected() {
        let fixture = fixture();
        let guard = fixture.coordinator.begin("test").expect("begin operation");
        assert_eq!(fixture.coordinator.status(), Some("test"));

        let error = fixture
            .coordinator
            .rotate_backups(true)
            .expect_err("overlapping maintenance must be rejected");
        assert_eq!(error.category, DiagnosticCategory::Conflict);

        drop(guard);
        assert_eq!(fixture.coordinator.status(), None);
        assert!(!fixture.coordinator.cancel_active_operation());
        fixture
            .coordinator
            .rotate_backups(true)
            .expect("rotation after release");
    }

    fn shared_fixture() -> (TempDir, std::sync::Arc<MaintenanceCoordinator>) {
        let fixture = fixture();
        let Fixture {
            directory,
            coordinator,
        } = fixture;
        (directory, std::sync::Arc::new(coordinator))
    }

    fn wait_for_artifacts(coordinator: &MaintenanceCoordinator, expected: usize) -> Vec<String> {
        for _ in 0..200 {
            let inventory = coordinator.recovery_inventory().expect("inventory");
            let artifacts: Vec<String> = inventory
                .manifest
                .map(|manifest| {
                    manifest
                        .artifacts
                        .into_iter()
                        .map(|artifact| artifact.filename)
                        .collect()
                })
                .unwrap_or_default();
            if artifacts.len() >= expected {
                return artifacts;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        panic!("rotation never produced {expected} artifact(s)");
    }

    #[test]
    fn scheduled_rotation_backs_up_once_and_shuts_down_promptly() {
        let (_directory, coordinator) = shared_fixture();
        let scheduler = super::spawn_backup_rotation(
            std::sync::Arc::clone(&coordinator),
            Duration::from_millis(10),
        )
        .expect("spawn rotation");

        let artifacts = wait_for_artifacts(&coordinator, 1);
        assert_eq!(artifacts.len(), 1);
        std::thread::sleep(Duration::from_millis(150));
        assert_eq!(wait_for_artifacts(&coordinator, 1).len(), 1);

        let started = std::time::Instant::now();
        scheduler.shutdown();
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "shutdown must interrupt the six-hour wait"
        );
        assert_eq!(coordinator.status(), None);
    }

    #[test]
    fn scheduled_rotation_retries_after_conflicting_maintenance() {
        let (_directory, coordinator) = shared_fixture();
        let guard = coordinator.begin("test").expect("begin operation");

        let scheduler = super::spawn_backup_rotation(
            std::sync::Arc::clone(&coordinator),
            Duration::from_millis(10),
        )
        .expect("spawn rotation");
        std::thread::sleep(Duration::from_millis(100));
        assert!(
            coordinator
                .recovery_inventory()
                .expect("inventory")
                .manifest
                .is_none(),
            "rotation must not run while another operation holds the guard"
        );

        drop(guard);
        assert_eq!(wait_for_artifacts(&coordinator, 1).len(), 1);
        scheduler.shutdown();
    }

    #[test]
    fn rotation_delay_clamps_between_retry_and_cadence() {
        let cadence = Duration::from_secs(60);
        let retry = Duration::from_secs(5);
        assert_eq!(
            super::rotation_delay(Some(1_000), 0, cadence, retry),
            Duration::from_secs(1)
        );
        assert_eq!(
            super::rotation_delay(Some(i64::MAX), 0, cadence, retry),
            cadence
        );
        assert_eq!(super::rotation_delay(Some(100), 200, cadence, retry), retry);
        assert_eq!(super::rotation_delay(None, 0, cadence, retry), cadence);
    }
}
