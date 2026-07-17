use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::ZipArchive;

/// Backup is a portable `.zip` of the markdown vault (note `.md` files plus the
/// `.skriuw/` metadata). The SQLite index is NOT included — it is a derived
/// cache the app rebuilds from the vault on import, so a backup stays a plain,
/// inspectable folder of markdown.
fn map_zip(error: zip::result::ZipError) -> io::Error {
    io::Error::other(error)
}

const SNAPSHOT_MANIFEST_FILE: &str = "manifest.json";
const SNAPSHOT_APP_DATA_DIR: &str = "app-data";
const SNAPSHOT_APP_LOCAL_DATA_DIR: &str = "app-local-data";
const SNAPSHOT_VAULT_DIR: &str = "vault";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotManifest {
    pub version: u32,
    pub app_data_dir: String,
    pub app_local_data_dir: String,
    pub vault_root: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum SnapshotEvent {
    Status {
        message: String,
    },
    Progress {
        completed: u64,
        total: u64,
        percent: f32,
    },
    Done {
        path: String,
    },
}

fn add_dir_prefixed<F>(
    zip: &mut zip::ZipWriter<File>,
    base: &Path,
    dir: &Path,
    prefix: &str,
    options: SimpleFileOptions,
    on_file: &mut F,
) -> io::Result<()>
where
    F: FnMut(),
{
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        if is_excluded_from_snapshot(name) {
            continue;
        }
        let rel = path
            .strip_prefix(base)
            .map_err(io::Error::other)?
            .to_string_lossy()
            .replace('\\', "/");
        let full_rel = if rel.is_empty() {
            prefix.to_string()
        } else {
            format!("{prefix}/{rel}")
        };
        if path.is_dir() {
            zip.add_directory(format!("{full_rel}/"), options)
                .map_err(map_zip)?;
            add_dir_prefixed(zip, base, &path, prefix, options, on_file)?;
        } else {
            zip.start_file(full_rel, options).map_err(map_zip)?;
            let bytes = fs::read(&path)?;
            io::Write::write_all(zip, &bytes)?;
            on_file();
        }
    }
    Ok(())
}

fn write_manifest(zip: &mut zip::ZipWriter<File>, manifest: &SnapshotManifest) -> io::Result<()> {
    zip.start_file(SNAPSHOT_MANIFEST_FILE, SimpleFileOptions::default())
        .map_err(map_zip)?;
    let body = serde_json::to_vec_pretty(manifest).map_err(io::Error::other)?;
    io::Write::write_all(zip, &body)?;
    Ok(())
}

pub fn read_snapshot_manifest(zip_path: &Path) -> io::Result<SnapshotManifest> {
    let file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(file).map_err(map_zip)?;
    let mut manifest = archive.by_name(SNAPSHOT_MANIFEST_FILE).map_err(map_zip)?;
    let mut body = Vec::new();
    io::Read::read_to_end(&mut manifest, &mut body)?;
    serde_json::from_slice(&body).map_err(io::Error::other)
}

fn clear_dir_contents_with_progress<F>(dir: &Path, on_file: &mut F) -> io::Result<()>
where
    F: FnMut(),
{
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            clear_dir_contents_with_progress(&path, on_file)?;
            fs::remove_dir_all(&path)?;
        } else {
            fs::remove_file(&path)?;
            on_file();
        }
    }
    Ok(())
}

fn count_files(dir: &Path) -> io::Result<u64> {
    if !dir.exists() {
        return Ok(0);
    }
    let mut total = 0;
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            total += count_files(&path)?;
        } else {
            total += 1;
        }
    }
    Ok(total)
}

/// Disposable, webview-regenerated caches that bloat a snapshot (the WebKit HTTP
/// cache alone is hundreds of MB) and carry no user data. They are skipped when
/// packing and counting so the snapshot stays small and fast.
fn is_excluded_from_snapshot(name: &str) -> bool {
    matches!(
        name,
        "WebKitCache"
            | "CacheStorage"
            | "ServiceWorkerCache"
            | "DiskCache"
            | "GPUCache"
            | "Code Cache"
            | "mediakeys"
            | "hsts-storage.sqlite"
    )
}

fn count_snapshot_files(dir: &Path) -> io::Result<u64> {
    if !dir.exists() {
        return Ok(0);
    }
    let mut total = 0;
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        if is_excluded_from_snapshot(name) {
            continue;
        }
        if path.is_dir() {
            total += count_snapshot_files(&path)?;
        } else {
            total += 1;
        }
    }
    Ok(total)
}

