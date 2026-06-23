mod storage;
mod vault;

use serde::Serialize;
use storage::{BacklinkSources, Folder, Note, NoteLinkInput, SearchHit, Storage};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, State};

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
fn upsert_note(storage: State<'_, Storage>, note: Note) -> Result<Note, String> {
	storage.upsert_note(&note).map_err(stringify)?;
	Ok(note)
}

#[tauri::command]
fn bulk_upsert_notes(storage: State<'_, Storage>, notes: Vec<Note>) -> Result<(), String> {
	storage.upsert_notes(&notes).map_err(stringify)
}

#[tauri::command]
fn delete_note(storage: State<'_, Storage>, id: String) -> Result<(), String> {
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
fn upsert_folder(storage: State<'_, Storage>, folder: Folder) -> Result<Folder, String> {
	storage.upsert_folder(&folder).map_err(stringify)?;
	Ok(folder)
}

#[tauri::command]
fn delete_folder(storage: State<'_, Storage>, id: String) -> Result<(), String> {
	storage.delete_folder(&id).map_err(stringify)
}

fn stringify(error: rusqlite::Error) -> String {
	error.to_string()
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
			let dir = app.path().app_data_dir().expect("resolve app data dir");
			std::fs::create_dir_all(&dir)?;
			let storage = Storage::open(&dir.join("skriuw.db"))?;
			app.manage(storage);
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
		])
		.run(tauri::generate_context!())
		.expect("error while running the Skriuw desktop shell");
}
