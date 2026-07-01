mod ai;
mod backup;
mod storage;
mod vault;
mod versioning;

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use storage::{
    BacklinkSources, Folder, JournalEntry, JournalTag, Note, NoteLinkInput, NoteTagMeta,
    NoteVersion, NoteVersionSnapshot, Person, SearchHit, Storage, TrashRecord,
};

/// Current wall-clock time in epoch milliseconds, for stamping deletions.
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}
use tauri::ipc::Channel;
use tauri::menu::{Menu, MenuItem};
#[cfg(target_os = "macos")]
use tauri::menu::{PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::Emitter;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;
use vault::VaultStore;

/// Custom (non-predefined) menu item ids forwarded to the frontend. Predefined
/// items (undo/copy/quit/…) are handled natively by Tauri and never reach here.
#[cfg(target_os = "macos")]
const MENU_ACTION_IDS: [&str; 5] = ["new-note", "new-folder", "save", "toggle-sidebar", "about"];

#[derive(Serialize)]
pub struct AppInfo {
    pub app: String,
    pub shell: String,
    pub status: String,
    pub version: String,
}

#[tauri::command]
fn greet(name: &str) -> String {
    let who = if name.trim().is_empty() {
        "world"
    } else {
        name
    };
    format!("Hello, {who} — the Skriuw desktop shell is alive.")
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        app: "skriuw-desktop".to_string(),
        shell: "tauri".to_string(),
        status: "local-backend".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

/// Flips to `true` once the SQLite index has been reconciled against the vault.
/// On launches where `index.db` already exists the reconcile is deferred to a
/// background thread, so the frontend uses this (plus the `index://reconciled`
/// event) to know when the first `list_notes` result may have raced ahead of a
/// stale index and needs refetching.
struct IndexReady(AtomicBool);

#[tauri::command]
fn index_ready(state: State<'_, IndexReady>) -> bool {
    state.0.load(Ordering::SeqCst)
}

#[tauri::command]
fn list_notes(storage: State<'_, Storage>) -> Result<Vec<Note>, String> {
    storage.list_notes().map_err(stringify)
}

#[tauri::command]
fn get_note(storage: State<'_, Storage>, id: String) -> Result<Option<Note>, String> {
    storage.get_note(&id).map_err(stringify)
}

#[tauri::command]
fn get_notes(storage: State<'_, Storage>, ids: Vec<String>) -> Result<Vec<Note>, String> {
    let mut found = Vec::new();
    for id in ids {
        if let Some(note) = storage.get_note(&id).map_err(stringify)? {
            found.push(note);
        }
    }
    Ok(found)
}

#[tauri::command]
fn upsert_note(
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    note: Note,
) -> Result<Note, String> {
    vault.upsert_note(&note).map_err(vault_err)?;
    storage.upsert_note(&note).map_err(stringify)?;
    Ok(note)
}

#[tauri::command]
fn bulk_upsert_notes(
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    notes: Vec<Note>,
) -> Result<(), String> {
    for note in &notes {
        vault.upsert_note(note).map_err(vault_err)?;
    }
    storage.upsert_notes(&notes).map_err(stringify)
}

/// Atomically imports a full pulled archive (desktop sync `pullWorkspaceFromServer`):
/// writes every entity to the vault, then upserts + applies tombstone deletes to
/// the SQLite index in one transaction (`Storage::import_workspace`). Unlike the
/// old per-entity loop this replaced, a crash partway through this call leaves the
/// index either fully reflecting the archive or untouched — never half-written.
#[tauri::command]
fn import_workspace_archive(
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    folders: Vec<Folder>,
    notes: Vec<Note>,
    journal_entries: Vec<JournalEntry>,
    journal_tags: Vec<JournalTag>,
    deleted_note_ids: Vec<String>,
    deleted_folder_ids: Vec<String>,
    deleted_journal_entry_ids: Vec<String>,
    deleted_journal_tag_ids: Vec<String>,
) -> Result<(), String> {
    for folder in &folders {
        vault.upsert_folder(folder).map_err(vault_err)?;
    }
    for note in &notes {
        vault.upsert_note(note).map_err(vault_err)?;
    }
    for entry in &journal_entries {
        vault.upsert_journal_entry(entry).map_err(vault_err)?;
    }
    for tag in &journal_tags {
        vault.upsert_journal_tag(tag).map_err(vault_err)?;
    }
    let deleted_at = now_ms();
    for id in &deleted_note_ids {
        vault.trash_note(id, deleted_at).map_err(vault_err)?;
    }
    for id in &deleted_folder_ids {
        vault.trash_folder(id, deleted_at).map_err(vault_err)?;
    }
    for id in &deleted_journal_entry_ids {
        vault.delete_journal_entry(id).map_err(vault_err)?;
    }
    for id in &deleted_journal_tag_ids {
        vault.delete_journal_tag(id).map_err(vault_err)?;
    }

    storage
        .import_workspace(
            &folders,
            &notes,
            &journal_entries,
            &journal_tags,
            &deleted_note_ids,
            &deleted_folder_ids,
            &deleted_journal_entry_ids,
            &deleted_journal_tag_ids,
        )
        .map_err(stringify)
}

#[tauri::command]
fn delete_note(
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    id: String,
) -> Result<(), String> {
    vault.trash_note(&id, now_ms()).map_err(vault_err)?;
    storage.delete_note(&id).map_err(stringify)
}

#[tauri::command]
fn replace_note_links(
    storage: State<'_, Storage>,
    note_id: String,
    links: Vec<NoteLinkInput>,
    title_keys: Vec<String>,
) -> Result<(), String> {
    storage
        .replace_note_links(&note_id, &links, &title_keys)
        .map_err(stringify)
}

#[tauri::command]
fn has_indexed_links(storage: State<'_, Storage>) -> Result<bool, String> {
    storage.has_indexed_links().map_err(stringify)
}

#[tauri::command]
fn get_backlink_sources(
    storage: State<'_, Storage>,
    target_id: String,
    title_keys: Vec<String>,
) -> Result<BacklinkSources, String> {
    storage
        .get_backlink_sources(&target_id, &title_keys)
        .map_err(stringify)
}

#[tauri::command]
fn search_notes(
    storage: State<'_, Storage>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<SearchHit>, String> {
    storage
        .search_notes(&query, limit.unwrap_or(20))
        .map_err(stringify)
}

#[tauri::command]
fn list_folders(storage: State<'_, Storage>) -> Result<Vec<Folder>, String> {
    storage.list_folders().map_err(stringify)
}

#[tauri::command]
fn upsert_folder(
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    folder: Folder,
) -> Result<Folder, String> {
    vault.upsert_folder(&folder).map_err(vault_err)?;
    storage.upsert_folder(&folder).map_err(stringify)?;
    Ok(folder)
}

#[tauri::command]
fn delete_folder(
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    id: String,
) -> Result<(), String> {
    vault.trash_folder(&id, now_ms()).map_err(vault_err)?;
    storage.delete_folder(&id).map_err(stringify)
}

#[tauri::command]
fn list_trash(vault: State<'_, VaultStore>) -> Result<Vec<TrashRecord>, String> {
    vault.list_trash().map_err(vault_err)
}

#[tauri::command]
fn restore_trash(
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    batch_id: String,
) -> Result<(), String> {
    vault.restore_batch(&batch_id).map_err(vault_err)?;
    reconcile_index(&storage, &vault)
}

#[tauri::command]
fn purge_trash(vault: State<'_, VaultStore>, batch_id: String) -> Result<(), String> {
    vault.purge_batch(&batch_id).map_err(vault_err)
}

#[tauri::command]
fn empty_trash(vault: State<'_, VaultStore>) -> Result<(), String> {
    vault.empty_trash().map_err(vault_err)
}

#[tauri::command]
fn list_journal_entries(storage: State<'_, Storage>) -> Result<Vec<JournalEntry>, String> {
    storage.list_journal_entries().map_err(stringify)
}

#[tauri::command]
fn upsert_journal_entry(
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    entry: JournalEntry,
) -> Result<JournalEntry, String> {
    vault.upsert_journal_entry(&entry).map_err(vault_err)?;
    storage.upsert_journal_entry(&entry).map_err(stringify)?;
    Ok(entry)
}

#[tauri::command]
fn delete_journal_entry(
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    id: String,
) -> Result<(), String> {
    vault.delete_journal_entry(&id).map_err(vault_err)?;
    storage.delete_journal_entry(&id).map_err(stringify)
}

#[tauri::command]
fn list_journal_tags(storage: State<'_, Storage>) -> Result<Vec<JournalTag>, String> {
    storage.list_journal_tags().map_err(stringify)
}

#[tauri::command]
fn upsert_journal_tag(
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    tag: JournalTag,
) -> Result<JournalTag, String> {
    vault.upsert_journal_tag(&tag).map_err(vault_err)?;
    storage.upsert_journal_tag(&tag).map_err(stringify)?;
    Ok(tag)
}

#[tauri::command]
fn delete_journal_tag(
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    id: String,
) -> Result<(), String> {
    vault.delete_journal_tag(&id).map_err(vault_err)?;
    storage.delete_journal_tag(&id).map_err(stringify)
}

#[tauri::command]
fn list_people(storage: State<'_, Storage>) -> Result<Vec<Person>, String> {
    storage.list_people().map_err(stringify)
}

#[tauri::command]
fn create_person(
    storage: State<'_, Storage>,
    id: String,
    name: String,
    color: Option<String>,
) -> Result<Person, String> {
    storage
        .create_person(&id, &name, color.as_deref())
        .map_err(stringify)
}

// `clear_color` disambiguates "unset the colour" from "leave it untouched",
// which a single nullable arg cannot express over the IPC boundary.
#[tauri::command]
fn update_person(
    storage: State<'_, Storage>,
    id: String,
    name: Option<String>,
    color: Option<String>,
    clear_color: Option<bool>,
) -> Result<Person, String> {
    let color_update: Option<Option<&str>> = if clear_color.unwrap_or(false) {
        Some(None)
    } else {
        color.as_deref().map(Some)
    };
    storage
        .update_person(&id, name.as_deref(), color_update)
        .map_err(stringify)
}

#[tauri::command]
fn delete_person(storage: State<'_, Storage>, id: String) -> Result<(), String> {
    storage.delete_person(&id).map_err(stringify)
}

#[tauri::command]
fn list_note_tag_meta(storage: State<'_, Storage>) -> Result<Vec<NoteTagMeta>, String> {
    storage.list_note_tag_meta().map_err(stringify)
}

#[tauri::command]
fn upsert_note_tag_meta(
    storage: State<'_, Storage>,
    name: String,
    color: Option<String>,
) -> Result<(), String> {
    storage
        .upsert_note_tag_meta(&name, color.as_deref())
        .map_err(stringify)
}

#[tauri::command]
fn delete_note_tag_meta(storage: State<'_, Storage>, name: String) -> Result<(), String> {
    storage.delete_note_tag_meta(&name).map_err(stringify)
}

#[tauri::command]
fn rename_note_tag_meta(
    storage: State<'_, Storage>,
    from: String,
    to: String,
) -> Result<(), String> {
    storage.rename_note_tag_meta(&from, &to).map_err(stringify)
}

#[derive(Serialize)]
pub struct VersionWriteResult {
    pub version_id: Option<String>,
    pub version_changed: bool,
}

#[derive(Serialize)]
pub struct RestoreVersionResult {
    pub note: Option<Note>,
    pub version_created: bool,
}

/// Records a checkpoint for a note write, mirroring the web `updateNote`
/// action's version logic (`src/domain/notes/actions.ts`):
/// - If this save continues an open checkpoint session (`session_version_id`
///   from a prior checkpoint flush), overwrite that row in place rather than
///   growing the history with every keystroke between checkpoints.
/// - Otherwise only `rename`/`created`/`restore` reasons, or an explicit
///   checkpoint flush, are eligible to create a new row at all — plain
///   autosaves never do. Eligible writes still pass through
///   `Storage::insert_note_version`'s dedupe/throttle check.
#[tauri::command]
fn record_note_version(
    storage: State<'_, Storage>,
    note_id: String,
    snapshot: NoteVersionSnapshot,
    reason: String,
    create_checkpoint: bool,
    session_version_id: Option<String>,
) -> Result<VersionWriteResult, String> {
    if create_checkpoint {
        if let Some(existing_id) = &session_version_id {
            let changed = storage
                .update_existing_note_version(existing_id, &note_id, &snapshot)
                .map_err(stringify)?;
            if changed {
                return Ok(VersionWriteResult {
                    version_id: Some(existing_id.clone()),
                    version_changed: true,
                });
            }
        }
    }

    let should_create_version =
        matches!(reason.as_str(), "rename" | "created" | "restore") || create_checkpoint;
    if !should_create_version {
        return Ok(VersionWriteResult {
            version_id: None,
            version_changed: false,
        });
    }

    let version_id = storage
        .insert_note_version(&note_id, &snapshot, &reason, now_ms())
        .map_err(stringify)?;

    Ok(VersionWriteResult {
        version_changed: version_id.is_some(),
        version_id,
    })
}

#[tauri::command]
fn get_note_versions(
    storage: State<'_, Storage>,
    note_id: String,
    limit: Option<i64>,
) -> Result<Vec<NoteVersion>, String> {
    storage
        .list_note_versions(&note_id, limit.unwrap_or(12))
        .map_err(stringify)
}

/// Restores a note to a prior version: snapshots the pre-restore state as a
/// "restore"-reason version (so the overwritten content isn't lost), then
/// writes the version's content back as the note's current state.
#[tauri::command]
fn restore_note_version(
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    version_id: String,
) -> Result<RestoreVersionResult, String> {
    let version = match storage.get_note_version(&version_id).map_err(stringify)? {
        Some(version) => version,
        None => {
            return Ok(RestoreVersionResult {
                note: None,
                version_created: false,
            })
        }
    };
    let current = match storage.get_note(&version.note_id).map_err(stringify)? {
        Some(note) => note,
        None => {
            return Ok(RestoreVersionResult {
                note: None,
                version_created: false,
            })
        }
    };

    storage
        .insert_note_version(
            &current.id,
            &NoteVersionSnapshot::from(&current),
            "restore",
            now_ms(),
        )
        .map_err(stringify)?;

    let restored = Note {
        id: current.id,
        name: version.name,
        content: version.content,
        rich_content: version.rich_content,
        preferred_editor_mode: version.preferred_editor_mode,
        parent_id: version.parent_id,
        sort_order: current.sort_order,
        tags: version.tags,
        properties: version.properties,
        created_at: current.created_at,
        modified_at: now_ms(),
    };

    vault.upsert_note(&restored).map_err(vault_err)?;
    storage.upsert_note(&restored).map_err(stringify)?;

    Ok(RestoreVersionResult {
        note: Some(restored),
        version_created: true,
    })
}

fn stringify(error: rusqlite::Error) -> String {
    error.to_string()
}

fn vault_err(error: std::io::Error) -> String {
    error.to_string()
}

const SETTINGS_FILE: &str = "settings.json";
const VAULT_DIR_NAME: &str = ".skriuw";

/// The default vault location — a hidden `~/.skriuw` directory. Used when the
/// user has not chosen a custom vault root in `settings.json`.
fn default_vault_root<R: Runtime>(handle: &AppHandle<R>) -> Result<PathBuf, String> {
    let home = handle
        .path()
        .home_dir()
        .map_err(|error| format!("resolve home dir: {error}"))?;
    Ok(home.join(VAULT_DIR_NAME))
}

fn settings_path<R: Runtime>(handle: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?;
    Ok(dir.join(SETTINGS_FILE))
}

/// Reads the configured vault root from `settings.json`, falling back to the
/// `~/.skriuw` default when the file or the `vaultRoot` key is absent.
fn read_vault_root<R: Runtime>(handle: &AppHandle<R>) -> Result<PathBuf, String> {
    let path = settings_path(handle)?;
    let raw = match std::fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return default_vault_root(handle)
        }
        Err(error) => return Err(error.to_string()),
    };
    let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
    match parsed.get("vaultRoot").and_then(|value| value.as_str()) {
        Some(root) if !root.trim().is_empty() => Ok(PathBuf::from(root)),
        _ => default_vault_root(handle),
    }
}

