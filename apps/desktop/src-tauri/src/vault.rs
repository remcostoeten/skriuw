//! Filesystem "vault" storage — the Obsidian-style backend where notes are real
//! `.md` files on disk with YAML frontmatter and folders are directories. This is
//! the eventual replacement for the SQLite `Storage`; it is currently ADDITIVE
//! and not yet wired into the live IPC commands (see lib.rs). The on-disk markdown
//! is the portable source of truth; `richContent` is intentionally NOT persisted
//! here — the TypeScript layer derives it from the markdown via `rich-document.ts`,
//! so reads return an empty rich document.
//!
//! Layout:
//!   <root>/
//!     <Folder Name>/<Note Name>.md     # note: frontmatter + markdown body
//!     .skriuw/folders.json             # folder metadata index (id, order, open)
//!
//! A note's `parentId` is derived from the directory that contains it (mapped
//! through the folder index), so moving a file between folders on disk moves the
//! note. Its identity (`id`) lives in the frontmatter, so renames preserve it.
#![allow(dead_code)]

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::Value;

use crate::storage::{Folder, JournalEntry, JournalTag, Note, TrashRecord};

const META_DIR: &str = ".skriuw";
const FOLDERS_FILE: &str = "folders.json";
/// Journal entries live as markdown under `.skriuw/journal/` (kept out of the
/// notes tree so they never surface as notes), and their tag palette in a JSON
/// index beside them. The markdown is the portable source of truth; the SQLite
/// `journal_entries`/`journal_tags` tables are a derived index rebuilt on launch.
const JOURNAL_DIR: &str = "journal";
const JOURNAL_TAGS_FILE: &str = "journal-tags.json";
/// Soft-deleted notes/folders live under `.skriuw/trash/` (inside META_DIR, so
/// the note scan and `reconcile_index` ignore them, exactly like journal). Each
/// trashed note's markdown moves to `trash/notes/<id>.md`; `trash/trash.json` is
/// the index of what's in the bin and where it came from.
const TRASH_DIR: &str = "trash";
const TRASH_NOTES_DIR: &str = "notes";
const TRASH_INDEX_FILE: &str = "trash.json";
/// Uploaded note cover images live under `.skriuw/assets/cover-images/`, named
/// by a generated id (see `save_cover_image`), so they never collide with the
/// note-name-derived paths under the vault root.
const ASSETS_DIR: &str = "assets";
const COVER_IMAGES_DIR: &str = "cover-images";

/// Filesystem-backed note/folder store rooted at a user-chosen vault directory.
pub struct VaultStore {
    root: Mutex<PathBuf>,
    write_lock: Mutex<()>,
    /// Lazy id → file-path cache backing `find_note_path`. Without it every note
    /// save re-reads and frontmatter-parses the entire vault to locate the file.
    /// Built on first lookup, maintained incrementally by upsert/delete/trash,
    /// dropped wholesale on batch moves and root changes. External file moves
    /// made while the app runs are caught by the per-hit staleness check;
    /// externally *added* files surface at the next launch reconcile, matching
    /// the vault's documented external-edit semantics.
    note_paths: Mutex<Option<HashMap<String, PathBuf>>>,
    /// User-chosen override for where cover images are stored, independent of
    /// the vault root (settings.json `coverAssetsRoot`). `None` falls back to
    /// `.skriuw/assets/cover-images` under the vault root. Applied live via
    /// `set_cover_root`, no restart required (unlike changing the vault root).
    cover_root: Mutex<Option<PathBuf>>,
}

impl VaultStore {
    /// Opens (creating if missing) a vault at `root`, ensuring the `.skriuw`
    /// metadata directory and an empty folder index exist.
    pub fn open(root: &Path) -> io::Result<Self> {
        fs::create_dir_all(root.join(META_DIR))?;
        let store = Self {
            root: Mutex::new(root.to_path_buf()),
            write_lock: Mutex::new(()),
            note_paths: Mutex::new(None),
            cover_root: Mutex::new(None),
        };
        if !store.folders_path().exists() {
            store.write_folders(&[])?;
        }
        if store.has_import_backup() {
            let _ = store.restore_import_backup();
        }
        Ok(store)
    }

    fn root(&self) -> PathBuf {
        self.root.lock().expect("vault root mutex poisoned").clone()
    }

    /// Rebinds the store to a different vault root in place. Snapshot restore
    /// can replace the configured vault path, so the long-lived Tauri state has
    /// to follow it without a full app restart.
    pub fn reload_root(&self, root: PathBuf) {
        let mut guard = self.root.lock().expect("vault root mutex poisoned");
        *guard = root;
        drop(guard);
        self.invalidate_note_paths();
        if self.has_import_backup() {
            let _ = self.restore_import_backup();
        }
    }

    fn folders_path(&self) -> PathBuf {
        self.root().join(META_DIR).join(FOLDERS_FILE)
    }