/// True when both paths resolve to the same directory. On Linux/macOS Tauri's
/// `app_data_dir` and `app_local_data_dir` are the same location, so the snapshot
/// must not pack it twice.
fn same_dir(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

#[cfg(test)]
fn snapshot_total_files(
    app_data_dir: &Path,
    app_local_data_dir: &Path,
    vault_root: &Path,
) -> io::Result<u64> {
    Ok(
        1 + count_files(app_data_dir)?
            + count_files(app_local_data_dir)?
            + count_files(vault_root)?,
    )
}

/// Removes every writable desktop root so the app boots like a fresh install.
/// The operation emits snapshot-style progress updates so the UI can show
/// meaningful busy and success states.
pub fn clear_desktop_state_with_progress<F>(
    app_data_dir: &Path,
    app_local_data_dir: &Path,
    vault_root: &Path,
    mut on_event: F,
) -> io::Result<()>
where
    F: FnMut(SnapshotEvent),
{
    let local_is_distinct = !same_dir(app_data_dir, app_local_data_dir);
    let mut targets = vec![("app data", app_data_dir)];
    if local_is_distinct {
        targets.push(("local AI data", app_local_data_dir));
    }
    targets.push(("vault", vault_root));

    let total = targets
        .iter()
        .map(|(_, path)| count_files(path).unwrap_or(0) + 1)
        .sum::<u64>();
    let completed = std::cell::Cell::new(0u64);
    let last_emit = std::cell::Cell::new(0u64);
    let progress_event = |done: u64| SnapshotEvent::Progress {
        completed: done,
        total,
        percent: if total == 0 {
            0.0
        } else {
            (done as f32 / total as f32) * 100.0
        },
    };

    on_event(SnapshotEvent::Status {
        message: "Resetting desktop data".to_string(),
    });
    if total == 0 {
        on_event(SnapshotEvent::Progress {
            completed: 0,
            total: 0,
            percent: 0.0,
        });
    }

    for (label, path) in targets {
        on_event(SnapshotEvent::Status {
            message: format!("Clearing {label}"),
        });
        fs::create_dir_all(path)?;
        {
            let mut on_file = || {
                let done = completed.get() + 1;
                completed.set(done);
                if done - last_emit.get() >= 8 {
                    last_emit.set(done);
                    on_event(progress_event(done));
                }
            };
            clear_dir_contents_with_progress(path, &mut on_file)?;
        }
        let done = completed.get() + 1;
        completed.set(done);
        last_emit.set(done);
        on_event(progress_event(done));
    }

    on_event(SnapshotEvent::Status {
        message: "Desktop data cleared".to_string(),
    });
    on_event(SnapshotEvent::Progress {
        completed: total,
        total,
        percent: 100.0,
    });
    on_event(SnapshotEvent::Done {
        path: String::new(),
    });
    Ok(())
}

/// Recursively zip everything under `src_dir` into `out_path`, storing entries
/// with paths relative to `src_dir`.
pub fn zip_dir(src_dir: &Path, out_path: &Path) -> io::Result<()> {
    let file = File::create(out_path)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    add_dir(&mut zip, src_dir, src_dir, options)?;
    zip.finish().map_err(map_zip)?;
    Ok(())
}

/// Creates a full desktop snapshot zip with the current app data, local data,
/// and vault contents plus a manifest of the absolute restore paths.
#[cfg(test)]
pub fn zip_snapshot(
    manifest: &SnapshotManifest,
    app_data_dir: &Path,
    app_local_data_dir: &Path,
    vault_root: &Path,
    out_path: &Path,
) -> io::Result<()> {
    zip_snapshot_with_progress(
        manifest,
        app_data_dir,
        app_local_data_dir,
        vault_root,
        out_path,
        |_| {},
    )
}

pub fn zip_snapshot_with_progress<F>(
    manifest: &SnapshotManifest,
    app_data_dir: &Path,
    app_local_data_dir: &Path,
    vault_root: &Path,
    out_path: &Path,
    mut on_event: F,
) -> io::Result<()>
where
    F: FnMut(SnapshotEvent),
{
    let file = File::create(out_path)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default();

    let local_is_distinct = !same_dir(app_data_dir, app_local_data_dir);
    let total = 1
        + count_snapshot_files(app_data_dir)?
        + if local_is_distinct {
            count_snapshot_files(app_local_data_dir)?
        } else {
            0
        }
        + count_snapshot_files(vault_root)?;

    let completed = std::cell::Cell::new(0u64);
    let last_emit = std::cell::Cell::new(0u64);
    let progress_event = |done: u64| SnapshotEvent::Progress {
        completed: done,
        total,
        percent: if total == 0 {
            0.0
        } else {
            (done as f32 / total as f32) * 100.0
        },
    };

    on_event(SnapshotEvent::Status {
        message: "Writing snapshot manifest".to_string(),
    });
    write_manifest(&mut zip, manifest)?;
    completed.set(1);
    last_emit.set(1);
    on_event(progress_event(1));

    on_event(SnapshotEvent::Status {
        message: "Packing app data".to_string(),
    });
    {
        let mut on_file = || {
            let done = completed.get() + 1;
            completed.set(done);
            if done - last_emit.get() >= 8 {
                last_emit.set(done);
                on_event(progress_event(done));
            }
        };
        add_dir_prefixed(
            &mut zip,
            app_data_dir,
            app_data_dir,
            SNAPSHOT_APP_DATA_DIR,
            options,
            &mut on_file,
        )?;
    }
    on_event(progress_event(completed.get()));

    if local_is_distinct {
        on_event(SnapshotEvent::Status {
            message: "Packing local AI data".to_string(),
        });
        {
            let mut on_file = || {
                let done = completed.get() + 1;
                completed.set(done);
                if done - last_emit.get() >= 8 {
                    last_emit.set(done);
                    on_event(progress_event(done));
                }
            };
            add_dir_prefixed(
                &mut zip,
                app_local_data_dir,
                app_local_data_dir,
                SNAPSHOT_APP_LOCAL_DATA_DIR,
                options,
                &mut on_file,
            )?;
        }
        on_event(progress_event(completed.get()));
    }

    on_event(SnapshotEvent::Status {
        message: "Packing vault".to_string(),
    });
    {
        let mut on_file = || {
            let done = completed.get() + 1;
            completed.set(done);
            if done - last_emit.get() >= 8 {
                last_emit.set(done);
                on_event(progress_event(done));
            }
        };
        add_dir_prefixed(
            &mut zip,
            vault_root,
            vault_root,
            SNAPSHOT_VAULT_DIR,
            options,
            &mut on_file,
        )?;
    }
    on_event(progress_event(completed.get()));
    zip.finish().map_err(map_zip)?;
    on_event(SnapshotEvent::Progress {
        completed: total,
        total,
        percent: 100.0,
    });
    on_event(SnapshotEvent::Done {
        path: out_path.to_string_lossy().into_owned(),
    });
    Ok(())
}

fn add_dir(
    zip: &mut zip::ZipWriter<File>,
    base: &Path,
    dir: &Path,
    options: SimpleFileOptions,
) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        let rel = path
            .strip_prefix(base)
            .map_err(io::Error::other)?
            .to_string_lossy()
            .replace('\\', "/");
        if path.is_dir() {
            zip.add_directory(format!("{rel}/"), options)
                .map_err(map_zip)?;
            add_dir(zip, base, &path, options)?;
        } else {
            zip.start_file(rel, options).map_err(map_zip)?;
            let bytes = fs::read(&path)?;
            io::Write::write_all(zip, &bytes)?;
        }
    }
    Ok(())
}