fn write_vault_root<R: Runtime>(handle: &AppHandle<R>, root: &str) -> Result<(), String> {
    let path = settings_path(handle)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut parsed: serde_json::Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    parsed["vaultRoot"] = serde_json::Value::String(root.to_string());
    let body = serde_json::to_string_pretty(&parsed).map_err(|error| error.to_string())?;
    std::fs::write(&path, format!("{body}\n")).map_err(|error| error.to_string())
}

/// Rebuilds the SQLite index to mirror the on-disk vault (the source of truth):
/// folders and notes present in the vault are upserted, rows absent from the
/// vault are dropped. A note whose vault body still matches the index is left
/// untouched so its derived `richContent` survives; a changed body is re-upserted
/// with an empty `richContent`, which the TypeScript layer re-derives on read.
fn reconcile_index(storage: &Storage, vault: &VaultStore) -> Result<(), String> {
    let vault_folders = vault.list_folders().map_err(vault_err)?;
    for folder in &vault_folders {
        storage.upsert_folder(folder).map_err(stringify)?;
    }
    let folder_ids: HashSet<&str> = vault_folders.iter().map(|f| f.id.as_str()).collect();
    for folder in storage.list_folders().map_err(stringify)? {
        if !folder_ids.contains(folder.id.as_str()) {
            storage.delete_folder(&folder.id).map_err(stringify)?;
        }
    }

    let vault_notes = vault.list_notes().map_err(vault_err)?;
    for note in &vault_notes {
        let unchanged = storage
            .get_note(&note.id)
            .map_err(stringify)?
            .is_some_and(|existing| note_body_matches(&existing, note));
        if !unchanged {
            storage.upsert_note(note).map_err(stringify)?;
        }
    }
    let note_ids: HashSet<&str> = vault_notes.iter().map(|n| n.id.as_str()).collect();
    for note in storage.list_notes().map_err(stringify)? {
        if !note_ids.contains(note.id.as_str()) {
            storage.delete_note(&note.id).map_err(stringify)?;
        }
    }

    let vault_entries = vault.list_journal_entries().map_err(vault_err)?;
    for entry in &vault_entries {
        storage.upsert_journal_entry(entry).map_err(stringify)?;
    }
    let entry_ids: HashSet<&str> = vault_entries.iter().map(|e| e.id.as_str()).collect();
    for entry in storage.list_journal_entries().map_err(stringify)? {
        if !entry_ids.contains(entry.id.as_str()) {
            storage.delete_journal_entry(&entry.id).map_err(stringify)?;
        }
    }

    let vault_tags = vault.list_journal_tags().map_err(vault_err)?;
    for tag in &vault_tags {
        storage.upsert_journal_tag(tag).map_err(stringify)?;
    }
    let tag_ids: HashSet<&str> = vault_tags.iter().map(|t| t.id.as_str()).collect();
    for tag in storage.list_journal_tags().map_err(stringify)? {
        if !tag_ids.contains(tag.id.as_str()) {
            storage.delete_journal_tag(&tag.id).map_err(stringify)?;
        }
    }
    Ok(())
}

