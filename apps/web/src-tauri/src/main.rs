#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection};
use serde_json::{Map, Value};
use std::{
	fs,
	path::PathBuf,
	time::{SystemTime, UNIX_EPOCH}
};
use tauri::{AppHandle, Manager};

fn now_ms() -> i64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map(|duration| duration.as_millis() as i64)
		.unwrap_or(0)
}

fn config_file_path(app: &AppHandle) -> Result<PathBuf, String> {
	let app_data_dir = app
		.path()
		.app_data_dir()
		.map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
	fs::create_dir_all(&app_data_dir)
		.map_err(|error| format!("Failed to create app data directory: {error}"))?;
	Ok(app_data_dir.join("storage-config.json"))
}

fn default_db_path(app: &AppHandle) -> Result<PathBuf, String> {
	let app_data_dir = app
		.path()
		.app_data_dir()
		.map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
	Ok(app_data_dir.join("skriuw-storage.db"))
}

fn default_fs_dir(app: &AppHandle) -> Result<PathBuf, String> {
	let app_data_dir = app
		.path()
		.app_data_dir()
		.map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
	Ok(app_data_dir.join("storage-fs"))
}

fn resolve_path(app: &AppHandle, raw: &str, fallback: PathBuf) -> PathBuf {
	let trimmed = raw.trim();
	if trimmed.is_empty() {
		return fallback;
	}
	let path = PathBuf::from(trimmed);
	if path.is_absolute() {
		return path;
	}
	if let Ok(app_data_dir) = app.path().app_data_dir() {
		return app_data_dir.join(path);
	}
	fallback
}

fn get_storage_config_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
	let cfg_path = config_file_path(app)?;
	let default_db = default_db_path(app)?;
	let default_fs = default_fs_dir(app)?;

	if !cfg_path.exists() {
		return Ok((default_db, default_fs));
	}

	let raw = fs::read_to_string(&cfg_path)
		.map_err(|error| format!("Failed to read storage config: {error}"))?;
	let parsed: Value =
		serde_json::from_str(&raw).map_err(|error| format!("Invalid storage config JSON: {error}"))?;

	let mut db_path = default_db.clone();
	let mut fs_dir = default_fs.clone();
	if let Value::Object(map) = parsed {
		if let Some(Value::String(db_raw)) = map.get("dbPath") {
			db_path = resolve_path(app, db_raw, default_db);
		}
		if let Some(Value::String(fs_raw)) = map.get("fsDir") {
			fs_dir = resolve_path(app, fs_raw, default_fs);
		}
	}

	Ok((db_path, fs_dir))
}

fn open_connection(app: &AppHandle) -> Result<Connection, String> {
	let (db_path, _fs_dir) = get_storage_config_paths(app)?;
	if let Some(parent) = db_path.parent() {
		fs::create_dir_all(parent)
			.map_err(|error| format!("Failed to create database directory: {error}"))?;
	}
	let conn =
		Connection::open(db_path).map_err(|error| format!("Failed to open SQLite database: {error}"))?;

	conn.execute_batch(
		"
		CREATE TABLE IF NOT EXISTS records (
			storage_key TEXT NOT NULL,
			id TEXT NOT NULL,
			user_id TEXT,
			data TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			PRIMARY KEY(storage_key, id)
		);
		CREATE INDEX IF NOT EXISTS idx_records_storage_key_user
			ON records(storage_key, user_id);
		"
	)
	.map_err(|error| format!("Failed to initialize SQLite schema: {error}"))?;

	Ok(conn)
}

fn parse_object(data: &str) -> Result<Map<String, Value>, String> {
	let parsed: Value =
		serde_json::from_str(data).map_err(|error| format!("Invalid JSON payload: {error}"))?;

	match parsed {
		Value::Object(map) => Ok(map),
		_ => Err("Expected JSON object payload".to_string())
	}
}

fn map_to_json_string(map: Map<String, Value>) -> String {
	Value::Object(map).to_string()
}

