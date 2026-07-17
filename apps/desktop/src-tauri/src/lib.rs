mod ai;
mod atomic_file;
mod backup;
mod content_analysis;
mod import_export;
mod markdown;
mod settings;
mod storage;
mod vault;
mod versioning;

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use settings::SettingsStore;
use storage::{
    BacklinkSources, Folder, JournalEntry, JournalTag, Note, NoteLinkInput, NoteLinkReplacement,
    NoteLinkRow, NoteMetadata, NoteTagMeta, NoteVersion, NoteVersionSnapshot, Person,
    SaveNoteIndex, SearchHit, Storage, TagSummaryRow, TaggedNoteSummaryRow, Task, TrashRecord,
    WorkspaceImport,
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
use tauri::{AppHandle, LogicalSize, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use vault::VaultStore;

/// Custom (non-predefined) menu item ids forwarded to the frontend. Predefined
/// items (undo/copy/quit/…) are handled natively by Tauri and never reach here.
#[cfg(target_os = "macos")]
const MENU_ACTION_IDS: [&str; 5] = ["new-note", "new-folder", "save", "toggle-sidebar", "about"];

/// OS-level shortcuts registered via `tauri-plugin-global-shortcut`, so they
/// fire even while the app is unfocused or minimized. Each entry is a
/// `(ShortcutId, accelerator)` pair: the id MUST match a `global: true` entry
/// in `apps/web/src/core/shortcuts/registry.ts` (the TS registry is the
/// single source of truth for the in-app keymap; this list only mirrors the
/// subset marked global, since Rust can't parse the TS file). On trigger we
/// just forward the id to the frontend via the `global-shortcut` event — app
/// behavior for each id lives entirely in TS.
const GLOBAL_SHORTCUTS: [(&str, &str); 2] = [
    ("global.quickCapture", "CmdOrCtrl+Alt+N"),
    ("app.showWindow", "CmdOrCtrl+Shift+Space"),
];

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

/// Toggles the main window between maximized and the default size (1440×960)
/// centered on screen. Bound to `mod+enter` in the desktop shell.
#[tauri::command]
async fn toggle_window_size(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())?;
        window
            .set_size(LogicalSize::new(1440.0, 960.0))
            .map_err(|e| e.to_string())?;
        window.center().map_err(|e| e.to_string())?;
    } else {
        window.maximize().map_err(|e| e.to_string())?;
    }

    Ok(())
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

/// Body-free note list for the sidebar/list UI — `list_notes` ships every
/// note's markdown + richContent JSON over IPC (megabytes on a real vault),
/// which the list view never reads.
#[tauri::command]
fn list_note_metadata(storage: State<'_, Storage>) -> Result<Vec<NoteMetadata>, String> {
    storage.list_note_metadata().map_err(stringify)
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportWorkspaceArchiveRequest {
    folders: Vec<Folder>,
    notes: Vec<Note>,
    journal_entries: Vec<JournalEntry>,
    journal_tags: Vec<JournalTag>,
    deleted_note_ids: Vec<String>,
    deleted_folder_ids: Vec<String>,
    deleted_journal_entry_ids: Vec<String>,
    deleted_journal_tag_ids: Vec<String>,
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
    request: ImportWorkspaceArchiveRequest,
) -> Result<(), String> {
    let ImportWorkspaceArchiveRequest {
        folders,
        notes,
        journal_entries,
        journal_tags,
        deleted_note_ids,
        deleted_folder_ids,
        deleted_journal_entry_ids,
        deleted_journal_tag_ids,
    } = request;
    // 1. Create a backup of the vault
    vault
        .create_import_backup()
        .map_err(|e| format!("Failed to create backup: {e}"))?;

    // 2. Perform the sequential filesystem writes
    let mut import_failed = false;
    let mut err_msg = String::new();

    let perform_writes = || -> Result<(), String> {
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
        Ok(())
    };

    if let Err(e) = perform_writes() {
        import_failed = true;
        err_msg = e;
    }

    // 3. If filesystem writes succeeded, perform SQLite write
    if !import_failed {
        if let Err(e) = storage.import_workspace(WorkspaceImport {
            folders: &folders,
            notes: &notes,
            journal_entries: &journal_entries,
            journal_tags: &journal_tags,
            deleted_note_ids: &deleted_note_ids,
            deleted_folder_ids: &deleted_folder_ids,
            deleted_journal_entry_ids: &deleted_journal_entry_ids,
            deleted_journal_tag_ids: &deleted_journal_tag_ids,
        }) {
            import_failed = true;
            err_msg = stringify(e);
        }
    }

    // 4. Handle success or failure
    if import_failed {
        if let Err(rollback_err) = vault.restore_import_backup() {
            return Err(format!(
                "Import failed: {}. Critical: Backup restore failed: {}",
                err_msg, rollback_err
            ));
        }
        return Err(err_msg);
    }

    // Success! Clean up the backup
    if let Err(e) = vault.discard_import_backup() {
        eprintln!("Failed to clean up import backup: {e}");
    }

    Ok(())
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
fn list_unindexed_note_ids(storage: State<'_, Storage>) -> Result<Vec<String>, String> {
    storage.list_unindexed_note_ids().map_err(stringify)
}

#[tauri::command]
fn replace_note_links_bulk(
    storage: State<'_, Storage>,
    entries: Vec<NoteLinkReplacement>,
) -> Result<(), String> {
    storage.replace_note_links_bulk(&entries).map_err(stringify)
}

#[tauri::command]
fn clear_note_links_index(storage: State<'_, Storage>) -> Result<(), String> {
    storage.clear_note_links_index().map_err(stringify)
}

#[tauri::command]
fn list_tag_summaries(storage: State<'_, Storage>) -> Result<Vec<TagSummaryRow>, String> {
    storage.list_tag_summaries().map_err(stringify)
}

#[tauri::command]
fn list_tag_notes(
    storage: State<'_, Storage>,
    name: String,
) -> Result<Vec<TaggedNoteSummaryRow>, String> {
    storage
        .list_linked_note_summaries("tag", &name)
        .map_err(stringify)
}

#[tauri::command]
fn list_person_notes(
    storage: State<'_, Storage>,
    person_id: String,
) -> Result<Vec<TaggedNoteSummaryRow>, String> {
    storage
        .list_linked_note_summaries("person", &person_id)
        .map_err(stringify)
}

#[tauri::command]
fn list_note_link_rows(storage: State<'_, Storage>) -> Result<Vec<NoteLinkRow>, String> {
    storage.list_note_link_rows().map_err(stringify)
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
    tags: Option<Vec<String>>,
    people: Option<Vec<String>>,
    limit: Option<i64>,
) -> Result<Vec<SearchHit>, String> {
    storage
        .search_notes(
            &query,
            &tags.unwrap_or_default(),
            &people.unwrap_or_default(),
            limit.unwrap_or(20),
        )
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
fn save_cover_image(
    vault: State<'_, VaultStore>,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    vault
        .save_cover_image(&file_name, &bytes)
        .map_err(vault_err)
}

#[tauri::command]
fn read_cover_image(vault: State<'_, VaultStore>, relative: String) -> Result<Vec<u8>, String> {
    vault.read_cover_image(&relative).map_err(vault_err)
}

#[tauri::command]
fn list_cover_images(
    vault: State<'_, VaultStore>,
) -> Result<Vec<crate::vault::CoverImageEntry>, String> {
    vault.list_cover_images().map_err(vault_err)
}

#[tauri::command]
fn delete_cover_image(vault: State<'_, VaultStore>, relative: String) -> Result<(), String> {
    vault.delete_cover_image(&relative).map_err(vault_err)
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
fn list_tasks(storage: State<'_, Storage>) -> Result<Vec<Task>, String> {
    storage.list_tasks().map_err(stringify)
}

#[tauri::command]
fn upsert_task(storage: State<'_, Storage>, task: Task) -> Result<Task, String> {
    storage.upsert_task(&task).map_err(stringify)?;
    Ok(task)
}

#[tauri::command]
fn delete_task(storage: State<'_, Storage>, id: String) -> Result<(), String> {
    storage.delete_task(&id).map_err(stringify)
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

/// Records a version for a note write, mirroring the web `updateNote` action
/// (`src/domain/notes/actions.ts`). Every write — autosaves included — goes
/// through `Storage::insert_note_version`, whose decision logic skips trivial
/// edits and coalesces same-burst saves into the latest row. The
/// `create_checkpoint`/`session_version_id` params are kept for IPC
/// compatibility but no longer drive persistence.
#[tauri::command]
fn record_note_version(
    storage: State<'_, Storage>,
    note_id: String,
    snapshot: NoteVersionSnapshot,
    reason: String,
    create_checkpoint: bool,
    session_version_id: Option<String>,
) -> Result<VersionWriteResult, String> {
    record_note_version_inner(
        &storage,
        &note_id,
        &snapshot,
        &reason,
        create_checkpoint,
        session_version_id,
    )
}

fn record_note_version_inner(
    storage: &Storage,
    note_id: &str,
    snapshot: &NoteVersionSnapshot,
    reason: &str,
    _create_checkpoint: bool,
    _session_version_id: Option<String>,
) -> Result<VersionWriteResult, String> {
    let version_id = storage
        .insert_note_version(note_id, snapshot, reason, now_ms())
        .map_err(stringify)?;

    Ok(VersionWriteResult {
        version_changed: version_id.is_some(),
        version_id,
    })
}

/// One-round-trip note save: vault write, index upsert, link-index replace, and
/// version bookkeeping in a single IPC command. The version snapshot is derived
/// from `note` server-side so the body crosses the boundary once. Replaces the
/// `upsert_note` → `replace_note_links` → `record_note_version` sequence the
/// autosave and create paths used to issue as three separate invokes.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveNoteRequest {
    note: Note,
    links: Vec<NoteLinkInput>,
    title_keys: Vec<String>,
    reason: String,
    // Retained for IPC wire compatibility; versioning no longer reads them
    // (Storage::save_note_index applies the coalescing rules itself).
    #[allow(dead_code)]
    create_checkpoint: bool,
    #[allow(dead_code)]
    session_version_id: Option<String>,
}

#[tauri::command]
fn save_note(
    app: AppHandle,
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    request: SaveNoteRequest,
) -> Result<VersionWriteResult, String> {
    let SaveNoteRequest {
        note,
        links,
        title_keys,
        reason,
        ..
    } = request;
    // Exactly two top-level operations: the canonical vault commit, then one
    // derived-index transaction. A vault failure aborts before the index is
    // touched; an index failure after the vault commit means the note file is
    // safe on disk and only the derived rows lag, so repair is scheduled and
    // the error says precisely that.
    vault.upsert_note(&note).map_err(vault_err)?;
    match storage.save_note_index(SaveNoteIndex {
        note: &note,
        links: &links,
        title_keys: &title_keys,
        reason: &reason,
        now_ms: now_ms(),
    }) {
        Ok(version_id) => Ok(VersionWriteResult {
            version_changed: version_id.is_some(),
            version_id,
        }),
        Err(error) => {
            schedule_index_repair(&app);
            Err(format!(
                "Your note was saved to its vault file, but refreshing the search index failed: {error}. \
				 No content was lost; the index repairs itself automatically."
            ))
        }
    }
}

/// After a derived-index failure whose canonical vault write succeeded, tells
/// the frontend the index is stale (`index://dirty`) and reruns the launch
/// reconcile off the command thread, flagging completion the same way the
/// deferred startup reconcile does (`index://reconciled`).
fn schedule_index_repair(app: &AppHandle) {
    let _ = app.emit("index://dirty", ());
    let bg = app.clone();
    std::thread::spawn(move || {
        let storage = bg.state::<Storage>();
        let vault = bg.state::<VaultStore>();
        if let Err(error) = reconcile_index(&storage, &vault) {
            eprintln!("[skriuw] index repair reconcile failed: {error}");
            return;
        }
        let _ = bg.emit("index://reconciled", ());
    });
}

#[cfg(test)]
mod ipc_contract_tests {
    use super::{ImportWorkspaceArchiveRequest, SaveNoteRequest};
    use serde_json::json;

    #[test]
    fn import_workspace_request_uses_camel_case_wire_fields() {
        let request: ImportWorkspaceArchiveRequest = serde_json::from_value(json!({
            "folders": [],
            "notes": [],
            "journalEntries": [],
            "journalTags": [],
            "deletedNoteIds": ["note-1"],
            "deletedFolderIds": [],
            "deletedJournalEntryIds": [],
            "deletedJournalTagIds": []
        }))
        .expect("desktop import request should deserialize");

        assert_eq!(request.deleted_note_ids, ["note-1"]);
    }

    #[test]
    fn save_note_request_uses_nested_camel_case_wire_fields() {
        let request: SaveNoteRequest = serde_json::from_value(json!({
            "note": {
                "id": "note-1",
                "name": "Note",
                "content": "Body",
                "richContent": [],
                "preferredEditorMode": "rich",
                "parentId": null,
                "sortOrder": 0,
                "tags": [],
                "properties": {},
                "icon": null,
                "cover": null,
                "annotationScene": "",
                "createdAt": 1,
                "modifiedAt": 2
            },
            "links": [],
            "titleKeys": ["note"],
            "reason": "autosave",
            "createCheckpoint": false,
            "sessionVersionId": null
        }))
        .expect("desktop save request should deserialize");

        assert_eq!(request.note.id, "note-1");
        assert_eq!(request.title_keys, ["note"]);
        assert!(!request.create_checkpoint);
    }
}

#[cfg(test)]
mod index_lag_tests {
    use super::{reconcile_index, Note, Storage, VaultStore};
    use std::path::Path;

    /// The vault-success/SQLite-failure scenario: the canonical file exists but
    /// the derived index never saw the save. The launch/repair reconcile must
    /// restore the note row from the vault without touching the markdown.
    #[test]
    fn reconcile_repairs_an_index_that_missed_a_vault_commit() {
        let dir = tempfile::tempdir().unwrap();
        let vault = VaultStore::open(dir.path()).unwrap();
        let storage = Storage::open(Path::new(":memory:")).unwrap();

        let note = Note {
            id: "n1".to_string(),
            name: "Saved.md".to_string(),
            content: "survived the crash".to_string(),
            rich_content: serde_json::Value::Array(Vec::new()),
            preferred_editor_mode: "block".to_string(),
            parent_id: None,
            sort_order: 0,
            tags: Vec::new(),
            properties: serde_json::Value::Array(Vec::new()),
            icon: None,
            cover: None,
            annotation_scene: String::new(),
            created_at: 1,
            modified_at: 2,
        };
        vault.upsert_note(&note).unwrap();
        assert!(storage.get_note("n1").unwrap().is_none());

        reconcile_index(&storage, &vault).unwrap();

        let repaired = storage.get_note("n1").unwrap().unwrap();
        assert_eq!(repaired.content, "survived the crash");
        assert!(std::fs::read_to_string(dir.path().join("Saved.md"))
            .unwrap()
            .contains("survived the crash"));
        // The repaired note has no note_titles rows yet, so the frontend
        // link backfill picks it up and restores its link rows.
        assert_eq!(
            storage.list_unindexed_note_ids().unwrap(),
            vec!["n1".to_string()]
        );
    }
}

#[tauri::command]
fn get_note_versions(
    storage: State<'_, Storage>,
    note_id: String,
    limit: Option<i64>,
) -> Result<Vec<NoteVersion>, String> {
    storage
        .list_note_versions(
            &note_id,
            limit.unwrap_or(crate::versioning::RETENTION_LIMIT),
        )
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
        icon: current.icon,
        cover: current.cover,
        // Versions don't capture annotations; a restore keeps the current ink.
        annotation_scene: current.annotation_scene,
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

/// Combines the typed settings snapshot with the OS home-directory fallback.
fn configured_vault_root<R: Runtime>(
    handle: &AppHandle<R>,
    settings: &SettingsStore,
) -> Result<PathBuf, String> {
    let default = default_vault_root(handle)?;
    Ok(settings
        .snapshot()
        .map_err(|error| error.to_string())?
        .vault_root_or(default))
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
fn get_vault_root(app: AppHandle, settings: State<'_, SettingsStore>) -> Result<String, String> {
    Ok(configured_vault_root(&app, &settings)?
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
fn get_settings_diagnostics(
    settings: State<'_, SettingsStore>,
) -> Result<settings::SettingsDiagnostics, String> {
    settings.diagnostics().map_err(|error| error.to_string())
}

/// Persists a new vault root. Takes effect on the next launch (the live vault +
/// index are opened once at startup).
#[tauri::command]
fn set_vault_root(settings: State<'_, SettingsStore>, path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("vault root must not be empty".to_string());
    }
    settings
        .set_vault_root(PathBuf::from(trimmed))
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// Exports the markdown vault to a user-chosen `.zip`. Returns the chosen path,
/// or `None` if the save dialog was cancelled.
#[tauri::command]
async fn export_vault(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
) -> Result<Option<String>, String> {
    let root = configured_vault_root(&app, &settings)?;
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
    settings: State<'_, SettingsStore>,
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
    let vault_root = configured_vault_root(&app, &settings)?;
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

/// Phase status forwarded to the restore UI so it can show inspecting →
/// staging → validating → swapping → rebuilding → verifying → complete.
fn restore_phase(progress: &Channel<backup::SnapshotEvent>, message: &str) {
    let _ = progress.send(backup::SnapshotEvent::Status {
        message: message.to_string(),
    });
}

/// Smoke-reads the rebound workspace: folders, note metadata, and one note
/// body if any note exists. Run after every restore before reporting success.
fn verify_restored_workspace(storage: &Storage) -> Result<(), String> {
    storage.list_folders().map_err(stringify)?;
    let metadata = storage.list_note_metadata().map_err(stringify)?;
    if let Some(first) = metadata.first() {
        storage.get_note(&first.id).map_err(stringify)?;
    }
    Ok(())
}

/// Builds the recovery message shown when a restore rolls back or, worse, when
/// rollback itself leaves data parked in recovery directories.
fn recovery_error(primary: &str, unrecovered: &[std::path::PathBuf]) -> String {
    if unrecovered.is_empty() {
        return format!("Restore failed and the previous workspace was restored: {primary}");
    }
    let paths = unrecovered
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "Restore failed: {primary}. Your previous data is safe but could not be moved back \
		 automatically. Recover it from: {paths}"
    )
}

/// Restores the vault from a backup `.zip` without destroying the live vault
/// until the replacement is staged, validated, committed, and smoke-read.
/// Returns `false` if the pick was cancelled.
#[tauri::command]
async fn import_vault(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    progress: Channel<backup::SnapshotEvent>,
) -> Result<bool, String> {
    let root = configured_vault_root(&app, &settings)?;
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
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?;

    restore_phase(&progress, "Inspecting backup");
    let plan = backup::inspect_restore(&archive, &root).map_err(|error| error.to_string())?;
    if plan.kind != backup::RestoreKind::VaultBackup {
        return Err(
            "This file is a full desktop snapshot, not a vault backup. Use \"Restore snapshot\" instead."
                .to_string(),
        );
    }

    restore_phase(&progress, "Staging and validating");
    let staged =
        backup::stage_restore(&archive, &plan, &app_data_dir, &app_data_dir).map_err(|error| {
            format!("Restore failed; your current workspace was not changed: {error}")
        })?;

    restore_phase(&progress, "Swapping in restored vault");
    let receipt = backup::commit_restore(staged).map_err(|error| {
        format!("Restore failed; your current workspace was not changed: {error}")
    })?;

    restore_phase(&progress, "Rebuilding index and verifying");
    vault.reload_root(root.clone());
    let rebound =
        reconcile_index(&storage, &vault).and_then(|()| verify_restored_workspace(&storage));
    match rebound {
        Ok(()) => {
            backup::discard_restore_receipt(&receipt);
            restore_phase(&progress, "Restore complete");
            Ok(true)
        }
        Err(primary) => {
            let unrecovered = backup::rollback_receipt(&receipt);
            vault.reload_root(root);
            let _ = reconcile_index(&storage, &vault);
            Err(recovery_error(&primary, &unrecovered))
        }
    }
}

/// Restores a full desktop snapshot. App data, local AI data, and vault are
/// staged and validated first; the live roots are swapped only once the
/// replacement is proven, and a failed rebind rolls every root back. The
/// long-lived Rust state is rebound in place, then the frontend reloads.
#[tauri::command]
async fn import_snapshot(
    app: AppHandle,
    storage: State<'_, Storage>,
    vault: State<'_, VaultStore>,
    settings: State<'_, SettingsStore>,
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
    let current_vault = configured_vault_root(&app, &settings)?;

    restore_phase(&progress, "Inspecting snapshot");
    let plan =
        backup::inspect_restore(&archive, &current_vault).map_err(|error| error.to_string())?;
    if plan.kind != backup::RestoreKind::Snapshot {
        return Err(
            "This file is a vault backup, not a full snapshot. Use \"Restore vault\" instead."
                .to_string(),
        );
    }

    restore_phase(&progress, "Staging and validating");
    let staged = backup::stage_restore(&archive, &plan, &app_data_dir, &app_local_data_dir)
        .map_err(|error| {
            format!("Restore failed; your current workspace was not changed: {error}")
        })?;

    // Stop managed Ollama before the local-data root is swapped underneath it.
    ai::stop_managed_server();

    restore_phase(&progress, "Swapping in restored data");
    let receipt = backup::commit_restore(staged).map_err(|error| {
        ai::autostart_managed(&app, &settings);
        format!("Restore failed; your current workspace was not changed: {error}")
    })?;

    restore_phase(&progress, "Rebuilding index and verifying");
    let rebound = (|| -> Result<(), String> {
        settings.reload().map_err(|error| error.to_string())?;
        let vault_root = configured_vault_root(&app, &settings)?;
        storage
            .reload(&app_data_dir.join("index.db"))
            .map_err(stringify)?;
        vault.reload_root(vault_root);
        vault.set_cover_root(
            settings
                .snapshot()
                .map_err(|error| error.to_string())?
                .cover_assets_root,
        );
        reconcile_index(&storage, &vault)?;
        verify_restored_workspace(&storage)
    })();

    match rebound {
        Ok(()) => {
            backup::discard_restore_receipt(&receipt);
            ai::autostart_managed(&app, &settings);
            restore_phase(&progress, "Restore complete");
            Ok(())
        }
        Err(primary) => {
            let unrecovered = backup::rollback_receipt(&receipt);
            let _ = settings.reload();
            let previous_vault = configured_vault_root(&app, &settings).unwrap_or(current_vault);
            let _ = storage.reload(&app_data_dir.join("index.db"));
            vault.reload_root(previous_vault);
            let _ = reconcile_index(&storage, &vault);
            ai::autostart_managed(&app, &settings);
            Err(recovery_error(&primary, &unrecovered))
        }
    }
}

/// Permanently deletes all local notes/folders: empties the vault directory and
/// rebuilds (now-empty) the SQLite index from it.
#[tauri::command]
fn clear_local_data(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
    storage: State<'_, Storage>,
) -> Result<(), String> {
    let root = configured_vault_root(&app, &settings)?;
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
    settings: State<'_, SettingsStore>,
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
    let vault_root = configured_vault_root(&app, &settings)?;
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
    settings.reload().map_err(|error| error.to_string())?;
    let next_vault_root = configured_vault_root(&app, &settings)?;
    storage
        .reload(&app_data_dir.join("index.db"))
        .map_err(stringify)?;
    vault.reload_root(next_vault_root);
    vault.set_cover_root(None);
    Ok(())
}

/// Opens a folder picker and persists the chosen directory as the new vault
/// root (takes effect next launch). Returns the chosen path, or `None` if
/// cancelled.
#[tauri::command]
fn choose_vault_root(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(target) = picked else {
        return Ok(None);
    };
    let dir = target.as_path().ok_or("invalid folder path")?.to_path_buf();
    let as_str = dir.to_string_lossy().into_owned();
    settings
        .set_vault_root(dir)
        .map_err(|error| error.to_string())?;
    Ok(Some(as_str))
}

/// Opens the vault directory in the OS file manager.
#[tauri::command]
fn reveal_vault(app: AppHandle, settings: State<'_, SettingsStore>) -> Result<(), String> {
    let root = configured_vault_root(&app, &settings)?;
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    open_in_file_manager(&root)
}

/// Returns the directory cover images are currently stored in — the user's
/// override if one is set, else `.skriuw/assets/cover-images` under the vault.
#[tauri::command]
fn get_cover_assets_root(vault: State<'_, VaultStore>) -> Result<String, String> {
    Ok(vault.cover_images_dir().to_string_lossy().into_owned())
}

/// Opens a folder picker and, if a folder was chosen, persists it as the
/// cover-images override and applies it immediately (no restart needed).
#[tauri::command]
fn choose_cover_assets_root(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
    vault: State<'_, VaultStore>,
) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(target) = picked else {
        return Ok(None);
    };
    let dir = target.as_path().ok_or("invalid folder path")?.to_path_buf();
    let as_str = dir.to_string_lossy().into_owned();
    settings
        .set_cover_assets_root(Some(dir.clone()))
        .map_err(|error| error.to_string())?;
    vault.set_cover_root(Some(dir));
    Ok(Some(as_str))
}

/// Clears the cover-images override, reverting to the vault default.
#[tauri::command]
fn reset_cover_assets_root(
    settings: State<'_, SettingsStore>,
    vault: State<'_, VaultStore>,
) -> Result<String, String> {
    settings
        .set_cover_assets_root(None)
        .map_err(|error| error.to_string())?;
    vault.set_cover_root(None);
    Ok(vault.cover_images_dir().to_string_lossy().into_owned())
}

/// Opens the cover-images directory in the OS file manager.
#[tauri::command]
fn reveal_cover_assets(vault: State<'_, VaultStore>) -> Result<(), String> {
    let dir = vault.cover_images_dir();
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    open_in_file_manager(&dir)
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
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::DECORATIONS,
                )
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let handle = app.handle();

            for (id, accelerator) in GLOBAL_SHORTCUTS {
                app.global_shortcut()
                    .on_shortcut(accelerator, move |app, _shortcut, event| {
                        if event.state() != ShortcutState::Pressed {
                            return;
                        }
                        // `app.showWindow` is OS-level window chrome rather than
                        // app behavior, so it's handled the same way the
                        // single-instance plugin already reveals the window.
                        if id == "app.showWindow" {
                            reveal_main_window(app);
                        }
                        let _ = app.emit("global-shortcut", id);
                    })
                    .unwrap_or_else(|err| {
                        eprintln!("[skriuw] failed to register global shortcut {id} ({accelerator}): {err}");
                    });
            }

            let dir = app.path().app_data_dir().expect("resolve app data dir");
            std::fs::create_dir_all(&dir)?;

            let settings = SettingsStore::load_in(&dir)?;
            let settings_snapshot = settings.snapshot()?;
            if let Some(error) = settings.diagnostics()?.recovery_error {
                eprintln!("[skriuw] settings recovery mode: {error}");
            }
            let vault_root = settings_snapshot.vault_root_or(default_vault_root(handle)?);
            let vault = VaultStore::open(&vault_root)?;
            vault.set_cover_root(settings_snapshot.cover_assets_root);
            app.manage(settings);

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

            // Marker-tagged staging/rollback directories left by a crashed
            // restore are cleaned only AFTER the live workspace reconciles, so
            // a rollback directory is never deleted before we know the live
            // roots are readable. Roots share parents with app data + vault.
            let app_local_data_dir = app.path().app_local_data_dir().ok();
            let cleanup_data_dir = dir.clone();
            let cleanup_roots = move |vault_root: &Path| {
                let mut roots: Vec<PathBuf> = vec![cleanup_data_dir.clone(), vault_root.to_path_buf()];
                if let Some(local) = &app_local_data_dir {
                    roots.push(local.clone());
                }
                let borrowed: Vec<&Path> = roots.iter().map(PathBuf::as_path).collect();
                backup::cleanup_restore_artifacts(&borrowed);
            };

            if index_existed {
                app.manage(storage);
                app.manage(vault);

                // The window paints against the prior index immediately while the
                // reconcile runs here; once it lands we flip `IndexReady` and emit
                // `index://reconciled` so the frontend refetches any list that
                // resolved against the pre-reconcile index.
                let bg = handle.clone();
                let vault_root_bg = vault_root.clone();
                std::thread::spawn(move || {
                    let storage = bg.state::<Storage>();
                    let vault = bg.state::<VaultStore>();
                    if let Err(err) = reconcile_index(&storage, &vault) {
                        eprintln!("[skriuw] background index reconcile failed: {err}");
                    }
                    cleanup_roots(&vault_root_bg);
                    bg.state::<IndexReady>().0.store(true, Ordering::SeqCst);
                    let _ = bg.emit("index://reconciled", ());
                });
            } else {
                reconcile_index(&storage, &vault)?;
                cleanup_roots(&vault_root);
                app.manage(storage);
                app.manage(vault);
                handle.state::<IndexReady>().0.store(true, Ordering::SeqCst);
            }

            build_tray(handle)?;

            // If a managed Ollama is already installed, warm it up in the
            // background so the first local AI action is instant.
            ai::autostart_managed(handle, &handle.state::<SettingsStore>());
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
            toggle_window_size,
            index_ready,
            list_notes,
            list_note_metadata,
            get_note,
            get_notes,
            upsert_note,
            save_note,
            bulk_upsert_notes,
            import_workspace_archive,
            delete_note,
            replace_note_links,
            replace_note_links_bulk,
            clear_note_links_index,
            list_tag_summaries,
            list_tag_notes,
            list_person_notes,
            list_note_link_rows,
            list_unindexed_note_ids,
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
            save_cover_image,
            read_cover_image,
            list_cover_images,
            delete_cover_image,
            get_cover_assets_root,
            choose_cover_assets_root,
            reset_cover_assets_root,
            reveal_cover_assets,
            list_journal_entries,
            upsert_journal_entry,
            delete_journal_entry,
            list_journal_tags,
            upsert_journal_tag,
            delete_journal_tag,
            list_tasks,
            upsert_task,
            delete_task,
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
            get_settings_diagnostics,
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
            content_analysis::analyze_note_content,
            markdown::markdown_to_rich,
            import_export::parse_import_json,
            import_export::import_notes_batch,
            import_export::extract_and_validate_archive,
            import_export::build_export_archive,
            ai::ai_get_config,
            ai::ai_set_config,
            ai::ai_set_key,
            ai::ai_complete,
            ai::ai_complete_stream,
            ai::ai_cancel_ai_stream,
            ai::ai_ping,
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