/// True when every vault-persisted field of a note matches the index row, so the
/// index row (and its derived `richContent`) can be kept as-is.
fn note_body_matches(indexed: &Note, vault: &Note) -> bool {
    indexed.name == vault.name
        && indexed.content == vault.content
        && indexed.parent_id == vault.parent_id
        && indexed.sort_order == vault.sort_order
        && indexed.preferred_editor_mode == vault.preferred_editor_mode
        && indexed.tags == vault.tags
}

#[tauri::command]
fn get_vault_root(app: AppHandle) -> Result<String, String> {
    Ok(read_vault_root(&app)?.to_string_lossy().into_owned())
}

/// Persists a new vault root. Takes effect on the next launch (the live vault +
/// index are opened once at startup).
#[tauri::command]
fn set_vault_root(app: AppHandle, path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("vault root must not be empty".to_string());
    }
    write_vault_root(&app, trimmed)
}

/// Exports the markdown vault to a user-chosen `.zip`. Returns the chosen path,
/// or `None` if the save dialog was cancelled.
#[tauri::command]
async fn export_vault(app: AppHandle) -> Result<Option<String>, String> {
    let root = read_vault_root(&app)?;
    let picked = app
        .dialog()
        .file()
        .set_file_name("skriuw-vault.zip")
        .add_filter("Zip archive", &["zip"])
        .blocking_save_file();
    let Some(target) = picked else {
        return Ok(None);
    };
    let out = target.as_path().ok_or("invalid save path")?.to_path_buf();
    backup::zip_dir(&root, &out).map_err(|error| error.to_string())?;
    Ok(Some(out.to_string_lossy().into_owned()))
}

