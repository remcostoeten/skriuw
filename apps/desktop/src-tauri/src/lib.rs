mod storage;

use serde::Serialize;
use storage::{Folder, Note, SearchHit, Storage};
use tauri::{Manager, State};

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
fn delete_note(storage: State<'_, Storage>, id: String) -> Result<(), String> {
	storage.delete_note(&id).map_err(stringify)
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

pub fn run() {
	tauri::Builder::default()
		.setup(|app| {
			let dir = app.path().app_data_dir().expect("resolve app data dir");
			std::fs::create_dir_all(&dir)?;
			let storage = Storage::open(&dir.join("skriuw.db"))?;
			app.manage(storage);
			Ok(())
		})
		.invoke_handler(tauri::generate_handler![
			greet,
			app_info,
			list_notes,
			get_note,
			get_notes,
			upsert_note,
			delete_note,
			search_notes,
			list_folders,
			upsert_folder,
			delete_folder,
		])
		.run(tauri::generate_context!())
		.expect("error while running the Skriuw desktop shell");
}