fn merge_patch_into_base(base: &mut Map<String, Value>, patch: Map<String, Value>) {
	for (key, value) in patch {
		base.insert(key, value);
	}
}

fn extract_user_id_from_obj(obj: &Map<String, Value>) -> Option<String> {
	obj.get("userId")
		.and_then(Value::as_str)
		.map(str::to_string)
}

fn sanitize_storage_key(storage_key: &str) -> String {
	storage_key
		.chars()
		.map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '_' })
		.collect()
}

fn fs_storage_file_path(app: &AppHandle, storage_key: &str) -> Result<PathBuf, String> {
	let (_db_path, storage_dir) = get_storage_config_paths(app)?;
	fs::create_dir_all(&storage_dir)
		.map_err(|error| format!("Failed to create filesystem storage directory: {error}"))?;

	Ok(storage_dir.join(format!("{}.json", sanitize_storage_key(storage_key))))
}

fn load_fs_records(path: &PathBuf) -> Result<Vec<Map<String, Value>>, String> {
	if !path.exists() {
		return Ok(Vec::new());
	}

	let raw = fs::read_to_string(path)
		.map_err(|error| format!("Failed to read filesystem storage file: {error}"))?;

	let parsed: Value = serde_json::from_str(&raw)
		.map_err(|error| format!("Failed to parse filesystem storage JSON: {error}"))?;

	match parsed {
		Value::Array(items) => {
			let mut records = Vec::new();
			for item in items {
				match item {
					Value::Object(obj) => records.push(obj),
					_ => return Err("Filesystem storage record must be a JSON object".to_string())
				}
			}
			Ok(records)
		}
		_ => Err("Filesystem storage file must contain a JSON array".to_string())
	}
}

fn save_fs_records(path: &PathBuf, records: &[Map<String, Value>]) -> Result<(), String> {
	let value = Value::Array(records.iter().cloned().map(Value::Object).collect());
	let serialized = serde_json::to_string(&value)
		.map_err(|error| format!("Failed to serialize filesystem records: {error}"))?;
	fs::write(path, serialized)
		.map_err(|error| format!("Failed to write filesystem storage file: {error}"))?;
	Ok(())
}

fn user_matches_filter(record_user_id: Option<&str>, requested_user_id: Option<&str>) -> bool {
	match requested_user_id {
		Some(requested) => record_user_id == Some(requested),
		None => true
	}
}

#[tauri::command]
fn tauri_storage_create(
	app: AppHandle,
	storage_key: String,
	data: String,
	user_id: Option<String>
) -> Result<String, String> {
	let conn = open_connection(&app)?;
	let mut obj = parse_object(&data)?;

	let id = obj
		.get("id")
		.and_then(Value::as_str)
		.map(str::to_string)
		.ok_or_else(|| "Create payload must include string id".to_string())?;

	let created_at = obj
		.get("createdAt")
		.and_then(Value::as_i64)
		.unwrap_or_else(now_ms);
	let updated_at = now_ms();

	obj.insert("createdAt".to_string(), Value::from(created_at));
	obj.insert("updatedAt".to_string(), Value::from(updated_at));
	obj.insert("id".to_string(), Value::from(id.clone()));

	if let Some(uid) = &user_id {
		obj.insert("userId".to_string(), Value::from(uid.clone()));
	}

	let payload = map_to_json_string(obj);

	conn.execute(
		"INSERT INTO records (storage_key, id, user_id, data, created_at, updated_at)
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
		params![storage_key, id, user_id, payload, created_at, updated_at]
	)
	.map_err(|error| format!("Create failed: {error}"))?;

	Ok(payload)
}

