use std::{
    collections::{BTreeMap, BTreeSet},
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

use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use serde::Serialize;
use skriuw_domain::{
    HistoryHeader, WorkspaceArchive, WorkspaceImage, WorkspaceOperation,
    WorkspaceOperationEnvelope, WorkspaceSnapshot,
};
use skriuw_history::{HistoryWorkResult, HistoryWorker};
use skriuw_history_git::GitHistoryMaterializer;
use skriuw_images::ImageStore;
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
const HISTORY_DRAIN_BATCH_ITEMS: usize = 64;
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
                let mut idle = false;
                for _ in 0..HISTORY_DRAIN_BATCH_ITEMS {
                    if stop_flag.load(Ordering::Relaxed) {
                        break;
                    }
                    match worker.process_next(now_millis(), HISTORY_DRAIN_LEASE_MS) {
                        Ok(HistoryWorkResult::Materialized { header, .. }) => publish(header),
                        Ok(HistoryWorkResult::Idle) => {
                            idle = true;
                            break;
                        }
                        Err(error) => {
                            eprintln!("history drain failed: {error}");
                            idle = true;
                            break;
                        }
                    }
                }
                if idle {
                    thread::sleep(HISTORY_DRAIN_IDLE_DELAY);
                } else {
                    thread::yield_now();
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
    pub images: usize,
    pub exported_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveImportReport {
    pub nodes: usize,
    pub documents: usize,
    pub images: usize,
    pub safety_backup_file_name: String,
    pub snapshot: WorkspaceSnapshot,
}

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveImageBlob {
    content_hash: String,
    mime_type: String,
    bytes_base64: String,
}

#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopArchive {
    #[serde(flatten)]
    workspace: WorkspaceArchive,
    #[serde(default)]
    images: Vec<WorkspaceImage>,
    #[serde(default)]
    image_blobs: Vec<ArchiveImageBlob>,
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
pub struct RelocationReport {
    pub copied_files: usize,
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
        let images = storage.bootstrap().map_err(recovery_error)?.images;
        drop(storage);
        self.check_cancelled()?;
        let image_store = ImageStore::open(self.blob_directory()).map_err(image_store_error)?;
        let mut blobs = BTreeMap::new();
        for image in &images {
            let key = (image.content_hash.clone(), image.mime_type.clone());
            if blobs.contains_key(&key) {
                continue;
            }
            let bytes = image_store
                .read(&image.content_hash, &image.mime_type)
                .map_err(image_store_error)?;
            if bytes.len() as i64 != image.byte_size {
                return Err(Diagnostic::new(
                    DiagnosticContext::Recovery,
                    DiagnosticCategory::InvalidInput,
                    "workspace image blob does not match its stored metadata",
                ));
            }
            blobs.insert(key, BASE64.encode(bytes));
        }
        let desktop_archive = DesktopArchive {
            workspace: archive.clone(),
            images,
            image_blobs: blobs
                .into_iter()
                .map(|((content_hash, mime_type), bytes_base64)| ArchiveImageBlob {
                    content_hash,
                    mime_type,
                    bytes_base64,
                })
                .collect(),
        };
        let mut bytes = serde_json::to_vec_pretty(&desktop_archive)
            .map_err(|_| internal("workspace archive could not be serialized"))?;
        bytes.push(b'\n');
        write_new_file(target, &bytes)?;
        Ok(ArchiveExportReport {
            nodes: archive.nodes.len(),
            documents: archive.documents.len(),
            images: desktop_archive.images.len(),
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
        let desktop_archive = serde_json::from_slice::<DesktopArchive>(&raw).map_err(|_| {
            Diagnostic::new(
                DiagnosticContext::Recovery,
                DiagnosticCategory::InvalidInput,
                "workspace archive is not valid JSON",
            )
        })?;
        desktop_archive.workspace.validate().map_err(|_| {
            Diagnostic::new(
                DiagnosticContext::Recovery,
                DiagnosticCategory::InvalidInput,
                "workspace archive is invalid",
            )
        })?;
        self.validate_desktop_archive(&desktop_archive)?;
        self.restore_archive_image_blobs(&desktop_archive)?;
        self.check_cancelled()?;

        self.stop_active_workspace()?;
        let result = self.import_into_stopped_workspace(&desktop_archive, after_safety_backup);
        if result.is_err() {
            self.reopen_workspace_after_failure();
        }
        result
    }

    fn import_into_stopped_workspace(
        &self,
        desktop_archive: &DesktopArchive,
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
            .replace_from_archive(&desktop_archive.workspace)
            .map_err(recovery_error)?;
        let image_operations = desktop_archive.images.iter().cloned().map(|image| {
            WorkspaceOperationEnvelope::v1(WorkspaceOperation::AttachImage { image })
        });
        storage
            .apply_operations(&image_operations.collect::<Vec<_>>())
            .map_err(recovery_error)?;
        let snapshot = storage.bootstrap().map_err(recovery_error)?;
        self.publish_workspace(WorkspaceRuntime::spawn(storage))?;
        Ok(ArchiveImportReport {
            nodes: summary.nodes,
            documents: summary.documents,
            images: desktop_archive.images.len(),
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
            } => {
                self.copy_backup_images(&artifact.filename)?;
                for filename in &pruned {
                    let _ = fs::remove_dir_all(backup_blob_directory(&self.recovery_directory, filename));
                }
                BackupRotationReport {
                    status: "created",
                    artifact_file_name: Some(artifact.filename),
                    pruned: pruned.len(),
                    next_due_at: None,
                }
            }
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
        let candidate_images = SqliteWorkspace::verify_database_file(&candidate)
            .map_err(recovery_error)?
            .images;
        if let Err(error) = self.restore_backup_images(artifact_file_name, &candidate_images) {
            let _ = fs::remove_file(&candidate);
            return Err(error);
        }
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

    /// Copies the workspace database plus the `blobs`, `history`, and
    /// `recovery` sidecar directories into `target_directory`, then runs
    /// `finalize` (the caller persists the new location there). On success the
    /// workspace is left stopped: the caller must restart the process so every
    /// component reopens at the new location. On any failure the original
    /// workspace is reopened and nothing is switched over.
    pub fn relocate_to(
        &self,
        target_directory: &Path,
        finalize: impl FnOnce() -> Result<(), String>,
    ) -> Result<RelocationReport, Diagnostic> {
        let _operation = self.begin("relocate")?;
        let database_name = database_file_name(&self.database_path)?;
        fs::create_dir_all(target_directory)
            .map_err(|_| relocation_error("target directory could not be created"))?;
        let source_directory = self.database_path.parent().unwrap_or(Path::new("."));
        if let (Ok(source), Ok(target)) = (
            fs::canonicalize(source_directory),
            fs::canonicalize(target_directory),
        ) && source == target
        {
            return Err(Diagnostic::new(
                DiagnosticContext::Recovery,
                DiagnosticCategory::InvalidInput,
                "target directory is already the storage location",
            ));
        }
        let target_database = target_directory.join(&database_name);
        if fs::symlink_metadata(&target_database).is_ok() {
            return Err(Diagnostic::new(
                DiagnosticContext::Recovery,
                DiagnosticCategory::AlreadyExists,
                "target directory already contains a workspace database",
            ));
        }
        self.check_cancelled()?;

        self.stop_active_workspace()?;
        let result = self.copy_workspace_into(target_directory, &target_database, finalize);
        if result.is_err() {
            self.reopen_workspace_after_failure();
        }
        result
    }

    fn copy_workspace_into(
        &self,
        target_directory: &Path,
        target_database: &Path,
        finalize: impl FnOnce() -> Result<(), String>,
    ) -> Result<RelocationReport, Diagnostic> {
        let storage = SqliteWorkspace::open(&self.database_path).map_err(recovery_error)?;
        storage
            .backup_to(target_database)
            .map_err(|error| error.diagnostic(DiagnosticContext::Backup))?;
        drop(storage);
        let mut copied_files = 1;
        let source_directory = self.database_path.parent().unwrap_or(Path::new("."));
        for sidecar in ["blobs", "history", "recovery"] {
            let source = source_directory.join(sidecar);
            if source.is_dir() {
                copied_files += copy_directory(&source, &target_directory.join(sidecar))?;
            }
        }
        if let Err(cancelled) = self.check_cancelled() {
            let _ = fs::remove_file(target_database);
            return Err(cancelled);
        }
        finalize().map_err(|_| relocation_error("new storage location could not be recorded"))?;
        Ok(RelocationReport { copied_files })
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

    fn blob_directory(&self) -> PathBuf {
        self.database_path
            .parent()
            .unwrap_or(Path::new("."))
            .join("blobs")
    }

    fn validate_desktop_archive(&self, archive: &DesktopArchive) -> Result<(), Diagnostic> {
        let note_ids = archive
            .workspace
            .nodes
            .iter()
            .filter(|node| node.kind == skriuw_domain::NodeKind::Note)
            .map(|node| node.id.as_str())
            .collect::<BTreeSet<_>>();
        let mut blob_keys = BTreeSet::new();
        let image_owners = archive
            .images
            .iter()
            .map(|image| (image.id.as_str(), image.note_id.as_str()))
            .collect::<BTreeSet<_>>();
        for blob in &archive.image_blobs {
            let key = (blob.content_hash.as_str(), blob.mime_type.as_str());
            if !blob_keys.insert(key) || BASE64.decode(&blob.bytes_base64).is_err() {
                return Err(Diagnostic::new(
                    DiagnosticContext::Recovery,
                    DiagnosticCategory::InvalidInput,
                    "workspace archive has invalid image data",
                ));
            }
        }
        for image in &archive.images {
            image.validate().map_err(|_| {
                Diagnostic::new(
                    DiagnosticContext::Recovery,
                    DiagnosticCategory::InvalidInput,
                    "workspace archive has invalid image metadata",
                )
            })?;
            if !note_ids.contains(image.note_id.as_str())
                || !blob_keys.contains(&(image.content_hash.as_str(), image.mime_type.as_str()))
            {
                return Err(Diagnostic::new(
                    DiagnosticContext::Recovery,
                    DiagnosticCategory::InvalidInput,
                    "workspace archive is missing image data",
                ));
            }
        }
        for node in &archive.workspace.nodes {
            if let Some(cover_image_id) = node.cover_image_id.as_deref()
                && !image_owners.contains(&(cover_image_id, node.id.as_str()))
            {
                return Err(Diagnostic::new(
                    DiagnosticContext::Recovery,
                    DiagnosticCategory::InvalidInput,
                    "workspace archive is missing cover image data",
                ));
            }
        }
        Ok(())
    }

    fn restore_archive_image_blobs(&self, archive: &DesktopArchive) -> Result<(), Diagnostic> {
        if archive.images.is_empty() {
            return Ok(());
        }
        let expected_sizes = archive
            .images
            .iter()
            .map(|image| {
                (
                    (image.content_hash.as_str(), image.mime_type.as_str()),
                    image.byte_size,
                )
            })
            .collect::<BTreeMap<_, _>>();
        let image_store = ImageStore::open(self.blob_directory()).map_err(image_store_error)?;
        for blob in &archive.image_blobs {
            let bytes = BASE64.decode(&blob.bytes_base64).map_err(|_| {
                Diagnostic::new(
                    DiagnosticContext::Recovery,
                    DiagnosticCategory::InvalidInput,
                    "workspace archive has invalid image data",
                )
            })?;
            let stored = image_store.put(&bytes).map_err(image_store_error)?;
            if stored.content_hash != blob.content_hash
                || stored.mime_type != blob.mime_type
                || expected_sizes
                    .get(&(blob.content_hash.as_str(), blob.mime_type.as_str()))
                    .is_some_and(|size| *size != stored.byte_size as i64)
            {
                return Err(Diagnostic::new(
                    DiagnosticContext::Recovery,
                    DiagnosticCategory::InvalidInput,
                    "workspace archive image data does not match its metadata",
                ));
            }
        }
        Ok(())
    }

    fn copy_backup_images(&self, artifact_file_name: &str) -> Result<(), Diagnostic> {
        let backup_database = self.recovery_directory.join(artifact_file_name);
        let images = SqliteWorkspace::verify_database_file(&backup_database)
            .map_err(recovery_error)?
            .images;
        let target = backup_blob_directory(&self.recovery_directory, artifact_file_name);
        if fs::symlink_metadata(&target).is_ok() {
            return Err(Diagnostic::new(
                DiagnosticContext::Backup,
                DiagnosticCategory::AlreadyExists,
                "backup image data already exists",
            ));
        }
        let temporary = target.with_file_name(format!(
            ".{}.partial",
            target.file_name().and_then(|name| name.to_str()).unwrap_or("backup-images")
        ));
        let result = (|| {
            let source = ImageStore::open(self.blob_directory()).map_err(image_store_error)?;
            let destination = ImageStore::open(&temporary).map_err(image_store_error)?;
            let mut copied = BTreeSet::new();
            for image in images {
                let key = (image.content_hash.clone(), image.mime_type.clone());
                if !copied.insert(key) {
                    continue;
                }
                let bytes = source
                    .read(&image.content_hash, &image.mime_type)
                    .map_err(image_store_error)?;
                let stored = destination.put(&bytes).map_err(image_store_error)?;
                if stored.content_hash != image.content_hash
                    || stored.mime_type != image.mime_type
                    || stored.byte_size as i64 != image.byte_size
                {
                    return Err(Diagnostic::new(
                        DiagnosticContext::Backup,
                        DiagnosticCategory::InvalidInput,
                        "workspace image blob does not match its stored metadata",
                    ));
                }
            }
            fs::rename(&temporary, &target).map_err(|_| {
                Diagnostic::new(
                    DiagnosticContext::Backup,
                    DiagnosticCategory::Backend,
                    "backup image data could not be published",
                )
            })
        })();
        if result.is_err() {
            let _ = fs::remove_dir_all(&temporary);
        }
        result
    }

    fn restore_backup_images(
        &self,
        artifact_file_name: &str,
        images: &[WorkspaceImage],
    ) -> Result<(), Diagnostic> {
        if images.is_empty() {
            return Ok(());
        }
        let source_directory = backup_blob_directory(&self.recovery_directory, artifact_file_name);
        if !source_directory.is_dir() {
            return Err(Diagnostic::new(
                DiagnosticContext::Recovery,
                DiagnosticCategory::NotFound,
                "backup image data is unavailable",
            ));
        }
        let source = ImageStore::open(source_directory).map_err(image_store_error)?;
        let destination = ImageStore::open(self.blob_directory()).map_err(image_store_error)?;
        let mut copied = BTreeSet::new();
        for image in images {
            let key = (image.content_hash.clone(), image.mime_type.clone());
            if !copied.insert(key) {
                continue;
            }
            let bytes = source
                .read(&image.content_hash, &image.mime_type)
                .map_err(|_| {
                    Diagnostic::new(
                        DiagnosticContext::Recovery,
                        DiagnosticCategory::NotFound,
                        "backup image data is incomplete",
                    )
                })?;
            let stored = destination.put(&bytes).map_err(image_store_error)?;
            if stored.content_hash != image.content_hash
                || stored.mime_type != image.mime_type
                || stored.byte_size as i64 != image.byte_size
            {
                return Err(Diagnostic::new(
                    DiagnosticContext::Recovery,
                    DiagnosticCategory::InvalidInput,
                    "backup image data does not match its stored metadata",
                ));
            }
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

fn copy_directory(source: &Path, target: &Path) -> Result<usize, Diagnostic> {
    fs::create_dir_all(target)
        .map_err(|_| relocation_error("workspace files could not be copied"))?;
    let mut copied = 0;
    let entries = fs::read_dir(source)
        .map_err(|_| relocation_error("workspace files could not be copied"))?;
    for entry in entries {
        let entry = entry.map_err(|_| relocation_error("workspace files could not be copied"))?;
        let file_type = entry
            .file_type()
            .map_err(|_| relocation_error("workspace files could not be copied"))?;
        let destination = target.join(entry.file_name());
        if file_type.is_dir() {
            copied += copy_directory(&entry.path(), &destination)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &destination)
                .map_err(|_| relocation_error("workspace files could not be copied"))?;
            copied += 1;
        }
    }
    Ok(copied)
}

fn relocation_error(message: &str) -> Diagnostic {
    Diagnostic::new(
        DiagnosticContext::Recovery,
        DiagnosticCategory::Backend,
        message,
    )
}

fn database_file_name(path: &Path) -> Result<String, Diagnostic> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .ok_or_else(|| internal("database path has no file name"))
}

fn backup_blob_directory(recovery_directory: &Path, artifact_file_name: &str) -> PathBuf {
    recovery_directory.join(format!("{artifact_file_name}.blobs"))
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

fn image_store_error(_error: skriuw_images::ImageStoreError) -> Diagnostic {
    Diagnostic::new(
        DiagnosticContext::Recovery,
        DiagnosticCategory::Backend,
        "workspace image data could not be accessed",
    )
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
        NodePlacement, WorkspaceArchive, WorkspaceImage, WorkspaceOperation,
        WorkspaceOperationEnvelope,
    };
    use skriuw_images::ImageStore;
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

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nimage";

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

        fn attach_image(&self, note_id: &str) -> WorkspaceImage {
            let stored = ImageStore::open(self.directory.path().join("blobs"))
                .expect("open image store")
                .put(PNG)
                .expect("store image");
            let image = WorkspaceImage {
                id: "image-1".into(),
                note_id: note_id.into(),
                content_hash: stored.content_hash,
                mime_type: stored.mime_type.into(),
                byte_size: stored.byte_size as i64,
                width: None,
                height: None,
                created_at: test_now(),
            };
            self.apply(WorkspaceOperationEnvelope::v1(WorkspaceOperation::AttachImage {
                image: image.clone(),
            }));
            image
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
    fn archive_round_trips_image_metadata_and_blob_data() {
        let source = fixture();
        let image = source.attach_image("original-note");
        source.apply(WorkspaceOperationEnvelope::v1(
            WorkspaceOperation::SetNoteCover {
                note_id: "original-note".into(),
                image_id: Some(image.id.clone()),
                at: test_now(),
            },
        ));
        let archive_path = source.directory.path().join("export.json");
        source
            .coordinator
            .export_archive(&archive_path)
            .expect("export archive");
        let desktop = serde_json::from_slice::<super::DesktopArchive>(
            &fs::read(&archive_path).expect("read archive"),
        )
        .expect("parse desktop archive");
        assert_eq!(desktop.images, [image.clone()]);
        assert_eq!(desktop.image_blobs.len(), 1);

        let destination = fixture();
        destination
            .coordinator
            .import_archive(&archive_path)
            .expect("import archive");
        let snapshot = destination
            .coordinator
            .runtime()
            .expect("runtime")
            .bootstrap()
            .expect("bootstrap")
            .wait()
            .expect("snapshot");
        assert_eq!(snapshot.images, [image.clone()]);
        assert_eq!(
            snapshot.nodes[0].cover_image_id.as_deref(),
            Some(image.id.as_str())
        );
        assert_eq!(
            ImageStore::open(destination.directory.path().join("blobs"))
                .expect("open destination image store")
                .read(&image.content_hash, &image.mime_type)
                .expect("restored image"),
            PNG
        );
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
    fn backup_restore_recovers_image_blobs() {
        let fixture = fixture();
        let image = fixture.attach_image("original-note");
        let backup = fixture
            .coordinator
            .rotate_backups(true)
            .expect("create backup");
        let artifact = backup.artifact_file_name.expect("backup artifact");
        assert!(super::backup_blob_directory(&fixture.directory.path().join("recovery"), &artifact).is_dir());
        let image_store = ImageStore::open(fixture.directory.path().join("blobs"))
            .expect("open image store");
        image_store
            .delete(&image.content_hash, &image.mime_type)
            .expect("remove live image");

        fixture
            .coordinator
            .restore_backup(&artifact)
            .expect("restore backup");
        assert_eq!(
            ImageStore::open(fixture.directory.path().join("blobs"))
                .expect("reopen image store")
                .read(&image.content_hash, &image.mime_type)
                .expect("restored image"),
            PNG
        );
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
    fn relocate_copies_workspace_sidecars_and_records_new_location() {
        let fixture = fixture();
        fs::create_dir_all(fixture.directory.path().join("blobs")).expect("create blobs");
        fs::write(fixture.directory.path().join("blobs/blob.png"), b"blob").expect("write blob");
        fixture
            .coordinator
            .rotate_backups(true)
            .expect("create backup");
        let target = fixture.directory.path().join("moved");
        let recorded = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = Arc::clone(&recorded);

        let report = fixture
            .coordinator
            .relocate_to(&target, move || {
                flag.store(true, Ordering::Relaxed);
                Ok(())
            })
            .expect("relocate workspace");

        assert!(recorded.load(Ordering::Relaxed));
        assert!(report.copied_files >= 3);
        let moved = SqliteWorkspace::verify_database_file(target.join("workspace.db"))
            .expect("verify moved database");
        assert_eq!(moved.nodes[0].id, "original-note");
        assert_eq!(
            fs::read(target.join("blobs/blob.png")).expect("read blob copy"),
            b"blob"
        );
        assert!(target.join("recovery").is_dir());
        assert!(fixture.database_path().exists(), "original must be kept");
    }

    #[test]
    fn relocate_rejects_current_location_and_occupied_targets() {
        let fixture = fixture();

        let same = fixture
            .coordinator
            .relocate_to(fixture.directory.path(), || Ok(()))
            .expect_err("current location must be rejected");
        assert_eq!(same.category, DiagnosticCategory::InvalidInput);
        fixture.assert_no_leaked_paths(&same.to_string());

        let occupied = fixture.directory.path().join("occupied");
        fs::create_dir_all(&occupied).expect("create occupied");
        fs::write(occupied.join("workspace.db"), b"existing").expect("write existing");
        let error = fixture
            .coordinator
            .relocate_to(&occupied, || Ok(()))
            .expect_err("occupied target must be rejected");
        assert_eq!(error.category, DiagnosticCategory::AlreadyExists);
        fixture.assert_no_leaked_paths(&error.to_string());

        assert_eq!(fixture.note_ids(), ["original-note"]);
    }

    #[test]
    fn failed_relocation_finalize_reopens_original_workspace() {
        let fixture = fixture();
        let target = fixture.directory.path().join("moved");

        let error = fixture
            .coordinator
            .relocate_to(&target, || Err("pointer write failed".into()))
            .expect_err("finalize failure must fail relocation");

        assert_eq!(error.category, DiagnosticCategory::Backend);
        fixture.assert_no_leaked_paths(&error.to_string());
        assert_eq!(fixture.note_ids(), ["original-note"]);
        fixture.apply(create_note("post-relocate-note"));
        assert_eq!(fixture.note_ids().len(), 2);
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