/// Exports the full desktop workspace snapshot: app data, local AI data, and
/// the current vault contents. Returns the chosen path, or `None` if cancelled.
#[tauri::command]
async fn export_snapshot(
    app: AppHandle,
    progress: Channel<backup::SnapshotEvent>,
) -> Result<Option<String>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?;
    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("resolve local data dir: {error}"))?;
    let vault_root = read_vault_root(&app)?;
    let picked = app
        .dialog()
        .file()
        .set_file_name("skriuw-snapshot.zip")
        .add_filter("Snapshot archive", &["zip"])
        .blocking_save_file();
    let Some(target) = picked else {
        return Ok(None);
    };
    let out = target.as_path().ok_or("invalid save path")?.to_path_buf();
    let manifest = backup::SnapshotManifest {
        version: 1,
        app_data_dir: app_data_dir.to_string_lossy().into_owned(),
        app_local_data_dir: app_local_data_dir.to_string_lossy().into_owned(),
        vault_root: vault_root.to_string_lossy().into_owned(),
    };
    backup::zip_snapshot_with_progress(
        &manifest,
        &app_data_dir,
        &app_local_data_dir,
        &vault_root,
        &out,
        |event| {
            let _ = progress.send(event);
        },
    )
    .map_err(|error| error.to_string())?;
    Ok(Some(out.to_string_lossy().into_owned()))
}