#[tauri::command]
fn tauri_storage_read_one(
	app: AppHandle,
	storage_key: String,
	id: String,
	user_id: Option<String>
) -> Result<Option<String>, String> {
	let conn = open_connection(&app)?;

	let result = conn.query_row(
		"SELECT data, user_id FROM records WHERE storage_key = ?1 AND id = ?2",
		params![storage_key, id],
		|row| {
			let data: String = row.get(0)?;
			let row_user_id: Option<String> = row.get(1)?;
			Ok((data, row_user_id))
		}
	);

	match result {
		Ok((data, row_user_id)) => {
			if user_matches_filter(row_user_id.as_deref(), user_id.as_deref()) {
				Ok(Some(data))
			} else {
				Ok(None)
			}
		}
		Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
		Err(error) => Err(format!("Read one failed: {error}"))
	}
}

#[tauri::command]
fn tauri_storage_read_many(
	app: AppHandle,
	storage_key: String,
	user_id: Option<String>
) -> Result<Vec<String>, String> {
	let conn = open_connection(&app)?;
	let mut stmt = conn
		.prepare("SELECT data, user_id FROM records WHERE storage_key = ?1 ORDER BY created_at ASC")
		.map_err(|error| format!("Failed to prepare read many query: {error}"))?;

	let rows = stmt
		.query_map(params![storage_key], |row| {
			let data: String = row.get(0)?;
			let row_user_id: Option<String> = row.get(1)?;
			Ok((data, row_user_id))
		})
		.map_err(|error| format!("Failed to execute read many query: {error}"))?;

	let mut results = Vec::new();
	for row in rows {
		let (data, row_user_id) = row.map_err(|error| format!("Failed to read row: {error}"))?;
		if user_matches_filter(row_user_id.as_deref(), user_id.as_deref()) {
			results.push(data);
		}
	}

	Ok(results)
}

#[tauri::command]
fn tauri_storage_update(
	app: AppHandle,
	storage_key: String,
	id: String,
	data: String,
	user_id: Option<String>
) -> Result<Option<String>, String> {
	let conn = open_connection(&app)?;

	let existing = conn.query_row(
		"SELECT data, user_id, created_at FROM records WHERE storage_key = ?1 AND id = ?2",
		params![storage_key, id],
		|row| {
			let payload: String = row.get(0)?;
			let row_user_id: Option<String> = row.get(1)?;
			let created_at: i64 = row.get(2)?;
			Ok((payload, row_user_id, created_at))
		}
	);

	let (_existing_payload, row_user_id, created_at) = match existing {
		Ok(row) => row,
		Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
		Err(error) => return Err(format!("Update lookup failed: {error}"))
	};

	if !user_matches_filter(row_user_id.as_deref(), user_id.as_deref()) {
		return Ok(None);
	}

	let mut base_obj = parse_object(&_existing_payload)?;
	let patch_obj = parse_object(&data)?;
	merge_patch_into_base(&mut base_obj, patch_obj);
	let updated_at = now_ms();

	base_obj.insert("id".to_string(), Value::from(id.clone()));
	base_obj.insert("createdAt".to_string(), Value::from(created_at));
	base_obj.insert("updatedAt".to_string(), Value::from(updated_at));
	if let Some(uid) = &user_id {
		base_obj.insert("userId".to_string(), Value::from(uid.clone()));
	}

	let payload = map_to_json_string(base_obj);

	conn.execute(
		"UPDATE records
		 SET data = ?1, updated_at = ?2
		 WHERE storage_key = ?3 AND id = ?4",
		params![payload, updated_at, storage_key, id]
	)
	.map_err(|error| format!("Update failed: {error}"))?;

	Ok(Some(payload))
}

#[tauri::command]
fn tauri_storage_delete(
	app: AppHandle,
	storage_key: String,
	id: String,
	user_id: Option<String>
) -> Result<bool, String> {
	let conn = open_connection(&app)?;

	let row_user_id: Option<String> = match conn.query_row(
		"SELECT user_id FROM records WHERE storage_key = ?1 AND id = ?2",
		params![storage_key, id],
		|row| row.get(0)
	) {
		Ok(user_id) => user_id,
		Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(false),
		Err(error) => return Err(format!("Delete lookup failed: {error}"))
	};

	if !user_matches_filter(row_user_id.as_deref(), user_id.as_deref()) {
		return Ok(false);
	}

	let affected = conn
		.execute(
			"DELETE FROM records WHERE storage_key = ?1 AND id = ?2",
			params![storage_key, id]
		)
		.map_err(|error| format!("Delete failed: {error}"))?;

	Ok(affected > 0)
}