    fn read_folders(&self) -> io::Result<Vec<Folder>> {
        let raw = match fs::read_to_string(self.folders_path()) {
            Ok(raw) => raw,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error),
        };
        Ok(serde_json::from_str(&raw).unwrap_or_default())
    }

    fn write_folders(&self, folders: &[Folder]) -> io::Result<()> {
        let body = serde_json::to_string_pretty(folders).unwrap_or_else(|_| "[]".to_string());
        fs::write(self.folders_path(), format!("{body}\n"))
    }

    pub fn list_folders(&self) -> io::Result<Vec<Folder>> {
        self.read_folders()
    }

    /// Inserts or updates a folder and ensures its on-disk directory exists.
    pub fn upsert_folder(&self, folder: &Folder) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let mut folders = self.read_folders()?;
        match folders.iter_mut().find(|existing| existing.id == folder.id) {
            Some(existing) => clone_folder_into(existing, folder),
            None => folders.push(clone_folder(folder)),
        }
        let dir = self.folder_dir(&folders, &folder.id);
        fs::create_dir_all(dir)?;
        self.write_folders(&folders)
    }

    /// Deletes a folder, its descendant folders, and every note inside that
    /// subtree (by removing the directory tree), mirroring the SQLite cascade.
    pub fn delete_folder(&self, id: &str) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let folders = self.read_folders()?;
        let dir = self.folder_dir(&folders, id);
        let root = self.root();
        if dir.starts_with(&root) && dir != root && dir.exists() {
            fs::remove_dir_all(&dir)?;
        }
        self.invalidate_note_paths();
        let doomed = descendant_ids(&folders, id);
        let kept: Vec<Folder> = folders
            .into_iter()
            .filter(|folder| !doomed.contains(&folder.id))
            .collect();
        self.write_folders(&kept)
    }

    pub fn list_notes(&self) -> io::Result<Vec<Note>> {
        let folders = self.read_folders()?;
        let dir_to_parent = self.dir_to_folder_id(&folders);
        let mut notes = Vec::new();
        let root = self.root();
        self.collect_notes(&root, &dir_to_parent, &mut notes)?;
        Ok(notes)
    }

    pub fn get_note(&self, id: &str) -> io::Result<Option<Note>> {
        Ok(self.list_notes()?.into_iter().find(|note| note.id == id))
    }

    /// Writes a note as `<parent folder dir>/<name>.md`. If the same id already
    /// lives at a different path (renamed or moved between folders), the old file
    /// is removed first so identity follows the note rather than the path.
    pub fn upsert_note(&self, note: &Note) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let folders = self.read_folders()?;
        let dir = match &note.parent_id {
            Some(parent) => self.folder_dir(&folders, parent),
            None => self.root(),
        };
        fs::create_dir_all(&dir)?;

        if let Some(previous) = self.find_note_path(note.id.as_str())? {
            let target = dir.join(note_file_name(&note.name));
            if previous != target {
                let _ = fs::remove_file(previous);
            }
        }

        let target = dir.join(note_file_name(&note.name));
        fs::write(&target, render_note(note))?;
        self.cache_note_path(&note.id, target);
        Ok(())
    }

    pub fn delete_note(&self, id: &str) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        if let Some(path) = self.find_note_path(id)? {
            fs::remove_file(path)?;
        }
        self.uncache_note_path(id);
        Ok(())
    }

    fn trash_dir(&self) -> PathBuf {
        self.root().join(META_DIR).join(TRASH_DIR)
    }

    fn trash_notes_dir(&self) -> PathBuf {
        self.trash_dir().join(TRASH_NOTES_DIR)
    }

    fn trash_index_path(&self) -> PathBuf {
        self.trash_dir().join(TRASH_INDEX_FILE)
    }

    fn trash_note_file(&self, id: &str) -> PathBuf {
        self.trash_notes_dir().join(format!("{id}.md"))
    }

    fn read_trash(&self) -> io::Result<Vec<TrashRecord>> {
        let raw = match fs::read_to_string(self.trash_index_path()) {
            Ok(raw) => raw,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error),
        };
        Ok(serde_json::from_str(&raw).unwrap_or_default())
    }

    fn write_trash(&self, records: &[TrashRecord]) -> io::Result<()> {
        fs::create_dir_all(self.trash_dir())?;
        let body = serde_json::to_string_pretty(records).unwrap_or_else(|_| "[]".to_string());
        fs::write(self.trash_index_path(), format!("{body}\n"))
    }

    pub fn list_trash(&self) -> io::Result<Vec<TrashRecord>> {
        self.read_trash()
    }

    /// Soft-deletes a single note: moves its markdown into the trash area and
    /// records where it came from so it can be restored to the same folder.
    pub fn trash_note(&self, id: &str, deleted_at: i64) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let Some(note) = self.list_notes()?.into_iter().find(|note| note.id == id) else {
            return Ok(());
        };
        let Some(path) = self.find_note_path(id)? else {
            return Ok(());
        };
        fs::create_dir_all(self.trash_notes_dir())?;
        move_file(&path, &self.trash_note_file(id))?;
        self.uncache_note_path(id);

        let mut records = self.read_trash()?;
        records.push(TrashRecord {
            batch_id: format!("note:{id}"),
            kind: "note".to_string(),
            id: id.to_string(),
            name: note.name,
            parent_id: note.parent_id,
            sort_order: note.sort_order,
            deleted_at,
        });
        self.write_trash(&records)
    }

    /// Soft-deletes a folder subtree: moves every contained note's markdown into
    /// the trash, records the folder + note structure under one batch, then
    /// removes the now-empty directories and folder index entries.
    pub fn trash_folder(&self, id: &str, deleted_at: i64) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let folders = self.read_folders()?;
        if !folders.iter().any(|folder| folder.id == id) {
            return Ok(());
        }
        let subtree = descendant_ids(&folders, id);
        let batch_id = format!("folder:{id}");
        let mut records = self.read_trash()?;

        fs::create_dir_all(self.trash_notes_dir())?;
        for note in self.list_notes()? {
            let in_subtree = note
                .parent_id
                .as_deref()
                .is_some_and(|parent| subtree.iter().any(|folder_id| folder_id.as_str() == parent));
            if !in_subtree {
                continue;
            }
            if let Some(path) = self.find_note_path(&note.id)? {
                move_file(&path, &self.trash_note_file(&note.id))?;
            }
            records.push(TrashRecord {
                batch_id: batch_id.clone(),
                kind: "note".to_string(),
                id: note.id,
                name: note.name,
                parent_id: note.parent_id,
                sort_order: note.sort_order,
                deleted_at,
            });
        }

        for folder in &folders {
            if subtree.iter().any(|folder_id| folder_id == &folder.id) {
                records.push(TrashRecord {
                    batch_id: batch_id.clone(),
                    kind: "folder".to_string(),
                    id: folder.id.clone(),
                    name: folder.name.clone(),
                    parent_id: folder.parent_id.clone(),
                    sort_order: folder.sort_order,
                    deleted_at,
                });
            }
        }

        let dir = self.folder_dir(&folders, id);
        let root = self.root();
        if dir.starts_with(&root) && dir != root && dir.exists() {
            fs::remove_dir_all(&dir)?;
        }
        self.invalidate_note_paths();
        let kept: Vec<Folder> = folders
            .into_iter()
            .filter(|folder| !subtree.iter().any(|folder_id| folder_id == &folder.id))
            .collect();
        self.write_folders(&kept)?;
        self.write_trash(&records)
    }

    /// Restores a batch: recreates its folders, moves note files back to their
    /// original folders (or the root if that folder is gone), and drops the
    /// records. Returns Ok even if the batch is unknown (idempotent).
    pub fn restore_batch(&self, batch_id: &str) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let records = self.read_trash()?;
        let (members, rest): (Vec<TrashRecord>, Vec<TrashRecord>) = records
            .into_iter()
            .partition(|record| record.batch_id == batch_id);
        if members.is_empty() {
            return Ok(());
        }

        let mut folders = self.read_folders()?;
        let mut valid_ids: std::collections::HashSet<String> =
            folders.iter().map(|folder| folder.id.clone()).collect();
        for record in members.iter().filter(|record| record.kind == "folder") {
            valid_ids.insert(record.id.clone());
        }
        for record in members.iter().filter(|record| record.kind == "folder") {
            let parent_id = record
                .parent_id
                .clone()
                .filter(|parent| valid_ids.contains(parent));
            folders.push(Folder {
                id: record.id.clone(),
                name: record.name.clone(),
                parent_id,
                sort_order: record.sort_order,
                is_open: true,
            });
        }
        self.write_folders(&folders)?;
        for record in members.iter().filter(|record| record.kind == "folder") {
            fs::create_dir_all(self.folder_dir(&folders, &record.id))?;
        }

        for record in members.iter().filter(|record| record.kind == "note") {
            let dir = match record
                .parent_id
                .as_deref()
                .filter(|parent| valid_ids.contains(*parent))
            {
                Some(parent) => self.folder_dir(&folders, parent),
                None => self.root(),
            };
            fs::create_dir_all(&dir)?;
            let source = self.trash_note_file(&record.id);
            if source.exists() {
                move_file(&source, &dir.join(note_file_name(&record.name)))?;
            }
        }

        self.invalidate_note_paths();
        self.write_trash(&rest)
    }

    /// Permanently removes a batch from the trash (deletes the trashed note files
    /// and drops the records). Folder records have no file to remove.
    pub fn purge_batch(&self, batch_id: &str) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let records = self.read_trash()?;
        let (members, rest): (Vec<TrashRecord>, Vec<TrashRecord>) = records
            .into_iter()
            .partition(|record| record.batch_id == batch_id);
        for record in members.iter().filter(|record| record.kind == "note") {
            let _ = fs::remove_file(self.trash_note_file(&record.id));
        }
        self.write_trash(&rest)
    }

    /// Empties the trash entirely.
    pub fn empty_trash(&self) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let dir = self.trash_dir();
        if dir.exists() {
            fs::remove_dir_all(&dir)?;
        }
        self.write_trash(&[])
    }

    /// Resolves the directory cover images are read from/written to: the
    /// user's override if one is set, otherwise `.skriuw/assets/cover-images`
    /// under the vault root.
    pub fn cover_images_dir(&self) -> PathBuf {
        if let Some(root) = self.cover_root.lock().expect("cover root mutex poisoned").clone() {
            return root;
        }
        self.root().join(META_DIR).join(ASSETS_DIR).join(COVER_IMAGES_DIR)
    }

    /// Sets (or clears, with `None`) the cover-images directory override.
    /// Takes effect immediately for subsequent saves/reads.
    pub fn set_cover_root(&self, root: Option<PathBuf>) {
        *self.cover_root.lock().expect("cover root mutex poisoned") = root;
    }

    /// Saves an uploaded cover image under `.skriuw/assets/cover-images/`,
    /// keyed by a generated id so re-uploads never collide, and returns the
    /// relative filename (e.g. `"<uuid>.png"`) to persist on the note.
    pub fn save_cover_image(&self, file_name: &str, bytes: &[u8]) -> io::Result<String> {
        let ext = Path::new(file_name)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_lowercase())
            .filter(|ext| ext.chars().all(|c| c.is_ascii_alphanumeric()))
            .unwrap_or_else(|| "png".to_string());
        let relative = format!("{}.{ext}", uuid::Uuid::new_v4());
        let dir = self.cover_images_dir();
        fs::create_dir_all(&dir)?;
        fs::write(dir.join(&relative), bytes)?;
        Ok(relative)
    }

    /// Reads back a cover image saved by `save_cover_image`. `relative` must be
    /// a bare filename (no path separators), so a note's cover value can never
    /// be used to read arbitrary files off disk.
    pub fn read_cover_image(&self, relative: &str) -> io::Result<Vec<u8>> {
        if relative.is_empty()
            || relative.contains('/')
            || relative.contains('\\')
            || relative == "."
            || relative == ".."
        {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid cover image path"));
        }
        fs::read(self.cover_images_dir().join(relative))
    }

    /// Absolute directory for a folder id, built by walking the parent chain and
    /// joining sanitized folder names under the vault root.
    fn folder_dir(&self, folders: &[Folder], id: &str) -> PathBuf {
        let by_id: HashMap<&str, &Folder> = folders
            .iter()
            .map(|folder| (folder.id.as_str(), folder))
            .collect();
        let mut segments: Vec<String> = Vec::new();
        let mut current = Some(id);
        let mut seen = 0usize;
        while let Some(folder_id) = current {
            let Some(folder) = by_id.get(folder_id) else {
                break;
            };
            segments.push(sanitize_segment(&folder.name));
            current = folder.parent_id.as_deref();
            seen += 1;
            if seen > folders.len() {
                break;
            }
        }
        segments.reverse();
        let mut path = self.root();
        for segment in segments {
            path.push(segment);
        }
        path
    }

    /// Maps each folder's absolute directory back to its folder id, for deriving
    /// a note's parent from the directory it sits in.
    fn dir_to_folder_id(&self, folders: &[Folder]) -> HashMap<PathBuf, String> {
        folders
            .iter()
            .map(|folder| (self.folder_dir(folders, &folder.id), folder.id.clone()))
            .collect()
    }

    fn collect_notes(
        &self,
        dir: &Path,
        dir_to_parent: &HashMap<PathBuf, String>,
        out: &mut Vec<Note>,
    ) -> io::Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let file_type = entry.file_type()?;
            if file_type.is_dir() {
                if entry.file_name() == META_DIR {
                    continue;
                }
                self.collect_notes(&path, dir_to_parent, out)?;
            } else if is_markdown(&path) {
                let parent_id = dir_to_parent.get(dir).cloned();
                if let Some(note) = self.read_note(&path, parent_id)? {
                    out.push(note);
                }
            }
        }
        Ok(())
    }

    fn read_note(&self, path: &Path, parent_id: Option<String>) -> io::Result<Option<Note>> {
        let raw = fs::read_to_string(path)?;
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Untitled.md")
            .to_string();
        Ok(Some(parse_note(&raw, name, parent_id)))
    }

    fn find_note_path(&self, id: &str) -> io::Result<Option<PathBuf>> {
        let mut cache = self.note_paths.lock().expect("vault path cache poisoned");
        if cache.is_none() {
            *cache = Some(self.build_note_paths()?);
        }
        let map = cache.as_mut().expect("cache populated above");

        if let Some(path) = map.get(id) {
            let still_there = fs::read_to_string(path)
                .ok()
                .and_then(|raw| frontmatter_id(&raw))
                .is_some_and(|found| found == id);
            if still_there {
                return Ok(Some(path.clone()));
            }
            // The file moved or changed under us (external edit) — rebuild once.
            *map = self.build_note_paths()?;
            return Ok(map.get(id).cloned());
        }
        Ok(None)
    }

    fn build_note_paths(&self) -> io::Result<HashMap<String, PathBuf>> {
        let mut map = HashMap::new();
        let root = self.root();
        self.walk_markdown(&root, &mut |path, raw| {
            if let Some(id) = frontmatter_id(raw) {
                map.insert(id, path.to_path_buf());
            }
        })?;
        Ok(map)
    }

    fn invalidate_note_paths(&self) {
        *self.note_paths.lock().expect("vault path cache poisoned") = None;
    }

    fn cache_note_path(&self, id: &str, path: PathBuf) {
        if let Some(map) = self
            .note_paths
            .lock()
            .expect("vault path cache poisoned")
            .as_mut()
        {
            map.insert(id.to_string(), path);
        }
    }

    fn uncache_note_path(&self, id: &str) {
        if let Some(map) = self
            .note_paths
            .lock()
            .expect("vault path cache poisoned")
            .as_mut()
        {
            map.remove(id);
        }
    }

    fn walk_markdown(&self, dir: &Path, visit: &mut dyn FnMut(&Path, &str)) -> io::Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if entry.file_type()?.is_dir() {
                if entry.file_name() == META_DIR {
                    continue;
                }
                self.walk_markdown(&path, visit)?;
            } else if is_markdown(&path) {
                if let Ok(raw) = fs::read_to_string(&path) {
                    visit(&path, &raw);
                }
            }
        }
        Ok(())
    }

    fn journal_dir(&self) -> PathBuf {
        self.root().join(META_DIR).join(JOURNAL_DIR)
    }

    fn journal_tags_path(&self) -> PathBuf {
        self.root().join(META_DIR).join(JOURNAL_TAGS_FILE)
    }

    pub fn list_journal_entries(&self) -> io::Result<Vec<JournalEntry>> {
        let dir = self.journal_dir();
        let mut entries = Vec::new();
        let read = match fs::read_dir(&dir) {
            Ok(read) => read,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(entries),
            Err(error) => return Err(error),
        };
        for entry in read {
            let path = entry?.path();
            if is_markdown(&path) {
                if let Ok(raw) = fs::read_to_string(&path) {
                    if let Some(parsed) = parse_journal_entry(&raw) {
                        entries.push(parsed);
                    }
                }
            }
        }
        Ok(entries)
    }

    /// Writes a journal entry as `.skriuw/journal/<dateKey>-<id>.md`. If the same
    /// id already lives at a different filename (its dateKey changed), the stale
    /// file is removed first so identity follows the entry.
    pub fn upsert_journal_entry(&self, entry: &JournalEntry) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let dir = self.journal_dir();
        fs::create_dir_all(&dir)?;
        let target = dir.join(journal_file_name(entry));
        if let Some(previous) = self.find_journal_path(&entry.id)? {
            if previous != target {
                let _ = fs::remove_file(previous);
            }
        }
        fs::write(&target, render_journal_entry(entry))
    }

    pub fn delete_journal_entry(&self, id: &str) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        if let Some(path) = self.find_journal_path(id)? {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    fn find_journal_path(&self, id: &str) -> io::Result<Option<PathBuf>> {
        let dir = self.journal_dir();
        let read = match fs::read_dir(&dir) {
            Ok(read) => read,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        for entry in read {
            let path = entry?.path();
            if is_markdown(&path) {
                if let Ok(raw) = fs::read_to_string(&path) {
                    if frontmatter_id(&raw).as_deref() == Some(id) {
                        return Ok(Some(path));
                    }
                }
            }
        }
        Ok(None)
    }

    pub fn list_journal_tags(&self) -> io::Result<Vec<JournalTag>> {
        let raw = match fs::read_to_string(self.journal_tags_path()) {
            Ok(raw) => raw,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error),
        };
        Ok(serde_json::from_str(&raw).unwrap_or_default())
    }

    pub fn upsert_journal_tag(&self, tag: &JournalTag) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let mut tags = self.list_journal_tags()?;
        match tags.iter_mut().find(|existing| existing.id == tag.id) {
            Some(existing) => {
                existing.name = tag.name.clone();
                existing.color = tag.color.clone();
                existing.usage_count = tag.usage_count;
            }
            None => tags.push(JournalTag {
                id: tag.id.clone(),
                name: tag.name.clone(),
                color: tag.color.clone(),
                usage_count: tag.usage_count,
            }),
        }
        self.write_journal_tags(&tags)
    }

    pub fn delete_journal_tag(&self, id: &str) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let tags: Vec<JournalTag> = self
            .list_journal_tags()?
            .into_iter()
            .filter(|tag| tag.id != id)
            .collect();
        self.write_journal_tags(&tags)
    }

    fn backup_dir(&self) -> PathBuf {
        self.root().join(META_DIR).join("backup_import")
    }

    pub fn has_import_backup(&self) -> bool {
        self.backup_dir().exists()
    }

    /// Creates a backup of the current vault (folders list, journal tags, journal entries, and all notes).
    pub fn create_import_backup(&self) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let backup_dir = self.backup_dir();
        if backup_dir.exists() {
            fs::remove_dir_all(&backup_dir)?;
        }
        fs::create_dir_all(&backup_dir)?;

        let root = self.root();

        // 1. Copy all folders and notes (everything in root except META_DIR)
        for entry in fs::read_dir(&root)? {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name();
            if name == META_DIR {
                continue;
            }
            let target = backup_dir.join(&name);
            if path.is_dir() {
                copy_dir_all(&path, &target)?;
            } else {
                fs::copy(&path, &target)?;
            }
        }

        // 2. Copy selected metadata folder contents
        let meta_src = root.join(META_DIR);
        let meta_dst = backup_dir.join(META_DIR);
        fs::create_dir_all(&meta_dst)?;

        let files_to_copy = [FOLDERS_FILE, JOURNAL_TAGS_FILE, TRASH_INDEX_FILE];
        for file in &files_to_copy {
            let src_file = meta_src.join(file);
            if src_file.exists() {
                fs::copy(&src_file, meta_dst.join(file))?;
            }
        }

        let dirs_to_copy = [JOURNAL_DIR, TRASH_DIR];
        for dir in &dirs_to_copy {
            let src_dir = meta_src.join(dir);
            if src_dir.exists() {
                copy_dir_all(&src_dir, &meta_dst.join(dir))?;
            }
        }

        Ok(())
    }

    /// Restores the vault to the backed up state.
    pub fn restore_import_backup(&self) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let backup_dir = self.backup_dir();
        if !backup_dir.exists() {
            return Ok(());
        }

        let root = self.root();

        // 1. Delete everything in the vault root, EXCEPT for `.skriuw`.
        for entry in fs::read_dir(&root)? {
            let entry = entry?;
            let path = entry.path();
            if entry.file_name() == META_DIR {
                continue;
            }
            if path.is_dir() {
                fs::remove_dir_all(&path)?;
            } else {
                fs::remove_file(&path)?;
            }
        }

        // 2. Also delete folders.json, journal-tags.json, trash/, journal/
        let meta_dir = root.join(META_DIR);
        let folders_json = meta_dir.join(FOLDERS_FILE);
        if folders_json.exists() {
            let _ = fs::remove_file(folders_json);
        }
        let journal_tags_json = meta_dir.join(JOURNAL_TAGS_FILE);
        if journal_tags_json.exists() {
            let _ = fs::remove_file(journal_tags_json);
        }
        let trash_dir = meta_dir.join(TRASH_DIR);
        if trash_dir.exists() {
            let _ = fs::remove_dir_all(trash_dir);
        }
        let journal_dir = meta_dir.join(JOURNAL_DIR);
        if journal_dir.exists() {
            let _ = fs::remove_dir_all(journal_dir);
        }

        // 3. Copy everything from backup_dir back to the vault root
        copy_dir_all(&backup_dir, &root)?;

        // 4. Invalidate paths cache
        self.invalidate_note_paths();

        // 5. Delete the backup directory.
        fs::remove_dir_all(&backup_dir)?;

        Ok(())
    }

    /// Discards the backup directory after a successful import.
    pub fn discard_import_backup(&self) -> io::Result<()> {
        let _guard = self.write_lock.lock().expect("vault write lock poisoned");
        let backup_dir = self.backup_dir();
        if backup_dir.exists() {
            fs::remove_dir_all(&backup_dir)?;
        }
        Ok(())
    }

    fn write_journal_tags(&self, tags: &[JournalTag]) -> io::Result<()> {
        fs::create_dir_all(self.root().join(META_DIR))?;
        let body = serde_json::to_string_pretty(tags).unwrap_or_else(|_| "[]".to_string());
        fs::write(self.journal_tags_path(), format!("{body}\n"))
    }
}