/// Restores the vault from a backup `.zip`, REPLACING the current vault, then
/// rebuilds the SQLite index from it. Returns `false` if the pick was cancelled.
#[tauri::command]
async fn import_vault(app: AppHandle, storage: State<'_, Storage>) -> Result<bool, String> {
    let root = read_vault_root(&app)?;
    let picked = app
        .dialog()
        .file()
        .add_filter("Zip archive", &["zip"])
        .blocking_pick_file();
    let Some(target) = picked else {
        return Ok(false);
    };
    let archive = target
        .as_path()
        .ok_or("invalid archive path")?
        .to_path_buf();
    backup::clear_dir_contents(&root).map_err(|error| error.to_string())?;
    backup::unzip_into(&archive, &root).map_err(|error| error.to_string())?;
    let vault = VaultStore::open(&root).map_err(vault_err)?;
    reconcile_index(&storage, &vault)?;
    Ok(true)
}

/// Restores a full desktop snapshot, replacing the app data, local AI data, and
/// vault contents. The long-lived Rust state is rebound in place, then the
/// frontend reloads.
#[tauri::command]
async fn import_snapshot(
    app: AppHandle,
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    progress: Channel<backup::SnapshotEvent>,
) -> Result<(), String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Snapshot archive", &["zip"])
        .blocking_pick_file();
    let Some(target) = picked else {
        return Ok(());
    };
    let archive = target
        .as_path()
        .ok_or("invalid archive path")?
        .to_path_buf();
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?;
    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("resolve local data dir: {error}"))?;
    let _ = progress.send(backup::SnapshotEvent::Status {
        message: "Restoring snapshot".to_string(),
    });
    let manifest = backup::restore_snapshot(&archive, &app_data_dir, &app_local_data_dir)
        .map_err(|error| error.to_string())?;
    let _ = progress.send(backup::SnapshotEvent::Status {
        message: "Snapshot restored. Rebinding workspace".to_string(),
    });
    ai::stop_managed_server();
    storage
        .reload(&app_data_dir.join("index.db"))
        .map_err(stringify)?;
    vault.reload_root(PathBuf::from(manifest.vault_root));
    ai::autostart_managed(&app);
    Ok(())
}