#[tauri::command]
fn tauri_storage_get_paths(app: AppHandle) -> Result<Value, String> {
	let (db_path, fs_dir) = get_storage_config_paths(&app)?;
	let mut result = Map::new();
	result.insert("dbPath".to_string(), Value::from(db_path.to_string_lossy().to_string()));
	result.insert("fsDir".to_string(), Value::from(fs_dir.to_string_lossy().to_string()));
	Ok(Value::Object(result))
}

#[tauri::command]
fn tauri_storage_set_paths(
	app: AppHandle,
	db_path: Option<String>,
	fs_dir: Option<String>
) -> Result<Value, String> {
	let cfg_path = config_file_path(&app)?;
	let default_db = default_db_path(&app)?;
	let default_fs = default_fs_dir(&app)?;

	let resolved_db = db_path
		.as_deref()
		.map(|raw| resolve_path(&app, raw, default_db.clone()))
		.unwrap_or(default_db);
	let resolved_fs = fs_dir
		.as_deref()
		.map(|raw| resolve_path(&app, raw, default_fs.clone()))
		.unwrap_or(default_fs);

	if let Some(parent) = resolved_db.parent() {
		fs::create_dir_all(parent)
			.map_err(|error| format!("Failed to create database directory: {error}"))?;
	}
	fs::create_dir_all(&resolved_fs)
		.map_err(|error| format!("Failed to create filesystem directory: {error}"))?;

	let mut cfg = Map::new();
	cfg.insert(
		"dbPath".to_string(),
		Value::from(resolved_db.to_string_lossy().to_string())
	);
	cfg.insert(
		"fsDir".to_string(),
		Value::from(resolved_fs.to_string_lossy().to_string())
	);

	let serialized = serde_json::to_string(&Value::Object(cfg.clone()))
		.map_err(|error| format!("Failed to serialize storage config: {error}"))?;
	fs::write(cfg_path, serialized).map_err(|error| format!("Failed to write storage config: {error}"))?;

	Ok(Value::Object(cfg))
}

#[tauri::command]
fn tauri_fs_storage_create(
	app: AppHandle,
	storage_key: String,
	data: String,
	user_id: Option<String>
) -> Result<String, String> {
	let path = fs_storage_file_path(&app, &storage_key)?;
	let mut records = load_fs_records(&path)?;
	let mut obj = parse_object(&data)?;

	let id = obj
		.get("id")
		.and_then(Value::as_str)
		.map(str::to_string)
		.ok_or_else(|| "Create payload must include string id".to_string())?;

	let exists = records
		.iter()
		.any(|record| record.get("id").and_then(Value::as_str) == Some(id.as_str()));
	if exists {
		return Err("Create failed: record already exists".to_string());
	}

	let created_at = obj
		.get("createdAt")
		.and_then(Value::as_i64)
		.unwrap_or_else(now_ms);
	let updated_at = now_ms();

	obj.insert("id".to_string(), Value::from(id));
	obj.insert("createdAt".to_string(), Value::from(created_at));
	obj.insert("updatedAt".to_string(), Value::from(updated_at));
	if let Some(uid) = &user_id {
		obj.insert("userId".to_string(), Value::from(uid.clone()));
	}

	let payload = map_to_json_string(obj.clone());
	records.push(obj);
	save_fs_records(&path, &records)?;
	Ok(payload)
}