/// Extract every entry of `zip_path` under `dest_dir` (created if missing).
/// Entries are confined to `dest_dir`; any path that would escape it (zip-slip)
/// is rejected. Superseded for restore by the staged flow; retained to test the
/// plain zip roundtrip.
#[cfg(test)]
pub fn unzip_into(zip_path: &Path, dest_dir: &Path) -> io::Result<()> {
    fs::create_dir_all(dest_dir)?;
    let file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(file).map_err(map_zip)?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(map_zip)?;
        let rel = match entry.enclosed_name() {
            Some(name) => name,
            None => continue,
        };
        let out = dest_dir.join(&rel);
        if !out.starts_with(dest_dir) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "zip entry escapes destination",
            ));
        }
        if entry.is_dir() {
            fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut writer = File::create(&out)?;
            io::copy(&mut entry, &mut writer)?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Staged, non-destructive restore (DH-02)
//
// Restores never clear live data before the replacement is fully extracted and
// validated. The flow is inspect → stage → commit → verify → cleanup:
//
// - `inspect_restore` reads only the archive's central directory and rejects
//   anything unsafe (path escapes, duplicates, encrypted entries, oversized
//   archives, unsupported manifest versions) before any byte is extracted.
// - `stage_restore` extracts into uniquely named, marker-tagged sibling
//   staging directories on the same filesystem as each live root and validates
//   the staged vault (and SQLite index, when present) there.
// - `commit_restore` swaps each live root aside into a rollback directory and
//   renames the staged directory into place; a failure rolls completed swaps
//   back in reverse order.
// - The caller verifies the rebound workspace and only then calls
//   `discard_restore_receipt`. Rollback directories from a crashed restore are
//   removed at the next launch, after the live workspace has reconciled
//   (`cleanup_restore_artifacts`), and only when they carry our marker file.
// ---------------------------------------------------------------------------

const RESTORE_MARKER_FILE: &str = ".skriuw-restore-marker";
const STAGING_PREFIX: &str = ".skriuw-restore-staging-";
const ROLLBACK_PREFIX: &str = ".skriuw-restore-rollback-";

/// Conservative archive limits. The entry cap defends against pathological
/// central directories; the byte cap defends against ZIP bombs while still
/// allowing complete snapshots that legitimately contain multi-gigabyte local
/// Ollama models under `app-local-data/`.
const MAX_RESTORE_ENTRIES: u64 = 500_000;
const MAX_RESTORE_UNCOMPRESSED_BYTES: u64 = 256 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RestoreKind {
    VaultBackup,
    Snapshot,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePlan {
    pub kind: RestoreKind,
    pub manifest: Option<SnapshotManifest>,
    pub entry_count: u64,
    pub uncompressed_bytes: u64,
    pub target_vault_root: PathBuf,
}

struct RestoreLimits {
    max_entries: u64,
    max_uncompressed_bytes: u64,
}

const DEFAULT_RESTORE_LIMITS: RestoreLimits = RestoreLimits {
    max_entries: MAX_RESTORE_ENTRIES,
    max_uncompressed_bytes: MAX_RESTORE_UNCOMPRESSED_BYTES,
};

fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.into())
}

/// Reads the archive's central directory without extracting anything and
/// builds a validated restore plan. Unsafe archives fail loudly here.
pub fn inspect_restore(zip_path: &Path, current_vault: &Path) -> io::Result<RestorePlan> {
    inspect_restore_with_limits(zip_path, current_vault, &DEFAULT_RESTORE_LIMITS)
}