/// Permanently deletes all local notes/folders: empties the vault directory and
/// rebuilds (now-empty) the SQLite index from it.
#[tauri::command]
fn clear_local_data(app: AppHandle, storage: State<'_, Storage>) -> Result<(), String> {
    let root = read_vault_root(&app)?;
    backup::clear_dir_contents(&root).map_err(|error| error.to_string())?;
    let vault = VaultStore::open(&root).map_err(vault_err)?;
    reconcile_index(&storage, &vault)
}

/// Wipes the full desktop workspace: app data, local AI data, and the vault.
/// The long-lived Rust state is rebound in place so the frontend can reload
/// against fresh handles.
#[tauri::command]
async fn reset_desktop_data(
    app: AppHandle,
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    progress: Channel<backup::SnapshotEvent>,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?;
    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("resolve local data dir: {error}"))?;
    let vault_root = read_vault_root(&app)?;
    backup::clear_desktop_state_with_progress(
        &app_data_dir,
        &app_local_data_dir,
        &vault_root,
        |event| {
            let _ = progress.send(event);
        },
    )
    .map_err(|error| error.to_string())?;
    ai::stop_managed_server();
    storage
        .reload(&app_data_dir.join("index.db"))
        .map_err(stringify)?;
    vault.reload_root(vault_root);
    Ok(())
}

/// Opens a folder picker and persists the chosen directory as the new vault
/// root (takes effect next launch). Returns the chosen path, or `None` if
/// cancelled.
#[tauri::command]
fn choose_vault_root(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(target) = picked else {
        return Ok(None);
    };
    let dir = target.as_path().ok_or("invalid folder path")?.to_path_buf();
    let as_str = dir.to_string_lossy().into_owned();
    write_vault_root(&app, &as_str)?;
    Ok(Some(as_str))
}

/// Opens the vault directory in the OS file manager.
#[tauri::command]
fn reveal_vault(app: AppHandle) -> Result<(), String> {
    let root = read_vault_root(&app)?;
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    open_in_file_manager(&root)
}

fn open_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "windows")]
    let program = "explorer";
    std::process::Command::new(program)
        .arg(path)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// Exports a single note to a user-chosen file. `format` is `"md"` (the raw