#[tauri::command]
fn tauri_fs_storage_read_one(
	app: AppHandle,
	storage_key: String,
	id: String,
	user_id: Option<String>
) -> Result<Option<String>, String> {
	let path = fs_storage_file_path(&app, &storage_key)?;
	let records = load_fs_records(&path)?;

	for record in records {
		let record_id = record.get("id").and_then(Value::as_str);
		if record_id != Some(id.as_str()) {
			continue;
		}
		let record_user_id = extract_user_id_from_obj(&record);
		if user_matches_filter(record_user_id.as_deref(), user_id.as_deref()) {
			return Ok(Some(map_to_json_string(record)));
		}
		return Ok(None);
	}

	Ok(None)
}

#[tauri::command]
fn tauri_fs_storage_read_many(
	app: AppHandle,
	storage_key: String,
	user_id: Option<String>
) -> Result<Vec<String>, String> {
	let path = fs_storage_file_path(&app, &storage_key)?;
	let records = load_fs_records(&path)?;

	let mut output = Vec::new();
	for record in records {
		let record_user_id = extract_user_id_from_obj(&record);
		if user_matches_filter(record_user_id.as_deref(), user_id.as_deref()) {
			output.push(map_to_json_string(record));
		}
	}

	Ok(output)
}

#[tauri::command]
fn tauri_fs_storage_update(
	app: AppHandle,
	storage_key: String,
	id: String,
	data: String,
	user_id: Option<String>
) -> Result<Option<String>, String> {
	let path = fs_storage_file_path(&app, &storage_key)?;
	let mut records = load_fs_records(&path)?;
	let patch = parse_object(&data)?;

	for record in &mut records {
		let record_id = record.get("id").and_then(Value::as_str);
		if record_id != Some(id.as_str()) {
			continue;
		}
		let record_user_id = extract_user_id_from_obj(record);
		if !user_matches_filter(record_user_id.as_deref(), user_id.as_deref()) {
			return Ok(None);
		}

		let created_at = record
			.get("createdAt")
			.and_then(Value::as_i64)
			.unwrap_or_else(now_ms);
		merge_patch_into_base(record, patch.clone());
		record.insert("id".to_string(), Value::from(id.clone()));
		record.insert("createdAt".to_string(), Value::from(created_at));
		record.insert("updatedAt".to_string(), Value::from(now_ms()));
		if let Some(uid) = &user_id {
			record.insert("userId".to_string(), Value::from(uid.clone()));
		}

		let payload = map_to_json_string(record.clone());
		save_fs_records(&path, &records)?;
		return Ok(Some(payload));
	}

	Ok(None)
}

#[tauri::command]
fn tauri_fs_storage_delete(
	app: AppHandle,
	storage_key: String,
	id: String,
	user_id: Option<String>
) -> Result<bool, String> {
	let path = fs_storage_file_path(&app, &storage_key)?;
	let mut records = load_fs_records(&path)?;

	let mut index_to_remove: Option<usize> = None;

	for (index, record) in records.iter().enumerate() {
		let record_id = record.get("id").and_then(Value::as_str);
		if record_id != Some(id.as_str()) {
			continue;
		}
		let record_user_id = extract_user_id_from_obj(record);
		if !user_matches_filter(record_user_id.as_deref(), user_id.as_deref()) {
			return Ok(false);
		}
		index_to_remove = Some(index);
		break;
	}

	if let Some(index) = index_to_remove {
		records.remove(index);
		save_fs_records(&path, &records)?;
		return Ok(true);
	}

	Ok(false)
}

fn main() {
	tauri::Builder::default()
		.plugin(tauri_plugin_fs::init())
		.invoke_handler(tauri::generate_handler![
			tauri_storage_create,
			tauri_storage_read_one,
			tauri_storage_read_many,
			tauri_storage_update,
			tauri_storage_delete,
			tauri_storage_get_paths,
			tauri_storage_set_paths,
			tauri_fs_storage_create,
			tauri_fs_storage_read_one,
			tauri_fs_storage_read_many,
			tauri_fs_storage_update,
			tauri_fs_storage_delete
		])
		.run(tauri::generate_context!())
		.expect("error while running tauri application")
}