fn inspect_restore_with_limits(
    zip_path: &Path,
    current_vault: &Path,
    limits: &RestoreLimits,
) -> io::Result<RestorePlan> {
    let file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(file).map_err(map_zip)?;

    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut entry_count: u64 = 0;
    let mut uncompressed_bytes: u64 = 0;
    let mut has_manifest = false;
    let mut has_vault_artifact = false;
    let mut top_level: std::collections::HashSet<String> = std::collections::HashSet::new();

    for index in 0..archive.len() {
        let entry = archive.by_index_raw(index).map_err(map_zip)?;
        if entry.encrypted() {
            return Err(invalid("archive contains encrypted entries"));
        }
        let raw_name = entry.name().to_string();
        let Some(rel) = entry.enclosed_name() else {
            return Err(invalid(format!(
                "archive entry escapes its destination: {raw_name}"
            )));
        };
        if !entry.is_dir() && !seen.insert(raw_name.clone()) {
            return Err(invalid(format!(
                "archive contains duplicate entry: {raw_name}"
            )));
        }
        if !entry.is_dir() {
            entry_count = entry_count
                .checked_add(1)
                .ok_or_else(|| invalid("archive entry count overflows"))?;
            uncompressed_bytes = uncompressed_bytes
                .checked_add(entry.size())
                .ok_or_else(|| invalid("archive declared size overflows"))?;
        }
        if rel == Path::new(SNAPSHOT_MANIFEST_FILE) {
            has_manifest = true;
        }
        if let Some(first) = rel
            .components()
            .next()
            .and_then(|component| component.as_os_str().to_str())
        {
            top_level.insert(first.to_string());
        }
        let name = rel.to_string_lossy();
        if name.ends_with(".md") || name.starts_with(".skriuw/") || name == ".skriuw" {
            has_vault_artifact = true;
        }
    }

    if entry_count == 0 {
        return Err(invalid("archive contains no files"));
    }
    if entry_count > limits.max_entries {
        return Err(invalid(format!(
            "archive has too many entries ({entry_count}; limit {})",
            limits.max_entries
        )));
    }
    if uncompressed_bytes > limits.max_uncompressed_bytes {
        return Err(invalid(format!(
            "archive is too large uncompressed ({uncompressed_bytes} bytes; limit {})",
            limits.max_uncompressed_bytes
        )));
    }

    if has_manifest {
        let manifest = read_snapshot_manifest(zip_path)?;
        if manifest.version == 0 {
            return Err(invalid("snapshot manifest version 0 is not valid"));
        }
        if manifest.version > 1 {
            return Err(invalid(format!(
                "snapshot was created by a newer Skriuw (manifest version {}); update Skriuw to restore it",
                manifest.version
            )));
        }
        if manifest.vault_root.trim().is_empty() {
            return Err(invalid("snapshot manifest has an empty vault root"));
        }
        for name in &top_level {
            if !matches!(
                name.as_str(),
                SNAPSHOT_MANIFEST_FILE
                    | SNAPSHOT_APP_DATA_DIR
                    | SNAPSHOT_APP_LOCAL_DATA_DIR
                    | SNAPSHOT_VAULT_DIR
            ) {
                return Err(invalid(format!(
                    "snapshot contains an unexpected top-level entry: {name}"
                )));
            }
        }
        let target_vault_root = PathBuf::from(&manifest.vault_root);
        return Ok(RestorePlan {
            kind: RestoreKind::Snapshot,
            manifest: Some(manifest),
            entry_count,
            uncompressed_bytes,
            target_vault_root,
        });
    }

    // A vault backup must actually look like a vault: at least one markdown
    // note or `.skriuw/` metadata entry. An archive of unrelated files is
    // rejected rather than emptied into the vault root. (An intentionally
    // empty vault still exports `.skriuw/folders.json`, so it passes.)
    if !has_vault_artifact {
        return Err(invalid(
            "archive does not look like a Skriuw vault backup (no .md notes or .skriuw metadata)",
        ));
    }
    Ok(RestorePlan {
        kind: RestoreKind::VaultBackup,
        manifest: None,
        entry_count,
        uncompressed_bytes,
        target_vault_root: current_vault.to_path_buf(),
    })
}

/// One planned live-root replacement: fully staged content plus the live
/// directory it will replace at commit time.
#[derive(Debug)]
struct PlannedSwap {
    staged: PathBuf,
    live: PathBuf,
}

#[derive(Debug)]
pub struct StagedRestore {
    swaps: Vec<PlannedSwap>,
}

#[cfg(test)]
fn staged_restore_for_test(swaps: Vec<(PathBuf, PathBuf)>) -> StagedRestore {
    StagedRestore {
        swaps: swaps
            .into_iter()
            .map(|(staged, live)| PlannedSwap { staged, live })
            .collect(),
    }
}

/// Creates a uniquely named, marker-tagged staging directory next to `live` —
/// same parent, therefore same filesystem, so the commit rename is atomic.
fn create_staging_dir(live: &Path) -> io::Result<PathBuf> {
    let parent = live
        .parent()
        .ok_or_else(|| invalid(format!("live root has no parent: {}", live.display())))?;
    fs::create_dir_all(parent)?;
    let dir = parent.join(format!("{STAGING_PREFIX}{}", uuid::Uuid::new_v4()));
    fs::create_dir(&dir)?;
    fs::write(dir.join(RESTORE_MARKER_FILE), b"skriuw restore staging\n")?;
    Ok(dir)
}

fn remove_dirs(dirs: &[PathBuf]) {
    for dir in dirs {
        let _ = fs::remove_dir_all(dir);
    }
}

fn extract_entry_into(
    entry: &mut zip::read::ZipFile<'_>,
    target_dir: &Path,
    rel: &Path,
) -> io::Result<()> {
    let out = target_dir.join(rel);
    if !out.starts_with(target_dir) {
        return Err(invalid("zip entry escapes destination"));
    }
    if entry.is_dir() {
        fs::create_dir_all(&out)?;
        return Ok(());
    }
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut writer = File::create(&out)?;
    io::copy(entry, &mut writer)?;
    // Staged content becomes canonical user data at commit; flush it so a
    // crash right after the swap cannot surface half-written notes.
    writer.sync_all()?;
    Ok(())
}

/// Extracts the archive into staging directories and validates the staged
/// data. Live roots are never touched; any failure removes the staging
/// directories and leaves the workspace exactly as it was.
pub fn stage_restore(
    zip_path: &Path,
    plan: &RestorePlan,
    app_data_dir: &Path,
    app_local_data_dir: &Path,
) -> io::Result<StagedRestore> {
    let result = stage_restore_inner(zip_path, plan, app_data_dir, app_local_data_dir);
    if let Err(error) = &result {
        let _ = error;
    }
    result
}

