mod backup;
mod storage;
mod vault;

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;
use storage::{BacklinkSources, Folder, Note, NoteLinkInput, SearchHit, Storage};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;
use vault::VaultStore;

/// Custom (non-predefined) menu item ids forwarded to the frontend. Predefined
/// items (undo/copy/quit/…) are handled natively by Tauri and never reach here.
const MENU_ACTION_IDS: [&str; 4] = ["new-note", "new-folder", "save", "toggle-sidebar"];

#[derive(Serialize)]
pub struct AppInfo {
	pub app: String,
	pub shell: String,
	pub status: String,
	pub version: String,
}

#[tauri::command]
fn greet(name: &str) -> String {
	let who = if name.trim().is_empty() { "world" } else { name };
	format!("Hello, {who} — the Skriuw desktop shell is alive.")
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

#[tauri::command]
fn delete_note(
	storage: State<'_, Storage>,
	vault: State<'_, VaultStore>,
	id: String,
) -> Result<(), String> {
	vault.delete_note(&id).map_err(vault_err)?;
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
	vault.delete_folder(&id).map_err(vault_err)?;
	storage.delete_folder(&id).map_err(stringify)
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
fn export_vault(app: AppHandle) -> Result<Option<String>, String> {
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

/// Restores the vault from a backup `.zip`, REPLACING the current vault, then
/// rebuilds the SQLite index from it. Returns `false` if the pick was cancelled.
#[tauri::command]
fn import_vault(app: AppHandle, storage: State<'_, Storage>) -> Result<bool, String> {
	let root = read_vault_root(&app)?;
	let picked = app
		.dialog()
		.file()
		.add_filter("Zip archive", &["zip"])
		.blocking_pick_file();
	let Some(target) = picked else {
		return Ok(false);
	};
	let archive = target.as_path().ok_or("invalid archive path")?.to_path_buf();
	backup::clear_dir_contents(&root).map_err(|error| error.to_string())?;
	backup::unzip_into(&archive, &root).map_err(|error| error.to_string())?;
	let vault = VaultStore::open(&root).map_err(vault_err)?;
	reconcile_index(&storage, &vault)?;
	Ok(true)
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

/// Builds the native application menu. Predefined items work out of the box;
/// the custom File/View items emit a `menu://action` event to the frontend.
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

	let app_menu = Submenu::with_items(
		handle,
		"Skriuw",
		true,
		&[
			&PredefinedMenuItem::about(handle, Some("About Skriuw"), None)?,
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
	tauri::Builder::default()
		.plugin(tauri_plugin_fs::init())
		.plugin(tauri_plugin_dialog::init())
		.plugin(tauri_plugin_window_state::Builder::default().build())
		.setup(|app| {
			let handle = app.handle();
			let dir = app.path().app_data_dir().expect("resolve app data dir");
			std::fs::create_dir_all(&dir)?;

			let vault_root = read_vault_root(handle)?;
			let vault = VaultStore::open(&vault_root)?;

			// The markdown vault is the source of truth; SQLite is a derived index
			// (FTS5 search, backlinks) kept in a separate `index.db` so the legacy
			// `skriuw.db` is left untouched. Rebuilt from the vault on every launch.
			let storage = Storage::open(&dir.join("index.db"))?;
			reconcile_index(&storage, &vault)?;

			app.manage(storage);
			app.manage(vault);
			Ok(())
		})
		.menu(build_menu)
		.on_menu_event(|app, event| {
			let id = event.id().as_ref();
			if MENU_ACTION_IDS.contains(&id) {
				let _ = app.emit("menu://action", id);
			}
		})
		.invoke_handler(tauri::generate_handler![
			greet,
			app_info,
			list_notes,
			get_note,
			get_notes,
			upsert_note,
			bulk_upsert_notes,
			delete_note,
			replace_note_links,
			has_indexed_links,
			get_backlink_sources,
			search_notes,
			list_folders,
			upsert_folder,
			delete_folder,
				get_vault_root,
				set_vault_root,
				export_vault,
				import_vault,
				clear_local_data,
				choose_vault_root,
				reveal_vault,
		])
		.run(tauri::generate_context!())
		.expect("error while running the Skriuw desktop shell");
}