/// vault markdown) or `"html"` (rendered). Returns the chosen path, or `None`
/// if the save dialog was cancelled. Offline substitute for cloud sharing.
#[tauri::command]
fn export_note(
    app: AppHandle,
    storage: State<'_, Storage>,
    id: String,
    format: String,
) -> Result<Option<String>, String> {
    let note = storage
        .get_note(&id)
        .map_err(stringify)?
        .ok_or("note not found")?;
    let (ext, filter_name, contents) = match format.as_str() {
        "md" | "markdown" => ("md", "Markdown", note.content.clone()),
        "html" => (
            "html",
            "HTML",
            render_markdown_html(&note.name, &note.content),
        ),
        other => return Err(format!("Unsupported export format: {other}")),
    };
    let picked = app
        .dialog()
        .file()
        .set_file_name(format!("{}.{ext}", sanitize_filename(&note.name)))
        .add_filter(filter_name, &[ext])
        .blocking_save_file();
    let Some(target) = picked else {
        return Ok(None);
    };
    let out = target.as_path().ok_or("invalid save path")?.to_path_buf();
    std::fs::write(&out, contents).map_err(|error| error.to_string())?;
    Ok(Some(out.to_string_lossy().into_owned()))
}

/// Turns a note name into a safe base filename: drops a trailing `.md`, replaces
/// characters outside `[alphanumeric - _ space]` with `-`, falls back to `note`.
fn sanitize_filename(name: &str) -> String {
    let base = name.trim().trim_end_matches(".md");
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() {
        "note".to_string()
    } else {
        cleaned.to_string()
    }
}

fn render_markdown_html(title: &str, markdown: &str) -> String {
    use pulldown_cmark::{html, Options, Parser};
    let parser = Parser::new_ext(markdown, Options::all());
    let mut body = String::new();
    html::push_html(&mut body, parser);
    format!(
		"<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>{}</title>\n</head>\n<body>\n{body}</body>\n</html>\n",
		escape_html(title)
	)
}

fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Builds the system tray icon and its menu (Show / New note / Quit). "New note"
/// reuses the existing `menu://action` → `new-note` bridge the frontend listens
/// on. Available on all platforms.
fn build_tray<R: Runtime>(handle: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(handle, "tray-show", "Show Skriuw", true, None::<&str>)?;
    let new_note = MenuItem::with_id(handle, "tray-new-note", "New note", true, None::<&str>)?;
    let quit = MenuItem::with_id(handle, "tray-quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(handle, &[&show, &new_note, &quit])?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("Skriuw")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-show" => reveal_main_window(app),
            "tray-new-note" => {
                reveal_main_window(app);
                let _ = app.emit("menu://action", "new-note");
            }
            "tray-quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = handle.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(handle)?;
    Ok(())
}

fn reveal_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Builds the native application menu. Predefined items work out of the box;
/// the custom File/View items emit a `menu://action` event to the frontend.
///
/// macOS only: there the menu lives in the global menu bar. On Linux/Windows it
/// would render as an in-window menubar stacked beneath the custom titlebar, so
/// it is omitted — the frontend already owns these shortcuts via `useShortcut`.
#[cfg(target_os = "macos")]
fn build_menu<R: tauri::Runtime>(handle: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let new_note = MenuItem::with_id(handle, "new-note", "New Note", true, Some("CmdOrCtrl+N"))?;
    let new_folder = MenuItem::with_id(
        handle,
        "new-folder",
        "New Folder",
        true,
        Some("CmdOrCtrl+Shift+N"),
    )?;
    let save = MenuItem::with_id(handle, "save", "Save", true, Some("CmdOrCtrl+S"))?;
    let toggle_sidebar = MenuItem::with_id(
        handle,
        "toggle-sidebar",
        "Toggle Sidebar",
        true,
        Some("CmdOrCtrl+B"),
    )?;
    let about = MenuItem::with_id(handle, "about", "About Skriuw", true, None::<&str>)?;

    let app_menu = Submenu::with_items(
        handle,
        "Skriuw",
        true,
        &[
            &about,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::quit(handle, None)?,
        ],
    )?;
    let file_menu = Submenu::with_items(
        handle,
        "File",
        true,
        &[
            &new_note,
            &new_folder,
            &PredefinedMenuItem::separator(handle)?,
            &save,
        ],
    )?;
    let edit_menu = Submenu::with_items(
        handle,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(handle, None)?,
            &PredefinedMenuItem::redo(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::cut(handle, None)?,
            &PredefinedMenuItem::copy(handle, None)?,
            &PredefinedMenuItem::paste(handle, None)?,
            &PredefinedMenuItem::select_all(handle, None)?,
        ],
    )?;
    let view_menu = Submenu::with_items(handle, "View", true, &[&toggle_sidebar])?;
    let window_menu = Submenu::with_items(
        handle,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(handle, None)?,
            &PredefinedMenuItem::close_window(handle, None)?,
        ],
    )?;

    Menu::with_items(
        handle,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
    )
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            reveal_main_window(app);
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::DECORATIONS,
                )
                .build(),
        )
        .setup(|app| {
            let handle = app.handle();
            let dir = app.path().app_data_dir().expect("resolve app data dir");
            std::fs::create_dir_all(&dir)?;

            let vault_root = read_vault_root(handle)?;
            let vault = VaultStore::open(&vault_root)?;

            // The markdown vault is the source of truth; SQLite is a derived index
            // (FTS5 search, backlinks) kept in a separate `index.db` so the legacy
            // `skriuw.db` is left untouched. Reconciled against the vault on launch.
            //
            // Reconcile is incremental and idempotent: it never wipes the index, so
            // on any launch where `index.db` already exists we can defer it to a
            // background thread and let the window paint against the prior index
            // immediately. Only the very first launch (empty index) must reconcile
            // synchronously, since there is nothing for the UI to read otherwise.
            let index_path = dir.join("index.db");
            let index_existed = index_path.exists();
            let storage = Storage::open(&index_path)?;

            app.manage(IndexReady(AtomicBool::new(false)));

            if index_existed {
                app.manage(storage);
                app.manage(vault);

                // The window paints against the prior index immediately while the
                // reconcile runs here; once it lands we flip `IndexReady` and emit
                // `index://reconciled` so the frontend refetches any list that
                // resolved against the pre-reconcile index.
                let bg = handle.clone();
                std::thread::spawn(move || {
                    let storage = bg.state::<Storage>();
                    let vault = bg.state::<VaultStore>();
                    if let Err(err) = reconcile_index(&storage, &vault) {
                        eprintln!("[skriuw] background index reconcile failed: {err}");
                    }
                    bg.state::<IndexReady>().0.store(true, Ordering::SeqCst);
                    let _ = bg.emit("index://reconciled", ());
                });
            } else {
                reconcile_index(&storage, &vault)?;
                app.manage(storage);
                app.manage(vault);
                handle.state::<IndexReady>().0.store(true, Ordering::SeqCst);
            }

            build_tray(handle)?;

            // If a managed Ollama is already installed, warm it up in the
            // background so the first local AI action is instant.
            ai::autostart_managed(handle);
            Ok(())
        });

    #[cfg(target_os = "macos")]
    let builder = builder.menu(build_menu).on_menu_event(|app, event| {
        let id = event.id().as_ref();
        if MENU_ACTION_IDS.contains(&id) {
            let _ = app.emit("menu://action", id);
        }
    });

    builder
        .invoke_handler(tauri::generate_handler![
            greet,
            app_info,
            quit_app,
            index_ready,
            list_notes,
            get_note,
            get_notes,
            upsert_note,
            bulk_upsert_notes,
            import_workspace_archive,
            delete_note,
            replace_note_links,
            has_indexed_links,
            get_backlink_sources,
            search_notes,
            list_folders,
            upsert_folder,
            delete_folder,
            list_trash,
            restore_trash,
            purge_trash,
            empty_trash,
            list_journal_entries,
            upsert_journal_entry,
            delete_journal_entry,
            list_journal_tags,
            upsert_journal_tag,
            delete_journal_tag,
            list_people,
            create_person,
            update_person,
            delete_person,
            list_note_tag_meta,
            upsert_note_tag_meta,
            delete_note_tag_meta,
            rename_note_tag_meta,
            record_note_version,
            get_note_versions,
            restore_note_version,
            get_vault_root,
            set_vault_root,
            export_vault,
            import_vault,
            export_snapshot,
            import_snapshot,
            clear_local_data,
            reset_desktop_data,
            choose_vault_root,
            reveal_vault,
            export_note,
            ai::ai_get_config,
            ai::ai_set_config,
            ai::ai_set_key,
            ai::ai_complete,
            ai::ai_ollama_status,
            ai::ai_ollama_catalog,
            ai::ai_start_ollama,
            ai::ai_install_ollama,
            ai::ai_cancel_ollama_install,
            ai::ai_pull_ollama_model,
            ai::ai_cancel_ollama_pull,
            ai::ai_delete_ollama_model,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the Skriuw desktop shell")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                ai::stop_managed_server();
            }
        });
}
