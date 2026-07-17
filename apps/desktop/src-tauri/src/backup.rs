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

#[cfg(test)]
fn snapshot_manifest(
    app_data_dir: &Path,
    app_local_data_dir: &Path,
    vault_root: &Path,
) -> SnapshotManifest {
    SnapshotManifest {
        version: 1,
        app_data_dir: app_data_dir.to_string_lossy().into_owned(),
        app_local_data_dir: app_local_data_dir.to_string_lossy().into_owned(),
        vault_root: vault_root.to_string_lossy().into_owned(),
    }
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

fn clear_root(dir: &Path) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    clear_dir_contents(dir)
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
/// is rejected.
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

/// Restores a full desktop snapshot into the given app data, local data, and
/// vault roots. Existing contents at those targets are removed first.
pub fn restore_snapshot(
    zip_path: &Path,
    app_data_dir: &Path,
    app_local_data_dir: &Path,
) -> io::Result<SnapshotManifest> {
    let manifest = read_snapshot_manifest(zip_path)?;
    clear_root(app_data_dir)?;
    clear_root(app_local_data_dir)?;
    let vault_root = PathBuf::from(&manifest.vault_root);
    clear_root(&vault_root)?;

    let file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(file).map_err(map_zip)?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(map_zip)?;
        let rel = match entry.enclosed_name() {
            Some(name) => name,
            None => continue,
        };
        if rel == Path::new(SNAPSHOT_MANIFEST_FILE) {
            continue;
        }
        let mut components = rel.components();
        let Some(prefix) = components
            .next()
            .and_then(|component| component.as_os_str().to_str())
        else {
            continue;
        };
        let target_dir = match prefix {
            SNAPSHOT_APP_DATA_DIR => app_data_dir,
            SNAPSHOT_APP_LOCAL_DATA_DIR => app_local_data_dir,
            SNAPSHOT_VAULT_DIR => vault_root.as_path(),
            _ => continue,
        };
        let stripped = components.collect::<PathBuf>();
        let out = target_dir.join(stripped);
        if !out.starts_with(target_dir) {
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
    Ok(manifest)
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

    #[test]
    fn snapshot_roundtrips_app_data_local_data_and_vault() {
        let app_data = tempfile::tempdir().unwrap();
        write(
            &app_data.path().join("settings.json"),
            "{\"vaultRoot\":\"/vault\"}",
        );
        write(&app_data.path().join("index.db"), "index");

        let app_local = tempfile::tempdir().unwrap();
        write(&app_local.path().join("ollama/models/model.bin"), "model");

        let vault = tempfile::tempdir().unwrap();
        write(&vault.path().join("note.md"), "# Hello");
        write(&vault.path().join(".skriuw/folders.json"), "[]");

        let zip_dir = tempfile::tempdir().unwrap();
        let zip_path = zip_dir.path().join("snapshot.zip");
        let manifest = snapshot_manifest(app_data.path(), app_local.path(), vault.path());
        zip_snapshot(
            &manifest,
            app_data.path(),
            app_local.path(),
            vault.path(),
            &zip_path,
        )
        .unwrap();

        clear_dir_contents(app_data.path()).unwrap();
        clear_dir_contents(app_local.path()).unwrap();
        clear_dir_contents(vault.path()).unwrap();

        let restored = restore_snapshot(&zip_path, app_data.path(), app_local.path()).unwrap();
        assert_eq!(restored, manifest);
        assert_eq!(
            fs::read_to_string(app_data.path().join("settings.json")).unwrap(),
            "{\"vaultRoot\":\"/vault\"}"
        );
        assert_eq!(
            fs::read_to_string(app_data.path().join("index.db")).unwrap(),
            "index"
        );
        assert_eq!(
            fs::read_to_string(app_local.path().join("ollama/models/model.bin")).unwrap(),
            "model"
        );
        assert_eq!(
            fs::read_to_string(vault.path().join("note.md")).unwrap(),
            "# Hello"
        );
        assert_eq!(
            fs::read_to_string(vault.path().join(".skriuw/folders.json")).unwrap(),
            "[]"
        );
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