fn copy_dir_all(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

fn clone_folder(folder: &Folder) -> Folder {
    Folder {
        id: folder.id.clone(),
        name: folder.name.clone(),
        parent_id: folder.parent_id.clone(),
        sort_order: folder.sort_order,
        is_open: folder.is_open,
    }
}

fn clone_folder_into(target: &mut Folder, source: &Folder) {
    target.name = source.name.clone();
    target.parent_id = source.parent_id.clone();
    target.sort_order = source.sort_order;
    target.is_open = source.is_open;
}

/// Ids of `root` plus every folder transitively parented under it.
fn descendant_ids(folders: &[Folder], root: &str) -> Vec<String> {
    let mut doomed = vec![root.to_string()];
    let mut changed = true;
    while changed {
        changed = false;
        for folder in folders {
            if let Some(parent) = &folder.parent_id {
                if doomed.iter().any(|id| id == parent) && !doomed.contains(&folder.id) {
                    doomed.push(folder.id.clone());
                    changed = true;
                }
            }
        }
    }
    doomed
}

fn is_markdown(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str()) == Some("md")
}

/// Moves a file, creating the parent directory. Falls back to copy+remove when a
/// plain rename fails (e.g. the trash area sits on a different mount).
fn move_file(from: &Path, to: &Path) -> io::Result<()> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent)?;
    }
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    fs::copy(from, to)?;
    fs::remove_file(from)
}

