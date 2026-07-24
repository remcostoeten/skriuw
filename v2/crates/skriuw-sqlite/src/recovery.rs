use std::{
    cmp::Reverse,
    collections::BTreeSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use skriuw_storage::StorageError;
use uuid::Uuid;

use super::{SqliteWorkspace, backend, read_migrations, verify_database};

pub const RECOVERY_MANIFEST_VERSION: u16 = 1;
const MANIFEST_PREFIX: &str = "recovery-manifest-";
const MANIFEST_SUFFIX: &str = ".json";
const ARTIFACT_PREFIX: &str = "skriuw-backup-";
const ARTIFACT_SUFFIX: &str = ".sqlite";
const MAX_RETENTION_ARTIFACTS: usize = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupRetentionPolicy {
    pub cadence_ms: i64,
    pub max_artifacts: usize,
    pub max_age_ms: i64,
}

impl Default for BackupRetentionPolicy {
    fn default() -> Self {
        Self {
            cadence_ms: 6 * 60 * 60 * 1_000,
            max_artifacts: 28,
            max_age_ms: 30 * 24 * 60 * 60 * 1_000,
        }
    }
}

impl BackupRetentionPolicy {
    fn validate(self) -> Result<(), StorageError> {
        if self.cadence_ms <= 0 || self.max_age_ms <= 0 {
            return Err(StorageError::InvalidOperation(
                "backup cadence and maximum age must be positive".into(),
            ));
        }
        if self.max_artifacts == 0 || self.max_artifacts > MAX_RETENTION_ARTIFACTS {
            return Err(StorageError::InvalidOperation(format!(
                "backup artifact count must be between 1 and {MAX_RETENTION_ARTIFACTS}"
            )));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryArtifact {
    pub filename: String,
    pub created_at: i64,
    pub size_bytes: u64,
    pub sha256: String,
    pub schema_version: i64,
    pub migration_fingerprint: String,
    pub verified: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryManifest {
    pub manifest_version: u16,
    pub generated_at: i64,
    pub policy: BackupRetentionPolicy,
    pub artifacts: Vec<RecoveryArtifact>,
    pub pending_deletions: Vec<RecoveryArtifact>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackupRotationOutcome {
    Skipped {
        next_due_at: i64,
    },
    Created {
        artifact: RecoveryArtifact,
        manifest_filename: String,
        pruned: Vec<String>,
    },
}

impl SqliteWorkspace {
    pub fn create_scheduled_backup(
        &self,
        directory: impl AsRef<Path>,
        now_ms: i64,
        policy: BackupRetentionPolicy,
    ) -> Result<BackupRotationOutcome, StorageError> {
        if now_ms < 0 {
            return Err(StorageError::InvalidOperation(
                "backup time cannot be negative".into(),
            ));
        }
        policy.validate()?;
        let _gate = self
            .recovery_gate
            .lock()
            .map_err(|_| StorageError::Backend("backup rotation lock poisoned".into()))?;
        let directory = prepare_directory(directory.as_ref())?;
        let previous = load_latest_manifest(&directory)?;
        if let Some(manifest) = &previous {
            clear_pending_deletions(&directory, &manifest.pending_deletions)?;
            if let Some(latest) = manifest.artifacts.first() {
                let next_due_at = latest.created_at.saturating_add(policy.cadence_ms);
                if now_ms < next_due_at {
                    return Ok(BackupRotationOutcome::Skipped { next_due_at });
                }
            }
        }

        let filename = artifact_filename(now_ms);
        let target = directory.join(&filename);
        self.backup_to(&target)?;
        let artifact = match inspect_artifact(&target, now_ms) {
            Ok(artifact) => artifact,
            Err(error) => {
                let _ = fs::remove_file(&target);
                return Err(error);
            }
        };
        let mut candidates = previous
            .map(|manifest| manifest.artifacts)
            .unwrap_or_default();
        candidates.push(artifact.clone());
        candidates.sort_by(|left, right| {
            right
                .created_at
                .cmp(&left.created_at)
                .then_with(|| left.filename.cmp(&right.filename))
        });
        let cutoff = now_ms.saturating_sub(policy.max_age_ms);
        let mut retained = Vec::new();
        let mut pending_deletions = Vec::new();
        for candidate in candidates {
            let within_count = retained.len() < policy.max_artifacts;
            let within_age = candidate.created_at >= cutoff;
            if candidate.filename == artifact.filename || (within_count && within_age) {
                retained.push(candidate);
            } else {
                pending_deletions.push(candidate);
            }
        }
        let manifest = RecoveryManifest {
            manifest_version: RECOVERY_MANIFEST_VERSION,
            generated_at: now_ms,
            policy,
            artifacts: retained,
            pending_deletions: pending_deletions.clone(),
        };
        validate_manifest(&manifest)?;
        let manifest_filename = match publish_manifest(&directory, &manifest) {
            Ok(filename) => filename,
            Err(error) => {
                let _ = fs::remove_file(&target);
                return Err(error);
            }
        };
        clear_pending_deletions(&directory, &pending_deletions)?;
        prune_manifest_generations(&directory, &manifest_filename)?;
        Ok(BackupRotationOutcome::Created {
            artifact,
            manifest_filename,
            pruned: pending_deletions
                .into_iter()
                .map(|artifact| artifact.filename)
                .collect(),
        })
    }

    pub fn read_recovery_manifest(
        directory: impl AsRef<Path>,
    ) -> Result<Option<RecoveryManifest>, StorageError> {
        let directory = directory.as_ref();
        match fs::symlink_metadata(directory) {
            Ok(metadata) if metadata.file_type().is_dir() => load_latest_manifest(directory),
            Ok(_) => Err(StorageError::InvalidOperation(
                "recovery path must be a directory".into(),
            )),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(backend(error)),
        }
    }
}

fn prepare_directory(directory: &Path) -> Result<PathBuf, StorageError> {
    match fs::symlink_metadata(directory) {
        Ok(metadata) if metadata.file_type().is_dir() => {}
        Ok(_) => {
            return Err(StorageError::InvalidOperation(
                "recovery path must be a directory".into(),
            ));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir_all(directory).map_err(backend)?;
        }
        Err(error) => return Err(backend(error)),
    }
    let metadata = fs::symlink_metadata(directory).map_err(backend)?;
    if !metadata.file_type().is_dir() {
        return Err(StorageError::InvalidOperation(
            "recovery path must be a directory".into(),
        ));
    }
    Ok(directory.to_path_buf())
}

fn inspect_artifact(path: &Path, created_at: i64) -> Result<RecoveryArtifact, StorageError> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(backend)?;
    verify_database(&connection)?;
    let migrations = read_migrations(&connection)?;
    let schema_version = migrations.keys().next_back().copied().unwrap_or_default();
    let mut migration_hasher = Sha256::new();
    for (version, migration) in migrations {
        migration_hasher.update(version.to_le_bytes());
        migration_hasher.update([0]);
        migration_hasher.update(migration.name.as_bytes());
        migration_hasher.update([0]);
        migration_hasher.update(migration.checksum.as_bytes());
        migration_hasher.update([0]);
    }
    drop(connection);
    let metadata = fs::symlink_metadata(path).map_err(backend)?;
    if !metadata.file_type().is_file() {
        return Err(StorageError::InvalidOperation(
            "backup artifact must be a regular file".into(),
        ));
    }
    Ok(RecoveryArtifact {
        filename: artifact_filename(created_at),
        created_at,
        size_bytes: metadata.len(),
        sha256: file_sha256(path)?,
        schema_version,
        migration_fingerprint: format!("{:x}", migration_hasher.finalize()),
        verified: true,
    })
}

fn file_sha256(path: &Path) -> Result<String, StorageError> {
    let mut file = File::open(path).map_err(backend)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(backend)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn load_latest_manifest(directory: &Path) -> Result<Option<RecoveryManifest>, StorageError> {
    let mut candidates = manifest_candidates(directory)?;
    candidates.sort_by_key(|candidate| Reverse(candidate.0));
    let Some((generation, path)) = candidates.first() else {
        return Ok(None);
    };
    let raw = fs::read(path).map_err(backend)?;
    let manifest = serde_json::from_slice::<RecoveryManifest>(&raw)
        .map_err(|error| StorageError::Backend(format!("invalid recovery manifest: {error}")))?;
    validate_manifest(&manifest)?;
    if manifest.generated_at != *generation {
        return Err(StorageError::Backend(
            "recovery manifest generation does not match its filename".into(),
        ));
    }
    Ok(Some(manifest))
}

fn manifest_candidates(directory: &Path) -> Result<Vec<(i64, PathBuf)>, StorageError> {
    let mut candidates = Vec::new();
    for entry in fs::read_dir(directory).map_err(backend)? {
        let entry = entry.map_err(backend)?;
        let Some(filename) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let Some(generation) =
            parse_timestamped_filename(&filename, MANIFEST_PREFIX, MANIFEST_SUFFIX)
        else {
            continue;
        };
        let metadata = fs::symlink_metadata(entry.path()).map_err(backend)?;
        if !metadata.file_type().is_file() {
            return Err(StorageError::InvalidOperation(
                "recovery manifest must be a regular file".into(),
            ));
        }
        candidates.push((generation, entry.path()));
    }
    Ok(candidates)
}

fn validate_manifest(manifest: &RecoveryManifest) -> Result<(), StorageError> {
    if manifest.manifest_version != RECOVERY_MANIFEST_VERSION {
        return Err(StorageError::InvalidOperation(format!(
            "unsupported recovery manifest version {}",
            manifest.manifest_version
        )));
    }
    if manifest.generated_at < 0 {
        return Err(StorageError::InvalidOperation(
            "recovery manifest time cannot be negative".into(),
        ));
    }
    manifest.policy.validate()?;
    let mut filenames = BTreeSet::new();
    for artifact in manifest.artifacts.iter().chain(&manifest.pending_deletions) {
        if artifact.created_at < 0
            || artifact.created_at > manifest.generated_at
            || artifact.filename != artifact_filename(artifact.created_at)
            || artifact.size_bytes == 0
            || artifact.schema_version <= 0
            || !valid_sha256(&artifact.sha256)
            || !valid_sha256(&artifact.migration_fingerprint)
            || !artifact.verified
            || !filenames.insert(artifact.filename.clone())
        {
            return Err(StorageError::InvalidOperation(
                "recovery manifest contains an invalid artifact".into(),
            ));
        }
    }
    if !manifest
        .artifacts
        .windows(2)
        .all(|pair| pair[0].created_at >= pair[1].created_at)
    {
        return Err(StorageError::InvalidOperation(
            "recovery manifest artifacts are not ordered".into(),
        ));
    }
    Ok(())
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn publish_manifest(directory: &Path, manifest: &RecoveryManifest) -> Result<String, StorageError> {
    let filename = manifest_filename(manifest.generated_at);
    let target = directory.join(&filename);
    if fs::symlink_metadata(&target).is_ok() {
        return Err(StorageError::AlreadyExists(filename));
    }
    let temporary = directory.join(format!(".{filename}.{}.partial", Uuid::new_v4()));
    let result = (|| {
        let mut bytes = serde_json::to_vec_pretty(manifest).map_err(backend)?;
        bytes.push(b'\n');
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(backend)?;
        file.write_all(&bytes).map_err(backend)?;
        file.sync_all().map_err(backend)?;
        drop(file);
        fs::rename(&temporary, &target).map_err(backend)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map(|()| filename)
}

fn clear_pending_deletions(
    directory: &Path,
    pending: &[RecoveryArtifact],
) -> Result<(), StorageError> {
    for artifact in pending {
        let path = directory.join(&artifact.filename);
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(backend(error)),
        };
        if !metadata.file_type().is_file()
            || metadata.len() != artifact.size_bytes
            || file_sha256(&path)? != artifact.sha256
        {
            return Err(StorageError::Backend(format!(
                "refusing to prune changed recovery artifact {}",
                artifact.filename
            )));
        }
        fs::remove_file(path).map_err(backend)?;
    }
    Ok(())
}

fn prune_manifest_generations(
    directory: &Path,
    current_filename: &str,
) -> Result<(), StorageError> {
    let mut candidates = manifest_candidates(directory)?;
    candidates.sort_by_key(|candidate| Reverse(candidate.0));
    let mut valid_generations = 0;
    for (generation, path) in candidates {
        let owned = fs::read(&path)
            .ok()
            .and_then(|raw| serde_json::from_slice::<RecoveryManifest>(&raw).ok())
            .filter(|manifest| {
                manifest.generated_at == generation && validate_manifest(manifest).is_ok()
            })
            .is_some();
        if !owned {
            continue;
        }
        valid_generations += 1;
        if valid_generations <= 2
            || path.file_name().and_then(|value| value.to_str()) == Some(current_filename)
        {
            continue;
        }
        fs::remove_file(path).map_err(backend)?;
    }
    Ok(())
}

fn artifact_filename(created_at: i64) -> String {
    format!("{ARTIFACT_PREFIX}{created_at}{ARTIFACT_SUFFIX}")
}

fn manifest_filename(generated_at: i64) -> String {
    format!("{MANIFEST_PREFIX}{generated_at}{MANIFEST_SUFFIX}")
}

fn parse_timestamped_filename(filename: &str, prefix: &str, suffix: &str) -> Option<i64> {
    let value = filename.strip_prefix(prefix)?.strip_suffix(suffix)?;
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    value.parse().ok()
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        sync::{Arc, Barrier},
        thread,
    };

    use skriuw_storage::StorageError;
    use tempfile::tempdir;

    use super::{
        BackupRetentionPolicy, BackupRotationOutcome, MANIFEST_PREFIX, MANIFEST_SUFFIX,
        RECOVERY_MANIFEST_VERSION, SqliteWorkspace, artifact_filename,
    };

    fn policy(max_artifacts: usize, max_age_ms: i64) -> BackupRetentionPolicy {
        BackupRetentionPolicy {
            cadence_ms: 1,
            max_artifacts,
            max_age_ms,
        }
    }

    #[test]
    fn publishes_verified_artifact_before_manifest() {
        let directory = tempdir().expect("temporary directory");
        let storage = SqliteWorkspace::open_in_memory().expect("open database");

        let outcome = storage
            .create_scheduled_backup(directory.path(), 100, policy(3, 1_000))
            .expect("create scheduled backup");
        let BackupRotationOutcome::Created {
            artifact,
            manifest_filename,
            pruned,
        } = outcome
        else {
            panic!("expected created backup");
        };

        assert_eq!(artifact.filename, "skriuw-backup-100.sqlite");
        assert!(artifact.verified);
        assert!(artifact.size_bytes > 0);
        assert_eq!(artifact.sha256.len(), 64);
        assert_eq!(artifact.schema_version, 5);
        assert_eq!(artifact.migration_fingerprint.len(), 64);
        assert!(pruned.is_empty());
        assert_eq!(manifest_filename, "recovery-manifest-100.json");
        assert!(directory.path().join(&artifact.filename).is_file());
        assert!(directory.path().join(&manifest_filename).is_file());

        let manifest = SqliteWorkspace::read_recovery_manifest(directory.path())
            .expect("read manifest")
            .expect("manifest");
        assert_eq!(manifest.manifest_version, RECOVERY_MANIFEST_VERSION);
        assert_eq!(manifest.generated_at, 100);
        assert_eq!(manifest.artifacts, [artifact]);
        assert!(manifest.pending_deletions.is_empty());
    }

    #[test]
    fn skips_backups_until_cadence_is_due() {
        let directory = tempdir().expect("temporary directory");
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        let policy = BackupRetentionPolicy {
            cadence_ms: 10,
            max_artifacts: 3,
            max_age_ms: 1_000,
        };
        storage
            .create_scheduled_backup(directory.path(), 100, policy)
            .expect("create first backup");
        let before = filenames(directory.path());

        let outcome = storage
            .create_scheduled_backup(directory.path(), 109, policy)
            .expect("skip backup");

        assert_eq!(outcome, BackupRotationOutcome::Skipped { next_due_at: 110 });
        assert_eq!(filenames(directory.path()), before);
    }

    #[test]
    fn prunes_only_manifest_owned_artifacts_by_count() {
        let directory = tempdir().expect("temporary directory");
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        for now in [10, 20, 30] {
            storage
                .create_scheduled_backup(directory.path(), now, policy(2, 1_000))
                .expect("rotate backup");
        }

        let manifest = SqliteWorkspace::read_recovery_manifest(directory.path())
            .expect("read manifest")
            .expect("manifest");
        assert_eq!(
            manifest
                .artifacts
                .iter()
                .map(|artifact| artifact.created_at)
                .collect::<Vec<_>>(),
            [30, 20]
        );
        assert_eq!(manifest.pending_deletions[0].created_at, 10);
        assert!(!directory.path().join(artifact_filename(10)).exists());
        assert!(directory.path().join(artifact_filename(20)).is_file());
        assert!(directory.path().join(artifact_filename(30)).is_file());
        assert_eq!(manifest_filenames(directory.path()).len(), 2);
    }

    #[test]
    fn prunes_expired_artifacts_after_successful_publication() {
        let directory = tempdir().expect("temporary directory");
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .create_scheduled_backup(directory.path(), 10, policy(10, 15))
            .expect("first backup");
        storage
            .create_scheduled_backup(directory.path(), 20, policy(10, 15))
            .expect("second backup");
        let outcome = storage
            .create_scheduled_backup(directory.path(), 40, policy(10, 15))
            .expect("third backup");
        let BackupRotationOutcome::Created { pruned, .. } = outcome else {
            panic!("expected created backup");
        };

        assert_eq!(pruned, [artifact_filename(20), artifact_filename(10)]);
        let manifest = SqliteWorkspace::read_recovery_manifest(directory.path())
            .expect("read manifest")
            .expect("manifest");
        assert_eq!(manifest.artifacts.len(), 1);
        assert_eq!(manifest.artifacts[0].created_at, 40);
    }

    #[test]
    fn refuses_to_prune_changed_pending_artifact() {
        let directory = tempdir().expect("temporary directory");
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .create_scheduled_backup(directory.path(), 10, policy(1, 1_000))
            .expect("first backup");
        storage
            .create_scheduled_backup(directory.path(), 20, policy(1, 1_000))
            .expect("second backup");
        let changed = directory.path().join(artifact_filename(10));
        fs::write(&changed, b"changed").expect("replace pending artifact");

        let error = storage
            .create_scheduled_backup(directory.path(), 30, policy(1, 1_000))
            .expect_err("reject changed pending artifact");

        assert!(matches!(error, StorageError::Backend(_)));
        assert_eq!(fs::read(changed).expect("changed artifact"), b"changed");
        assert!(!directory.path().join(artifact_filename(30)).exists());
    }

    #[test]
    fn rejects_invalid_policy_and_latest_manifest() {
        let directory = tempdir().expect("temporary directory");
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        let invalid_policy = BackupRetentionPolicy {
            cadence_ms: 0,
            max_artifacts: 0,
            max_age_ms: 0,
        };
        assert!(matches!(
            storage.create_scheduled_backup(directory.path(), 10, invalid_policy),
            Err(StorageError::InvalidOperation(_))
        ));
        fs::write(
            directory.path().join("recovery-manifest-10.json"),
            b"not json",
        )
        .expect("invalid manifest");
        assert!(matches!(
            SqliteWorkspace::read_recovery_manifest(directory.path()),
            Err(StorageError::Backend(_))
        ));
    }

    #[test]
    fn serializes_concurrent_rotation_attempts() {
        let directory = tempdir().expect("temporary directory");
        let storage = Arc::new(SqliteWorkspace::open_in_memory().expect("open database"));
        let barrier = Arc::new(Barrier::new(3));
        let workers = (0..2)
            .map(|_| {
                let storage = Arc::clone(&storage);
                let barrier = Arc::clone(&barrier);
                let directory = directory.path().to_path_buf();
                thread::spawn(move || {
                    barrier.wait();
                    storage.create_scheduled_backup(directory, 10, policy(2, 1_000))
                })
            })
            .collect::<Vec<_>>();
        barrier.wait();
        let outcomes = workers
            .into_iter()
            .map(|worker| worker.join().expect("rotation thread").expect("rotation"))
            .collect::<Vec<_>>();

        assert_eq!(
            outcomes
                .iter()
                .filter(|outcome| matches!(outcome, BackupRotationOutcome::Created { .. }))
                .count(),
            1
        );
        assert_eq!(
            outcomes
                .iter()
                .filter(|outcome| matches!(outcome, BackupRotationOutcome::Skipped { .. }))
                .count(),
            1
        );
        let manifest = SqliteWorkspace::read_recovery_manifest(directory.path())
            .expect("read manifest")
            .expect("manifest");
        assert_eq!(manifest.artifacts.len(), 1);
    }

    #[test]
    fn retains_two_valid_manifest_generations_around_invalid_files() {
        let directory = tempdir().expect("temporary directory");
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .create_scheduled_backup(directory.path(), 10, policy(3, 1_000))
            .expect("first backup");
        storage
            .create_scheduled_backup(directory.path(), 20, policy(3, 1_000))
            .expect("second backup");
        fs::write(
            directory.path().join("recovery-manifest-15.json"),
            b"not json",
        )
        .expect("invalid older manifest");

        storage
            .create_scheduled_backup(directory.path(), 30, policy(3, 1_000))
            .expect("third backup");

        assert!(directory.path().join("recovery-manifest-30.json").is_file());
        assert!(directory.path().join("recovery-manifest-20.json").is_file());
        assert!(directory.path().join("recovery-manifest-15.json").is_file());
        assert!(!directory.path().join("recovery-manifest-10.json").exists());
    }

    fn filenames(directory: &std::path::Path) -> Vec<String> {
        let mut names = fs::read_dir(directory)
            .expect("read directory")
            .map(|entry| {
                entry
                    .expect("directory entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect::<Vec<_>>();
        names.sort();
        names
    }

    fn manifest_filenames(directory: &std::path::Path) -> Vec<String> {
        filenames(directory)
            .into_iter()
            .filter(|filename| {
                filename.starts_with(MANIFEST_PREFIX) && filename.ends_with(MANIFEST_SUFFIX)
            })
            .collect()
    }
}