fn stage_restore_inner(
    zip_path: &Path,
    plan: &RestorePlan,
    app_data_dir: &Path,
    app_local_data_dir: &Path,
) -> io::Result<StagedRestore> {
    let mut staging_dirs: Vec<PathBuf> = Vec::new();
    let staged = (|| -> io::Result<StagedRestore> {
        let file = File::open(zip_path)?;
        let mut archive = ZipArchive::new(file).map_err(map_zip)?;

        match plan.kind {
            RestoreKind::VaultBackup => {
                let staged_vault = create_staging_dir(&plan.target_vault_root)?;
                staging_dirs.push(staged_vault.clone());
                for index in 0..archive.len() {
                    let mut entry = archive.by_index(index).map_err(map_zip)?;
                    let Some(rel) = entry.enclosed_name() else {
                        return Err(invalid("zip entry escapes destination"));
                    };
                    extract_entry_into(&mut entry, &staged_vault, &rel)?;
                }
                validate_staged_vault(&staged_vault)?;
                Ok(StagedRestore {
                    swaps: vec![PlannedSwap {
                        staged: staged_vault,
                        live: plan.target_vault_root.clone(),
                    }],
                })
            }
            RestoreKind::Snapshot => {
                let local_is_distinct = !same_dir(app_data_dir, app_local_data_dir);
                let staged_app_data = create_staging_dir(app_data_dir)?;
                staging_dirs.push(staged_app_data.clone());
                let staged_app_local = if local_is_distinct {
                    let dir = create_staging_dir(app_local_data_dir)?;
                    staging_dirs.push(dir.clone());
                    Some(dir)
                } else {
                    None
                };
                let staged_vault = create_staging_dir(&plan.target_vault_root)?;
                staging_dirs.push(staged_vault.clone());

                for index in 0..archive.len() {
                    let mut entry = archive.by_index(index).map_err(map_zip)?;
                    let Some(rel) = entry.enclosed_name() else {
                        return Err(invalid("zip entry escapes destination"));
                    };
                    if rel == Path::new(SNAPSHOT_MANIFEST_FILE) {
                        continue;
                    }
                    let mut components = rel.components();
                    let Some(prefix) = components
                        .next()
                        .and_then(|component| component.as_os_str().to_str())
                        .map(str::to_owned)
                    else {
                        continue;
                    };
                    let target_dir = match prefix.as_str() {
                        SNAPSHOT_APP_DATA_DIR => &staged_app_data,
                        SNAPSHOT_APP_LOCAL_DATA_DIR => {
                            staged_app_local.as_ref().unwrap_or(&staged_app_data)
                        }
                        SNAPSHOT_VAULT_DIR => &staged_vault,
                        _ => {
                            return Err(invalid(format!(
                                "snapshot contains an unexpected top-level entry: {prefix}"
                            )))
                        }
                    };
                    let stripped = components.collect::<PathBuf>();
                    extract_entry_into(&mut entry, target_dir, &stripped)?;
                }

                validate_staged_vault(&staged_vault)?;
                validate_staged_index(&staged_app_data)?;

                let mut swaps = vec![PlannedSwap {
                    staged: staged_app_data,
                    live: app_data_dir.to_path_buf(),
                }];
                if let Some(staged) = staged_app_local {
                    swaps.push(PlannedSwap {
                        staged,
                        live: app_local_data_dir.to_path_buf(),
                    });
                }
                swaps.push(PlannedSwap {
                    staged: staged_vault,
                    live: plan.target_vault_root.clone(),
                });
                Ok(StagedRestore { swaps })
            }
        }
    })();
    if staged.is_err() {
        remove_dirs(&staging_dirs);
    }
    staged
}

/// Opens the staged vault with the real `VaultStore` and runs the same reads
/// launch reconciliation performs, so a restore that would immediately fail
/// reconciliation fails here instead — before any live data is touched.
fn validate_staged_vault(staged_vault: &Path) -> io::Result<()> {
    let marker = staged_vault.join(RESTORE_MARKER_FILE);
    let vault = crate::vault::VaultStore::open(staged_vault)
        .map_err(|error| invalid(format!("staged vault is not usable: {error}")))?;
    vault
        .list_folders()
        .map_err(|error| invalid(format!("staged vault folders are unreadable: {error}")))?;
    vault
        .list_notes()
        .map_err(|error| invalid(format!("staged vault notes are unreadable: {error}")))?;
    vault
        .list_journal_entries()
        .map_err(|error| invalid(format!("staged vault journal is unreadable: {error}")))?;
    vault
        .list_trash()
        .map_err(|error| invalid(format!("staged vault trash index is unreadable: {error}")))?;
    // `VaultStore::open` writes an empty folder index when missing; that is
    // also what a fresh vault gets, so it is safe for staged content. Restore
    // the marker in case open touched the directory.
    if !marker.exists() {
        fs::write(&marker, b"skriuw restore staging\n")?;
    }
    Ok(())
}

/// A staged snapshot may carry `index.db`. If it opens, keep it; if it is
/// corrupt, discard it (plus WAL/SHM sidecars) so the post-restore reconcile
/// rebuilds the index from the staged vault instead of failing the restore.
fn validate_staged_index(staged_app_data: &Path) -> io::Result<()> {
    let index_path = staged_app_data.join("index.db");
    if !index_path.exists() {
        return Ok(());
    }
    if crate::storage::Storage::open(&index_path).is_err() {
        fs::remove_file(&index_path)?;
        for sidecar in ["index.db-wal", "index.db-shm"] {
            let _ = fs::remove_file(staged_app_data.join(sidecar));
        }
    }
    Ok(())
}

/// One completed live-root swap: where the live data now is, and where the
/// previous data was parked for rollback (`None` when the live root did not
/// exist before the restore).
#[derive(Debug)]
pub struct CompletedSwap {
    pub live: PathBuf,
    pub rollback: Option<PathBuf>,
    staged_origin: PathBuf,
}

#[derive(Debug, Default)]
pub struct RestoreReceipt {
    pub swaps: Vec<CompletedSwap>,
}

impl RestoreReceipt {
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn rollback_paths(&self) -> Vec<PathBuf> {
        self.swaps
            .iter()
            .filter_map(|swap| swap.rollback.clone())
            .collect()
    }
}

