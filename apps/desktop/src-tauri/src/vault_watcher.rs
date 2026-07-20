//! Recursive, debounced live reconciliation for the Markdown vault.
//!
//! The worker owns the platform watcher and never sends bodies over Tauri
//! events. Note paths are reconciled individually; metadata changes and watcher
//! overflow use the bounded full-reconcile fallback in `lib.rs`.

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::{note_body_matches, reconcile_index, Storage, VaultStore};

const CHANGE_EVENT: &str = "vault://changed";
const STATUS_EVENT: &str = "vault://status";
const DEBOUNCE: Duration = Duration::from_millis(280);

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultChangeEvent {
    pub generation: u64,
    pub changed_note_ids: Vec<String>,
    pub deleted_note_ids: Vec<String>,
    pub added_note_ids: Vec<String>,
    pub folders_changed: bool,
    pub journals_changed: bool,
    pub tags_changed: bool,
    pub covers_changed: bool,
    pub full_rescan: bool,
    pub warnings: Vec<String>,
}

impl VaultChangeEvent {
    fn is_empty(&self) -> bool {
        self.changed_note_ids.is_empty()
            && self.deleted_note_ids.is_empty()
            && self.added_note_ids.is_empty()
            && !self.folders_changed
            && !self.journals_changed
            && !self.tags_changed
            && !self.covers_changed
            && !self.full_rescan
            && self.warnings.is_empty()
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatcherStatus {
    pub state: &'static str,
    pub root: Option<String>,
    pub message: Option<String>,
}

struct Worker {
    stop: mpsc::Sender<()>,
    join: JoinHandle<()>,
}

pub struct VaultWatcher {
    worker: Mutex<Option<Worker>>,
    status: Mutex<WatcherStatus>,
    generation: AtomicU64,
    recent_writes: Mutex<VecDeque<(PathBuf, String, Instant)>>,
}

impl Default for VaultWatcher {
    fn default() -> Self {
        Self {
            worker: Mutex::new(None),
            status: Mutex::new(WatcherStatus {
                state: "stopped",
                root: None,
                message: None,
            }),
            generation: AtomicU64::new(0),
            recent_writes: Mutex::new(VecDeque::new()),
        }
    }
}

impl VaultWatcher {
    pub fn status(&self) -> WatcherStatus {
        self.status.lock().expect("watcher status poisoned").clone()
    }

    pub fn start(&self, app: AppHandle, root: PathBuf) -> Result<(), String> {
        self.stop();
        let (stop_tx, stop_rx) = mpsc::channel();
        let root_for_thread = root.clone();
        let join = thread::Builder::new()
            .name("skriuw-vault-watcher".into())
            .spawn(move || run_worker(app, root_for_thread, stop_rx))
            .map_err(|error| error.to_string())?;
        *self.worker.lock().expect("watcher worker poisoned") = Some(Worker {
            stop: stop_tx,
            join,
        });
        self.set_status("active", Some(root.to_string_lossy().into_owned()), None);
        Ok(())
    }

    pub fn stop(&self) {
        if let Some(worker) = self.worker.lock().expect("watcher worker poisoned").take() {
            let _ = worker.stop.send(());
            if worker.join.thread().id() != thread::current().id() {
                let _ = worker.join.join();
            }
        }
        self.set_status("stopped", None, None);
    }

    pub fn rebind(&self, app: AppHandle, root: PathBuf) -> Result<(), String> {
        self.start(app, root)
    }

    pub fn next_generation(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Records an internal canonical commit. The watcher consumes exactly one
    /// matching path+revision event; a later external edit at the same path has
    /// a different hash and therefore cannot be suppressed accidentally.
    pub fn record_internal_write(&self, path: PathBuf, revision: String) {
        let mut recent = self.recent_writes.lock().expect("recent writes poisoned");
        let now = Instant::now();
        recent.retain(|(_, _, at)| now.duration_since(*at) < Duration::from_secs(5));
        recent.push_back((path, revision, now));
        while recent.len() > 512 {
            recent.pop_front();
        }
    }

    fn consume_internal_write(&self, path: &Path) -> bool {
        let revision = match VaultStore::revision_at_path(path) {
            Ok(revision) => revision,
            Err(_) => return false,
        };
        let mut recent = self.recent_writes.lock().expect("recent writes poisoned");
        let now = Instant::now();
        recent.retain(|(_, _, at)| now.duration_since(*at) < Duration::from_secs(5));
        let Some(index) = recent
            .iter()
            .position(|(candidate, expected, _)| candidate == path && expected == &revision)
        else {
            return false;
        };
        recent.remove(index);
        true
    }

    pub fn set_status(&self, state: &'static str, root: Option<String>, message: Option<String>) {
        *self.status.lock().expect("watcher status poisoned") = WatcherStatus {
            state,
            root,
            message,
        };
    }
}

impl Drop for VaultWatcher {
    fn drop(&mut self) {
        if let Some(worker) = self.worker.get_mut().ok().and_then(Option::take) {
            let _ = worker.stop.send(());
            let _ = worker.join.join();
        }
    }
}

fn run_worker(app: AppHandle, root: PathBuf, stop_rx: mpsc::Receiver<()>) {
    let (event_tx, event_rx) = mpsc::channel::<notify::Result<Event>>();
    let mut watcher = match RecommendedWatcher::new(
        move |event| {
            let _ = event_tx.send(event);
        },
        Config::default(),
    ) {
        Ok(watcher) => watcher,
        Err(error) => {
            degrade(&app, &root, error.to_string());
            return;
        }
    };
    if let Err(error) = watcher.watch(&root, RecursiveMode::Recursive) {
        degrade(&app, &root, error.to_string());
        return;
    }

    let vault = app.state::<VaultStore>();
    let mut locations = vault.note_locations().unwrap_or_default();
    loop {
        if stop_rx.try_recv().is_ok() {
            break;
        }
        let first = match event_rx.recv_timeout(Duration::from_millis(100)) {
            Ok(event) => event,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        let mut events = vec![first];
        while let Ok(event) = event_rx.recv_timeout(DEBOUNCE) {
            events.push(event);
            if events.len() >= 4096 {
                break;
            }
        }
        match reconcile_events(&app, &root, &mut locations, events) {
            Ok(mut summary) if !summary.is_empty() => {
                summary.generation = app.state::<VaultWatcher>().next_generation();
                let _ = app.emit(CHANGE_EVENT, summary);
            }
            Ok(_) => {}
            Err(error) => degrade(&app, &root, error),
        }
    }
}

fn reconcile_events(
    app: &AppHandle,
    root: &Path,
    locations: &mut HashMap<PathBuf, String>,
    events: Vec<notify::Result<Event>>,
) -> Result<VaultChangeEvent, String> {
    let mut paths = HashSet::new();
    let mut fallback = false;
    let mut warnings = Vec::new();
    for event in events {
        match event {
            Ok(event) => paths.extend(event.paths),
            Err(error) => {
                fallback = true;
                warnings.push(format!("File watcher overflow/error: {error}"));
            }
        }
    }
    paths.retain(|path| !ignored(root, path));

    let storage = app.state::<Storage>();
    let vault = app.state::<VaultStore>();
    let mut summary = VaultChangeEvent {
        warnings,
        ..VaultChangeEvent::default()
    };

    if fallback || paths.len() > 500 {
        reconcile_index(&storage, &vault)?;
        *locations = vault.note_locations().map_err(|error| error.to_string())?;
        summary.full_rescan = true;
        return Ok(summary);
    }

    for path in paths {
        let relative = path.strip_prefix(root).unwrap_or(&path);
        let relative_text = relative.to_string_lossy().replace('\\', "/");
        if relative_text == ".skriuw/folders.json" {
            summary.folders_changed = true;
            fallback = true;
            continue;
        }
        if relative_text.starts_with(".skriuw/journal/") {
            summary.journals_changed = true;
            fallback = true;
            continue;
        }
        if relative_text == ".skriuw/journal-tags.json" {
            summary.tags_changed = true;
            fallback = true;
            continue;
        }
        if relative_text.starts_with(".skriuw/assets/cover-images/") {
            summary.covers_changed = true;
            continue;
        }
        if path.extension().and_then(|extension| extension.to_str()) != Some("md") {
            continue;
        }

        if path.is_file() && app.state::<VaultWatcher>().consume_internal_write(&path) {
            continue;
        }

        if path.is_file() {
            // Give truncate/write editors a brief chance to finish the body.
            thread::sleep(Duration::from_millis(35));
            match vault.note_at_path(&path) {
                Ok(Some(note)) => {
                    let existed = storage.get_note(&note.id).map_err(|e| e.to_string())?;
                    let changed = existed
                        .as_ref()
                        .is_none_or(|existing| !note_body_matches(existing, &note));
                    if changed {
                        storage.upsert_note(&note).map_err(|e| e.to_string())?;
                        if existed.is_some() {
                            summary.changed_note_ids.push(note.id.clone());
                        } else {
                            summary.added_note_ids.push(note.id.clone());
                        }
                    }
                    if let Some(previous_id) = locations.insert(path.clone(), note.id.clone()) {
                        if previous_id != note.id {
                            remove_if_missing(&vault, &storage, &previous_id, &mut summary)?;
                        }
                    }
                }
                Ok(None) => {}
                Err(error) => summary
                    .warnings
                    .push(format!("Could not read {}: {error}", path.display())),
            }
        } else if let Some(id) = locations.remove(&path) {
            remove_if_missing(&vault, &storage, &id, &mut summary)?;
        }
    }

    if fallback {
        reconcile_index(&storage, &vault)?;
        *locations = vault.note_locations().map_err(|error| error.to_string())?;
    }
    summary.changed_note_ids.sort();
    summary.changed_note_ids.dedup();
    summary.added_note_ids.sort();
    summary.added_note_ids.dedup();
    summary.deleted_note_ids.sort();
    summary.deleted_note_ids.dedup();
    Ok(summary)
}

fn remove_if_missing(
    vault: &VaultStore,
    storage: &Storage,
    id: &str,
    summary: &mut VaultChangeEvent,
) -> Result<(), String> {
    if vault
        .note_path(id)
        .map_err(|error| error.to_string())?
        .is_none()
    {
        storage.delete_note(id).map_err(|error| error.to_string())?;
        summary.deleted_note_ids.push(id.to_string());
    }
    Ok(())
}

fn ignored(root: &Path, path: &Path) -> bool {
    let relative = path.strip_prefix(root).unwrap_or(path);
    let text = relative.to_string_lossy().replace('\\', "/");
    text.starts_with(".skriuw/trash/")
        || text.starts_with(".skriuw/backup_import/")
        || text.starts_with(".skriuw/rich/")
        || text.contains(".skriuw-stage-")
        || text.contains(".skriuw-rollback-")
        || path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with('.') && name.contains(".tmp"))
}

fn degrade(app: &AppHandle, root: &Path, message: String) {
    app.state::<VaultWatcher>().set_status(
        "degraded",
        Some(root.to_string_lossy().into_owned()),
        Some(message.clone()),
    );
    let _ = app.emit(STATUS_EVENT, app.state::<VaultWatcher>().status());
    eprintln!("[skriuw] vault watcher degraded: {message}");
}

#[cfg(test)]
mod tests {
    use super::{ignored, VaultWatcher};
    use crate::VaultStore;
    use std::fs;
    use std::path::Path;
    use tempfile::tempdir;

    #[test]
    fn ignores_internal_metadata_and_restore_artifacts() {
        let root = Path::new("/vault");
        assert!(ignored(root, Path::new("/vault/.skriuw/trash/notes/a.md")));
        assert!(ignored(root, Path::new("/vault/.skriuw/rich/a.json")));
        assert!(ignored(root, Path::new("/vault/.skriuw-stage-1/a.md")));
        assert!(!ignored(root, Path::new("/vault/Notes/a.md")));
    }

    #[test]
    fn internal_revision_is_suppressed_once_but_external_revision_is_not() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "one").unwrap();
        let watcher = VaultWatcher::default();
        let revision = VaultStore::revision_at_path(&path).unwrap();
        watcher.record_internal_write(path.clone(), revision);
        assert!(watcher.consume_internal_write(&path));
        assert!(!watcher.consume_internal_write(&path));

        fs::write(&path, "external").unwrap();
        assert!(!watcher.consume_internal_write(&path));
    }
}