fn note_file_name(name: &str) -> String {
    let sanitized = sanitize_segment(name);
    if sanitized.to_lowercase().ends_with(".md") {
        sanitized
    } else {
        format!("{sanitized}.md")
    }
}

/// Strips path separators and control characters so a folder/note name is safe
/// as a single on-disk path segment.
fn sanitize_segment(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if std::path::is_separator(c) || c.is_control() {
                '-'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "Untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Renders a note to its on-disk form: YAML frontmatter (JSON-valued, which is
/// valid YAML) followed by the markdown body.
fn render_note(note: &Note) -> String {
    let id = serde_json::to_string(&note.id).unwrap_or_else(|_| "\"\"".to_string());
    let tags = serde_json::to_string(&note.tags).unwrap_or_else(|_| "[]".to_string());
    let properties = note.properties.to_string();
    let mode = serde_json::to_string(&note.preferred_editor_mode)
        .unwrap_or_else(|_| "\"block\"".to_string());
    let icon_line = note
        .icon
        .as_ref()
        .map(|v| format!("icon: {}\n", serde_json::to_string(v).unwrap_or_default()))
        .unwrap_or_default();
    let cover_line = note
        .cover
        .as_ref()
        .map(|v| format!("cover: {}\n", serde_json::to_string(v).unwrap_or_default()))
        .unwrap_or_default();
    format!(
		"---\nid: {id}\ntags: {tags}\nproperties: {properties}\nsortOrder: {sort}\npreferredEditorMode: {mode}\ncreatedAt: {created}\nmodifiedAt: {modified}\n{icon_line}{cover_line}---\n{body}",
		sort = note.sort_order,
		created = note.created_at,
		modified = note.modified_at,
		body = note.content,
	)
}

/// Splits a file into (frontmatter block, body). Returns `(None, whole)` when no
/// leading `---` frontmatter fence is present.
fn split_frontmatter(text: &str) -> (Option<&str>, &str) {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let Some(rest) = text.strip_prefix("---\n") else {
        return (None, text);
    };
    if let Some(end) = rest.find("\n---\n") {
        return (Some(&rest[..end]), &rest[end + 5..]);
    }
    if let Some(stripped) = rest.strip_suffix("\n---") {
        return (Some(stripped), "");
    }
    (None, text)
}

fn parse_note(raw: &str, name: String, parent_id: Option<String>) -> Note {
    let normalized = raw.replace("\r\n", "\n");
    let (frontmatter, body) = split_frontmatter(&normalized);
    let mut id = name_stem(&name);
    let mut tags: Vec<String> = Vec::new();
    let mut properties = Value::Array(Vec::new());
    let mut sort_order = 0i64;
    let mut preferred_editor_mode = "block".to_string();
    let mut created_at = 0i64;
    let mut modified_at = 0i64;
    let mut icon: Option<String> = None;
    let mut cover: Option<String> = None;

    if let Some(block) = frontmatter {
        for line in block.lines() {
            let Some((key, value)) = line.split_once(':') else {
                continue;
            };
            let value = value.trim();
            match key.trim() {
                "id" => {
                    if let Some(parsed) = parse_json_string(value) {
                        id = parsed;
                    }
                }
                "tags" => tags = serde_json::from_str(value).unwrap_or_default(),
                "properties" => {
                    properties =
                        serde_json::from_str(value).unwrap_or_else(|_| Value::Array(Vec::new()))
                }
                "sortOrder" => sort_order = value.parse().unwrap_or(0),
                "preferredEditorMode" => {
                    if let Some(parsed) = parse_json_string(value) {
                        preferred_editor_mode = parsed;
                    }
                }
                "createdAt" => created_at = value.parse().unwrap_or(0),
                "modifiedAt" => modified_at = value.parse().unwrap_or(0),
                "icon" => icon = parse_json_string(value),
                "cover" => cover = parse_json_string(value),
                _ => {}
            }
        }
    }

    Note {
        id,
        name,
        content: body.to_string(),
        rich_content: Value::Array(Vec::new()),
        preferred_editor_mode,
        parent_id,
        sort_order,
        tags,
        properties,
        created_at,
        modified_at,
        icon,
        cover,
    }
}

/// Reads just the frontmatter `id` from raw file text, for id-based file lookup.
fn frontmatter_id(raw: &str) -> Option<String> {
    let normalized = raw.replace("\r\n", "\n");
    let (frontmatter, _) = split_frontmatter(&normalized);
    let block = frontmatter?;
    for line in block.lines() {
        if let Some((key, value)) = line.split_once(':') {
            if key.trim() == "id" {
                return parse_json_string(value.trim());
            }
        }
    }
    None
}

/// Parses a JSON string literal, falling back to the raw (unquoted) token so a
/// hand-edited `id: foo` still reads as `foo`.
fn parse_json_string(value: &str) -> Option<String> {
    if value.is_empty() {
        return None;
    }
    match serde_json::from_str::<String>(value) {
        Ok(parsed) => Some(parsed),
        Err(_) => Some(value.to_string()),
    }
}

fn name_stem(name: &str) -> String {
    name.strip_suffix(".md").unwrap_or(name).to_string()
}

fn journal_file_name(entry: &JournalEntry) -> String {
    format!(
        "{}-{}.md",
        sanitize_segment(&entry.date_key),
        sanitize_segment(&entry.id),
    )
}

/// Renders a journal entry to YAML frontmatter (JSON-valued) + markdown body.
/// `mood` is omitted entirely when absent rather than written as `null`.
fn render_journal_entry(entry: &JournalEntry) -> String {
    let id = serde_json::to_string(&entry.id).unwrap_or_else(|_| "\"\"".to_string());
    let date_key = serde_json::to_string(&entry.date_key).unwrap_or_else(|_| "\"\"".to_string());
    let tags = serde_json::to_string(&entry.tags).unwrap_or_else(|_| "[]".to_string());
    let title_line = match &entry.title {
        Some(title) => {
            let value = serde_json::to_string(title).unwrap_or_else(|_| "\"\"".to_string());
            format!("title: {value}\n")
        }
        None => String::new(),
    };
    let mood_line = match &entry.mood {
        Some(mood) => {
            let value = serde_json::to_string(mood).unwrap_or_else(|_| "\"\"".to_string());
            format!("mood: {value}\n")
        }
        None => String::new(),
    };
    // Structured document is written compactly on one line (no embedded newlines)
    // so the line-oriented frontmatter parser stays intact. Omitted for entries
    // with no rich content to keep plain journal files clean.
    let rich_line = if entry
        .rich_content
        .as_array()
        .map(|items| items.is_empty())
        .unwrap_or(true)
    {
        String::new()
    } else {
        let value = serde_json::to_string(&entry.rich_content).unwrap_or_else(|_| "[]".to_string());
        format!("richContent: {value}\n")
    };
    format!(
		"---\nid: {id}\ndateKey: {date_key}\n{title_line}{mood_line}tags: {tags}\n{rich_line}createdAt: {created}\nupdatedAt: {updated}\n---\n{body}",
		created = entry.created_at,
		updated = entry.updated_at,
		body = entry.content,
	)
}

fn parse_journal_entry(raw: &str) -> Option<JournalEntry> {
    let normalized = raw.replace("\r\n", "\n");
    let (frontmatter, body) = split_frontmatter(&normalized);
    let block = frontmatter?;

    let mut id: Option<String> = None;
    let mut date_key = String::new();
    let mut title: Option<String> = None;
    let mut mood: Option<String> = None;
    let mut tags: Vec<String> = Vec::new();
    let mut rich_content = serde_json::Value::Array(Vec::new());
    let mut created_at = 0i64;
    let mut updated_at = 0i64;

    for line in block.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        match key.trim() {
            "id" => id = parse_json_string(value),
            "dateKey" => date_key = parse_json_string(value).unwrap_or_default(),
            "title" => title = parse_json_string(value),
            "mood" => mood = parse_json_string(value),
            "tags" => tags = serde_json::from_str(value).unwrap_or_default(),
            "richContent" => {
                rich_content =
                    serde_json::from_str(value).unwrap_or(serde_json::Value::Array(Vec::new()))
            }
            "createdAt" => created_at = value.parse().unwrap_or(0),
            "updatedAt" => updated_at = value.parse().unwrap_or(0),
            _ => {}
        }
    }

    Some(JournalEntry {
        id: id?,
        date_key,
        title,
        content: body.to_string(),
        rich_content,
        tags,
        mood,
        created_at,
        updated_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn note(id: &str, name: &str, parent: Option<&str>) -> Note {
        Note {
            id: id.to_string(),
            name: name.to_string(),
            content: "hello world".to_string(),
            rich_content: serde_json::json!([{ "type": "paragraph" }]),
            preferred_editor_mode: "block".to_string(),
            parent_id: parent.map(|p| p.to_string()),
            sort_order: 3,
            tags: vec!["a".to_string(), "b".to_string()],
            properties: serde_json::json!([{ "id": "p1", "type": "text", "name": "Status", "value": "open" }]),
            icon: None,
            cover: None,
            created_at: 111,
            modified_at: 222,
        }
    }

    fn folder(id: &str, name: &str, parent: Option<&str>) -> Folder {
        Folder {
            id: id.to_string(),
            name: name.to_string(),
            parent_id: parent.map(|p| p.to_string()),
            sort_order: 0,
            is_open: true,
        }
    }

    #[test]
    fn note_roundtrips_through_markdown_and_frontmatter() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store
            .upsert_note(&note("n1", "Groceries.md", None))
            .unwrap();

        let got = store.get_note("n1").unwrap().unwrap();
        assert_eq!(got.id, "n1");
        assert_eq!(got.name, "Groceries.md");
        assert_eq!(got.content, "hello world");
        assert_eq!(got.tags, vec!["a".to_string(), "b".to_string()]);
        assert_eq!(got.properties[0]["name"], "Status");
        assert_eq!(got.sort_order, 3);
        assert_eq!(got.created_at, 111);
        assert_eq!(got.modified_at, 222);
        // richContent is derived TS-side; the vault returns an empty document.
        assert_eq!(got.rich_content, Value::Array(Vec::new()));
    }

    #[test]
    fn note_is_a_real_md_file_on_disk() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store.upsert_note(&note("n1", "Idea.md", None)).unwrap();

        let path = dir.path().join("Idea.md");
        assert!(path.exists());
        let raw = fs::read_to_string(path).unwrap();
        assert!(raw.starts_with("---\n"));
        assert!(raw.contains("id: \"n1\""));
        assert!(raw.trim_end().ends_with("hello world"));
    }

    #[test]
    fn notes_nest_under_folder_directories_with_derived_parent() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store
            .upsert_folder(&folder("f-inbox", "Inbox", None))
            .unwrap();
        store
            .upsert_folder(&folder("f-proj", "Projects", Some("f-inbox")))
            .unwrap();
        store
            .upsert_note(&note("n1", "Skriuw.md", Some("f-proj")))
            .unwrap();

        assert!(dir.path().join("Inbox/Projects/Skriuw.md").exists());
        let got = store.get_note("n1").unwrap().unwrap();
        assert_eq!(got.parent_id.as_deref(), Some("f-proj"));
    }

    #[test]
    fn moving_a_note_to_a_new_folder_relocates_the_file_and_keeps_identity() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store.upsert_folder(&folder("f1", "Archive", None)).unwrap();
        store.upsert_note(&note("n1", "Note.md", None)).unwrap();
        assert!(dir.path().join("Note.md").exists());

        store
            .upsert_note(&note("n1", "Note.md", Some("f1")))
            .unwrap();

        assert!(!dir.path().join("Note.md").exists());
        assert!(dir.path().join("Archive/Note.md").exists());
        assert_eq!(store.list_notes().unwrap().len(), 1);
    }

    #[test]
    fn reload_root_rebinds_the_store_to_a_new_vault() {
        let first = tempdir().unwrap();
        let second = tempdir().unwrap();
        let store = VaultStore::open(first.path()).unwrap();
        store.upsert_note(&note("n1", "First.md", None)).unwrap();
        assert!(first.path().join("First.md").exists());

        store.reload_root(second.path().to_path_buf());
        assert!(store.list_notes().unwrap().is_empty());

        store.upsert_note(&note("n2", "Second.md", None)).unwrap();
        assert!(!first.path().join("Second.md").exists());
        assert!(second.path().join("Second.md").exists());
    }

    #[test]
    fn external_edit_to_the_markdown_is_reflected_on_read() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store.upsert_note(&note("n1", "Note.md", None)).unwrap();

        let path = dir.path().join("Note.md");
        let raw = fs::read_to_string(&path).unwrap();
        let edited = raw.replace("hello world", "edited externally");
        fs::write(&path, edited).unwrap();

        assert_eq!(
            store.get_note("n1").unwrap().unwrap().content,
            "edited externally"
        );
    }

    #[test]
    fn frontmatter_less_markdown_is_read_with_id_from_filename() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        fs::write(dir.path().join("Loose.md"), "just some text").unwrap();

        let got = store.get_note("Loose").unwrap().unwrap();
        assert_eq!(got.content, "just some text");
        assert_eq!(got.name, "Loose.md");
    }

    #[test]
    fn deleting_a_folder_removes_its_subtree_and_notes() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store.upsert_folder(&folder("root", "Root", None)).unwrap();
        store
            .upsert_folder(&folder("child", "Child", Some("root")))
            .unwrap();
        store
            .upsert_note(&note("n1", "Inside.md", Some("child")))
            .unwrap();
        store.upsert_note(&note("n2", "Outside.md", None)).unwrap();

        store.delete_folder("root").unwrap();

        assert!(store.list_folders().unwrap().is_empty());
        let notes = store.list_notes().unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, "n2");
        assert!(!dir.path().join("Root").exists());
    }

    #[test]
    fn deleting_a_note_removes_only_its_file() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store.upsert_note(&note("n1", "A.md", None)).unwrap();
        store.upsert_note(&note("n2", "B.md", None)).unwrap();

        store.delete_note("n1").unwrap();

        let notes = store.list_notes().unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, "n2");
    }

    fn journal_entry(id: &str, date_key: &str) -> JournalEntry {
        JournalEntry {
            id: id.to_string(),
            date_key: date_key.to_string(),
            title: Some("A productive day".to_string()),
            content: "felt productive today".to_string(),
            rich_content: serde_json::Value::Array(Vec::new()),
            tags: vec!["work".to_string()],
            mood: Some("good".to_string()),
            created_at: 100,
            updated_at: 200,
        }
    }

    #[test]
    fn journal_entry_roundtrips_through_markdown_and_stays_out_of_notes() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store
            .upsert_journal_entry(&journal_entry("j1", "2026-06-24"))
            .unwrap();

        // Lives under .skriuw/journal, so it never surfaces as a note.
        assert!(store.list_notes().unwrap().is_empty());
        assert!(dir.path().join(".skriuw/journal/2026-06-24-j1.md").exists());

        let got = store.list_journal_entries().unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].id, "j1");
        assert_eq!(got[0].date_key, "2026-06-24");
        assert_eq!(got[0].content, "felt productive today");
        assert_eq!(got[0].title.as_deref(), Some("A productive day"));
        assert_eq!(got[0].mood.as_deref(), Some("good"));
        assert_eq!(got[0].tags, vec!["work".to_string()]);

        store.delete_journal_entry("j1").unwrap();
        assert!(store.list_journal_entries().unwrap().is_empty());
    }

    #[test]
    fn journal_entry_rich_content_roundtrips_through_markdown() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        let mut entry = journal_entry("j1", "2026-06-24");
        entry.rich_content = serde_json::json!([
            { "type": "paragraph", "content": [
                { "type": "person", "props": { "id": "person-1", "name": "Alex" } }
            ] }
        ]);
        store.upsert_journal_entry(&entry).unwrap();

        let raw = std::fs::read_to_string(dir.path().join(".skriuw/journal/2026-06-24-j1.md")).unwrap();
        assert!(raw.contains("richContent:"));
        assert!(raw.contains("person-1"));

        let got = store.list_journal_entries().unwrap();
        assert_eq!(got[0].rich_content, entry.rich_content);
    }

    #[test]
    fn journal_entry_without_mood_omits_the_frontmatter_key() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        let mut entry = journal_entry("j1", "2026-06-24");
        entry.mood = None;
        store.upsert_journal_entry(&entry).unwrap();

        let raw = fs::read_to_string(dir.path().join(".skriuw/journal/2026-06-24-j1.md")).unwrap();
        assert!(!raw.contains("mood:"));
        assert_eq!(store.list_journal_entries().unwrap()[0].mood, None);
    }

    #[test]
    fn journal_tags_persist_and_delete() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store
            .upsert_journal_tag(&JournalTag {
                id: "t1".to_string(),
                name: "work".to_string(),
                color: "blue".to_string(),
                usage_count: 3,
            })
            .unwrap();
        let got = store.list_journal_tags().unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].name, "work");

        store.delete_journal_tag("t1").unwrap();
        assert!(store.list_journal_tags().unwrap().is_empty());
    }

    #[test]
    fn rename_keeps_identity_and_drops_the_old_file() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store.upsert_note(&note("n1", "Old.md", None)).unwrap();

        let mut renamed = note("n1", "New.md", None);
        renamed.content = "renamed".to_string();
        store.upsert_note(&renamed).unwrap();

        assert!(!dir.path().join("Old.md").exists());
        assert!(dir.path().join("New.md").exists());
        assert_eq!(store.list_notes().unwrap().len(), 1);
        assert_eq!(store.get_note("n1").unwrap().unwrap().content, "renamed");
    }

    #[test]
    fn trashing_a_note_moves_it_out_of_the_active_tree_into_trash() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store.upsert_note(&note("n1", "Secret.md", None)).unwrap();

        store.trash_note("n1", 1000).unwrap();

        assert!(!dir.path().join("Secret.md").exists());
        assert!(store.list_notes().unwrap().is_empty());
        assert!(dir.path().join(".skriuw/trash/notes/n1.md").exists());

        let trash = store.list_trash().unwrap();
        assert_eq!(trash.len(), 1);
        assert_eq!(trash[0].batch_id, "note:n1");
        assert_eq!(trash[0].kind, "note");
        assert_eq!(trash[0].deleted_at, 1000);
    }

    #[test]
    fn restoring_a_note_brings_it_back_and_clears_the_record() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store.upsert_note(&note("n1", "Secret.md", None)).unwrap();
        store.trash_note("n1", 1000).unwrap();

        store.restore_batch("note:n1").unwrap();

        assert!(dir.path().join("Secret.md").exists());
        assert_eq!(store.list_notes().unwrap().len(), 1);
        assert!(store.list_trash().unwrap().is_empty());
        assert!(!dir.path().join(".skriuw/trash/notes/n1.md").exists());
    }

    #[test]
    fn purging_a_note_removes_it_permanently() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store.upsert_note(&note("n1", "Secret.md", None)).unwrap();
        store.trash_note("n1", 1000).unwrap();

        store.purge_batch("note:n1").unwrap();

        assert!(store.list_trash().unwrap().is_empty());
        assert!(!dir.path().join(".skriuw/trash/notes/n1.md").exists());
        store.restore_batch("note:n1").unwrap();
        assert!(store.list_notes().unwrap().is_empty());
    }

    #[test]
    fn trashing_a_folder_batches_its_subtree_and_restores_together() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store.upsert_folder(&folder("f1", "Work", None)).unwrap();
        store
            .upsert_folder(&folder("f2", "Sub", Some("f1")))
            .unwrap();
        store
            .upsert_note(&note("n1", "Top.md", Some("f1")))
            .unwrap();
        store
            .upsert_note(&note("n2", "Deep.md", Some("f2")))
            .unwrap();

        store.trash_folder("f1", 2000).unwrap();

        assert!(store.list_notes().unwrap().is_empty());
        assert!(store.list_folders().unwrap().is_empty());
        assert!(!dir.path().join("Work").exists());
        let trash = store.list_trash().unwrap();
        assert_eq!(trash.len(), 4); // 2 folders + 2 notes
        assert!(trash.iter().all(|record| record.batch_id == "folder:f1"));

        store.restore_batch("folder:f1").unwrap();

        assert_eq!(store.list_folders().unwrap().len(), 2);
        assert_eq!(store.list_notes().unwrap().len(), 2);
        assert!(dir.path().join("Work/Top.md").exists());
        assert!(dir.path().join("Work/Sub/Deep.md").exists());
        assert!(store.list_trash().unwrap().is_empty());
    }

    #[test]
    fn collect_notes_ignores_the_trash_area() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store.upsert_note(&note("n1", "Kept.md", None)).unwrap();
        store.upsert_note(&note("n2", "Gone.md", None)).unwrap();
        store.trash_note("n2", 1000).unwrap();

        // list_notes scans the active tree; the trashed file under .skriuw must
        // not resurface (mirrors reconcile_index's META_DIR skip).
        let active = store.list_notes().unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].id, "n1");
    }

    #[test]
    fn empty_trash_clears_everything() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();
        store.upsert_note(&note("n1", "A.md", None)).unwrap();
        store.upsert_note(&note("n2", "B.md", None)).unwrap();
        store.trash_note("n1", 1).unwrap();
        store.trash_note("n2", 2).unwrap();

        store.empty_trash().unwrap();

        assert!(store.list_trash().unwrap().is_empty());
        assert!(!dir.path().join(".skriuw/trash/notes/n1.md").exists());
    }

    #[test]
    fn backup_restore_and_discard_works() {
        let dir = tempdir().unwrap();
        let store = VaultStore::open(dir.path()).unwrap();

        // 1. Create initial state
        store.upsert_folder(&folder("f1", "Work", None)).unwrap();
        store.upsert_note(&note("n1", "A.md", Some("f1"))).unwrap();
        store.upsert_note(&note("n2", "B.md", None)).unwrap();

        // 2. Backup the state
        store.create_import_backup().unwrap();
        assert!(store.has_import_backup());

        // 3. Make some changes (simulating an import)
        store.upsert_note(&note("n3", "C.md", None)).unwrap();
        store.delete_note("n2").unwrap();

        // 4. Restore the backup (simulating a rollback)
        store.restore_import_backup().unwrap();
        assert!(!store.has_import_backup());

        // Verify state is restored
        let notes = store.list_notes().unwrap();
        assert_eq!(notes.len(), 2);
        assert!(notes.iter().any(|n| n.id == "n1"));
        assert!(notes.iter().any(|n| n.id == "n2"));
        assert!(!notes.iter().any(|n| n.id == "n3"));

        // 5. Create backup again, make changes, and discard it (simulating success)
        store.create_import_backup().unwrap();
        assert!(store.has_import_backup());
        store.upsert_note(&note("n4", "D.md", None)).unwrap();
        store.discard_import_backup().unwrap();
        assert!(!store.has_import_backup());

        // Verify changes are kept
        let notes = store.list_notes().unwrap();
        assert_eq!(notes.len(), 3);
        assert!(notes.iter().any(|n| n.id == "n4"));
    }
}