/// Swaps every staged directory into its live path. Each live root is renamed
/// aside to a rollback sibling first, so the previous workspace stays complete
/// on disk until `discard_restore_receipt`. If any swap fails, all completed
/// swaps are undone in reverse order and the error reports whether the
/// original workspace was preserved.
pub fn commit_restore(staged: StagedRestore) -> io::Result<RestoreReceipt> {
    let mut receipt = RestoreReceipt::default();
    for swap in &staged.swaps {
        // The marker never belongs in live data.
        let _ = fs::remove_file(swap.staged.join(RESTORE_MARKER_FILE));

        let rollback = if swap.live.exists() {
            let parent = swap.live.parent().ok_or_else(|| {
                invalid(format!("live root has no parent: {}", swap.live.display()))
            })?;
            let rollback = parent.join(format!("{ROLLBACK_PREFIX}{}", uuid::Uuid::new_v4()));
            if let Err(error) = fs::rename(&swap.live, &rollback) {
                rollback_receipt(&receipt);
                return Err(io::Error::new(
                    error.kind(),
                    format!(
                        "could not move the current data aside ({} -> {}): {error}",
                        swap.live.display(),
                        rollback.display()
                    ),
                ));
            }
            Some(rollback)
        } else {
            None
        };

        if let Err(error) = fs::rename(&swap.staged, &swap.live) {
            if let Some(rollback) = &rollback {
                let _ = fs::rename(rollback, &swap.live);
            }
            rollback_receipt(&receipt);
            return Err(io::Error::new(
                error.kind(),
                format!(
                    "could not install the restored data at {}: {error}",
                    swap.live.display()
                ),
            ));
        }
        if let Some(rollback) = &rollback {
            let _ = fs::write(
                rollback.join(RESTORE_MARKER_FILE),
                b"skriuw restore rollback\n",
            );
        }
        receipt.swaps.push(CompletedSwap {
            live: swap.live.clone(),
            rollback,
            staged_origin: swap.staged.clone(),
        });
    }
    Ok(receipt)
}

/// Undoes every completed swap in reverse order: the restored content moves
/// back to its staging name and the rollback directory returns to the live
/// path. Returns the paths that could NOT be restored (empty on full success).
pub fn rollback_receipt(receipt: &RestoreReceipt) -> Vec<PathBuf> {
    let mut failed = Vec::new();
    for swap in receipt.swaps.iter().rev() {
        let undone = fs::rename(&swap.live, &swap.staged_origin).is_ok()
            || fs::remove_dir_all(&swap.live).is_ok();
        if !undone {
            failed.push(swap.live.clone());
            continue;
        }
        if let Some(rollback) = &swap.rollback {
            let _ = fs::remove_file(rollback.join(RESTORE_MARKER_FILE));
            if fs::rename(rollback, &swap.live).is_err() {
                failed.push(rollback.clone());
            }
        }
    }
    failed
}

/// Deletes the retained previous-workspace directories. Call only after the
/// restored workspace has rebound and passed its post-restore smoke read.
pub fn discard_restore_receipt(receipt: &RestoreReceipt) {
    for swap in &receipt.swaps {
        if let Some(rollback) = &swap.rollback {
            let _ = fs::remove_dir_all(rollback);
        }
        let _ = fs::remove_dir_all(&swap.staged_origin);
    }
}

/// Startup cleanup for restore leftovers: removes marker-tagged staging and
/// rollback siblings of the given live roots. Only directories carrying our
/// marker file are touched — a name that merely resembles ours is left alone.
/// Call after the live workspace has been opened and reconciled, which is the
/// verification the rollback-retention policy requires.
pub fn cleanup_restore_artifacts(live_roots: &[&Path]) {
    let mut parents: Vec<PathBuf> = Vec::new();
    for root in live_roots {
        if let Some(parent) = root.parent() {
            if !parents.contains(&parent.to_path_buf()) {
                parents.push(parent.to_path_buf());
            }
        }
    }
    for parent in parents {
        let Ok(entries) = fs::read_dir(&parent) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let is_ours = name.starts_with(STAGING_PREFIX) || name.starts_with(ROLLBACK_PREFIX);
            if is_ours && path.join(RESTORE_MARKER_FILE).exists() {
                let _ = fs::remove_dir_all(&path);
            }
        }
    }
}

/// Remove every entry inside `dir` while keeping `dir` itself.
pub fn clear_dir_contents(dir: &Path) -> io::Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            fs::remove_dir_all(&path)?;
        } else {
            fs::remove_file(&path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, body: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, body).unwrap();
    }

    #[test]
    fn zip_then_unzip_roundtrips_nested_files() {
        let src = tempfile::tempdir().unwrap();
        write(&src.path().join("note.md"), "# Hello");
        write(&src.path().join(".skriuw/folders.json"), "[]");
        write(&src.path().join("sub/child.md"), "child");

        let zip_path = tempfile::tempdir().unwrap().path().join("backup.zip");
        fs::create_dir_all(zip_path.parent().unwrap()).unwrap();
        zip_dir(src.path(), &zip_path).unwrap();
        assert!(zip_path.exists());

        let dest = tempfile::tempdir().unwrap();
        unzip_into(&zip_path, dest.path()).unwrap();
        assert_eq!(
            fs::read_to_string(dest.path().join("note.md")).unwrap(),
            "# Hello"
        );
        assert_eq!(
            fs::read_to_string(dest.path().join(".skriuw/folders.json")).unwrap(),
            "[]"
        );
        assert_eq!(
            fs::read_to_string(dest.path().join("sub/child.md")).unwrap(),
            "child"
        );
    }

    #[test]
    fn clear_dir_contents_empties_but_keeps_root() {
        let dir = tempfile::tempdir().unwrap();
        write(&dir.path().join("a.md"), "a");
        write(&dir.path().join("nested/b.md"), "b");
        clear_dir_contents(dir.path()).unwrap();
        assert!(dir.path().exists());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn snapshot_total_files_counts_all_sources() {
        let app_data = tempfile::tempdir().unwrap();
        write(&app_data.path().join("settings.json"), "{}");
        write(&app_data.path().join("index.db"), "index");

        let app_local = tempfile::tempdir().unwrap();
        write(&app_local.path().join("ollama/models/model.bin"), "model");

        let vault = tempfile::tempdir().unwrap();
        write(&vault.path().join("note.md"), "# Hello");
        write(&vault.path().join("nested/child.md"), "# Child");

        assert_eq!(
            snapshot_total_files(app_data.path(), app_local.path(), vault.path()).unwrap(),
            6
        );
    }

    /// Builds a valid version-1 snapshot zip inside `home`. The manifest's
    /// `vaultRoot` points at `vault_target` so restore installs there.
    fn build_snapshot(home: &Path, vault_target: &Path) -> PathBuf {
        let app_data = home.join("src/app-data");
        let app_local = home.join("src/app-local");
        let vault = home.join("src/vault");
        write(
            &app_data.join("settings.json"),
            "{\"vaultRoot\":\"/vault\"}",
        );
        write(&app_data.join("index.db"), "not-a-real-db");
        write(&app_local.join("ollama/models/model.bin"), "model");
        write(&vault.join("note.md"), "---\nid: \"n1\"\n---\n# Hello");
        write(&vault.join(".skriuw/folders.json"), "[]");

        let zip_path = home.join("snapshot.zip");
        let manifest = SnapshotManifest {
            version: 1,
            app_data_dir: "/old/app-data".to_string(),
            app_local_data_dir: "/old/app-local".to_string(),
            vault_root: vault_target.to_string_lossy().into_owned(),
        };
        zip_snapshot(&manifest, &app_data, &app_local, &vault, &zip_path).unwrap();
        zip_path
    }

    fn build_vault_backup(home: &Path) -> PathBuf {
        let src = home.join("vault-src");
        write(&src.join("Note.md"), "---\nid: \"n1\"\n---\nbody");
        write(&src.join(".skriuw/folders.json"), "[]");
        let zip_path = home.join("vault.zip");
        zip_dir(&src, &zip_path).unwrap();
        zip_path
    }

    #[test]
    fn inspect_accepts_valid_snapshot_and_vault_and_reports_target() {
        let home = tempfile::tempdir().unwrap();
        let live_vault = tempfile::tempdir().unwrap();
        let snap_zip = build_snapshot(home.path(), live_vault.path());
        let plan = inspect_restore(&snap_zip, live_vault.path()).unwrap();
        assert_eq!(plan.kind, RestoreKind::Snapshot);
        assert_eq!(plan.target_vault_root, live_vault.path());
        assert!(plan.manifest.is_some());

        let vault_zip = build_vault_backup(home.path());
        let vplan = inspect_restore(&vault_zip, live_vault.path()).unwrap();
        assert_eq!(vplan.kind, RestoreKind::VaultBackup);
        assert_eq!(vplan.target_vault_root, live_vault.path());
    }

    #[test]
    fn inspect_rejects_future_manifest_version() {
        let live_vault = tempfile::tempdir().unwrap();
        let src = tempfile::tempdir().unwrap();
        let vault = src.path().join("vault");
        write(&vault.join("note.md"), "# Hello");
        let zip_dir = tempfile::tempdir().unwrap();
        let zip_path = zip_dir.path().join("future.zip");
        let manifest = SnapshotManifest {
            version: 99,
            app_data_dir: String::new(),
            app_local_data_dir: String::new(),
            vault_root: live_vault.path().to_string_lossy().into_owned(),
        };
        zip_snapshot(&manifest, src.path(), src.path(), &vault, &zip_path).unwrap();
        let error = inspect_restore(&zip_path, live_vault.path()).unwrap_err();
        assert!(error.to_string().contains("newer Skriuw"));
    }

    #[test]
    fn inspect_rejects_non_vault_archive_without_manifest() {
        let home = tempfile::tempdir().unwrap();
        let live_vault = tempfile::tempdir().unwrap();
        let src = home.path().join("random-src");
        write(&src.join("random.txt"), "not a vault");
        let zip_path = home.path().join("random.zip");
        zip_dir(&src, &zip_path).unwrap();
        let error = inspect_restore(&zip_path, live_vault.path()).unwrap_err();
        assert!(error.to_string().contains("does not look like"));
    }

    #[test]
    fn inspect_rejects_oversized_archive_via_limits() {
        let home = tempfile::tempdir().unwrap();
        let live_vault = tempfile::tempdir().unwrap();
        let vault_zip = build_vault_backup(home.path());
        let tight = RestoreLimits {
            max_entries: 1,
            max_uncompressed_bytes: MAX_RESTORE_UNCOMPRESSED_BYTES,
        };
        let error = inspect_restore_with_limits(&vault_zip, live_vault.path(), &tight).unwrap_err();
        assert!(error.to_string().contains("too many entries"));
    }

    /// A live root inside its own private parent, so scanning the parent for
    /// staging/rollback leftovers is not polluted by other parallel tests that
    /// also create tempdirs under the shared system temp directory.
    fn isolated_live_root(home: &Path, name: &str) -> PathBuf {
        let root = home.join(format!("live-{name}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn has_restore_leftovers(parent: &Path) -> bool {
        fs::read_dir(parent)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .any(|entry| {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                name.starts_with(STAGING_PREFIX) || name.starts_with(ROLLBACK_PREFIX)
            })
    }

    #[test]
    fn vault_restore_swaps_content_and_leaves_no_staging() {
        let home = tempfile::tempdir().unwrap();
        let vault_home = tempfile::tempdir().unwrap();
        let live_vault = isolated_live_root(vault_home.path(), "vault");
        write(&live_vault.join("Old.md"), "old content");
        let vault_zip = build_vault_backup(home.path());

        let plan = inspect_restore(&vault_zip, &live_vault).unwrap();
        let app_data = tempfile::tempdir().unwrap();
        let staged = stage_restore(&vault_zip, &plan, app_data.path(), app_data.path()).unwrap();
        // Live root untouched until commit.
        assert!(live_vault.join("Old.md").exists());
        let receipt = commit_restore(staged).unwrap();

        assert!(live_vault.join("Note.md").exists());
        assert!(!live_vault.join("Old.md").exists());
        // Previous workspace retained for rollback until discard.
        assert_eq!(receipt.rollback_paths().len(), 1);
        assert!(receipt.rollback_paths()[0].join("Old.md").exists());

        discard_restore_receipt(&receipt);
        cleanup_restore_artifacts(&[&live_vault]);
        assert!(!has_restore_leftovers(vault_home.path()));
    }

    #[test]
    fn corrupt_archive_leaves_live_roots_unchanged() {
        let home = tempfile::tempdir().unwrap();
        let vault_home = tempfile::tempdir().unwrap();
        let live_vault = isolated_live_root(vault_home.path(), "vault");
        write(&live_vault.join("Old.md"), "keep me");
        // A ZIP whose central directory is fine but whose entry data is
        // truncated: build a normal zip then chop its tail.
        let vault_zip = build_vault_backup(home.path());
        let bytes = fs::read(&vault_zip).unwrap();
        let truncated = vault_zip.with_extension("trunc.zip");
        fs::write(&truncated, &bytes[..bytes.len() / 2]).unwrap();

        // Inspection or staging must fail; either way the live root is intact.
        let result = inspect_restore(&truncated, &live_vault).and_then(|plan| {
            let app_data = tempfile::tempdir().unwrap();
            stage_restore(&truncated, &plan, app_data.path(), app_data.path())?;
            Ok(())
        });
        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(live_vault.join("Old.md")).unwrap(),
            "keep me"
        );
        assert!(
            !has_restore_leftovers(vault_home.path()),
            "failed staging must remove its staging dirs"
        );
    }

    #[test]
    fn partial_commit_rolls_back_completed_swaps_in_reverse() {
        // Two completed swaps, then a rollback: both live roots return to their
        // previous content and the restored content goes back to staging.
        let parent = tempfile::tempdir().unwrap();
        let live_a = parent.path().join("a");
        let live_b = parent.path().join("b");
        let staged_a = parent.path().join(".skriuw-restore-staging-a");
        let staged_b = parent.path().join(".skriuw-restore-staging-b");
        write(&live_a.join("f"), "old-a");
        write(&live_b.join("f"), "old-b");
        write(&staged_a.join("f"), "new-a");
        write(&staged_b.join("f"), "new-b");

        let staged = staged_restore_for_test(vec![
            (staged_a.clone(), live_a.clone()),
            (staged_b.clone(), live_b.clone()),
        ]);
        let receipt = commit_restore(staged).unwrap();
        assert_eq!(fs::read_to_string(live_a.join("f")).unwrap(), "new-a");
        assert_eq!(fs::read_to_string(live_b.join("f")).unwrap(), "new-b");

        let failed = rollback_receipt(&receipt);
        assert!(failed.is_empty());
        assert_eq!(fs::read_to_string(live_a.join("f")).unwrap(), "old-a");
        assert_eq!(fs::read_to_string(live_b.join("f")).unwrap(), "old-b");
    }

    #[test]
    fn snapshot_restore_installs_all_three_roots() {
        let home = tempfile::tempdir().unwrap();
        let live_vault = tempfile::tempdir().unwrap();
        write(&live_vault.path().join("Old.md"), "old");
        let live_app_data = tempfile::tempdir().unwrap();
        write(&live_app_data.path().join("stale"), "stale");
        let live_app_local = tempfile::tempdir().unwrap();

        let snap_zip = build_snapshot(home.path(), live_vault.path());
        let plan = inspect_restore(&snap_zip, live_vault.path()).unwrap();
        let staged = stage_restore(
            &snap_zip,
            &plan,
            live_app_data.path(),
            live_app_local.path(),
        )
        .unwrap();
        let receipt = commit_restore(staged).unwrap();

        assert!(live_vault.path().join("note.md").exists());
        assert!(!live_vault.path().join("Old.md").exists());
        assert_eq!(
            fs::read_to_string(live_app_data.path().join("settings.json")).unwrap(),
            "{\"vaultRoot\":\"/vault\"}"
        );
        assert!(live_app_local
            .path()
            .join("ollama/models/model.bin")
            .exists());
        // A corrupt staged index.db is dropped, not restored.
        assert!(!live_app_data.path().join("index.db").exists());
        discard_restore_receipt(&receipt);
    }

    #[test]
    fn clear_desktop_state_clears_all_roots_and_emits_progress() {
        let app_data = tempfile::tempdir().unwrap();
        write(&app_data.path().join("settings.json"), "{}");
        write(&app_data.path().join("index.db"), "index");

        let app_local = tempfile::tempdir().unwrap();
        write(&app_local.path().join("ollama/models/model.bin"), "model");

        let vault = tempfile::tempdir().unwrap();
        write(&vault.path().join("note.md"), "# Hello");

        let mut events = Vec::new();
        clear_desktop_state_with_progress(
            app_data.path(),
            app_local.path(),
            vault.path(),
            |event| {
                events.push(event);
            },
        )
        .unwrap();

        assert!(app_data.path().read_dir().unwrap().next().is_none());
        assert!(app_local.path().read_dir().unwrap().next().is_none());
        assert!(vault.path().read_dir().unwrap().next().is_none());
        assert!(matches!(events.first(), Some(SnapshotEvent::Status { .. })));
        assert!(matches!(events.last(), Some(SnapshotEvent::Done { .. })));
    }
}
