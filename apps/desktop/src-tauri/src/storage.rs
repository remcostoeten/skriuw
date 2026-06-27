use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

/// A note row, serialized to match the TypeScript `NoteFile` contract
/// (`src/domain/notes/models.ts`). `richContent` and `tags` are stored as JSON
/// TEXT in SQLite but cross the IPC boundary as real JSON values, and the two
/// timestamps cross as epoch-millis numbers — the `tauriBackend` maps them back
/// to `Date`.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
	pub id: String,
	pub name: String,
	pub content: String,
	pub rich_content: serde_json::Value,
	pub preferred_editor_mode: String,
	pub parent_id: Option<String>,
	pub sort_order: i64,
	pub tags: Vec<String>,
	pub created_at: i64,
	pub modified_at: i64,
}

/// A folder row, matching the TypeScript `NoteFolder` contract.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
	pub id: String,
	pub name: String,
	pub parent_id: Option<String>,
	pub sort_order: i64,
	pub is_open: bool,
}

/// Tauri-managed handle around the single SQLite connection. Every command
/// locks the mutex for the duration of its query; SQLite itself serializes
/// writers, and the workspace is single-user/local so contention is trivial.
pub struct Storage {
	conn: Mutex<Connection>,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS folders (
	id            TEXT PRIMARY KEY,
	name          TEXT NOT NULL,
	parent_id     TEXT REFERENCES folders(id) ON DELETE CASCADE,
	sort_order    INTEGER NOT NULL DEFAULT 0,
	is_open       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notes (
	id                    TEXT PRIMARY KEY,
	name                  TEXT NOT NULL,
	content               TEXT NOT NULL DEFAULT '',
	rich_content          TEXT NOT NULL DEFAULT '[]',
	preferred_editor_mode TEXT NOT NULL DEFAULT 'block',
	parent_id             TEXT REFERENCES folders(id) ON DELETE CASCADE,
	sort_order            INTEGER NOT NULL DEFAULT 0,
	tags                  TEXT NOT NULL DEFAULT '[]',
	created_at            INTEGER NOT NULL,
	modified_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
"#;

impl Storage {
	/// Opens (creating if missing) the SQLite database at `path`, enables WAL +
	/// foreign keys, and applies the schema.
	pub fn open(path: &Path) -> rusqlite::Result<Self> {
		let conn = Connection::open(path)?;
		conn.pragma_update(None, "journal_mode", "WAL")?;
		conn.pragma_update(None, "foreign_keys", "ON")?;
		conn.execute_batch(SCHEMA)?;
		Ok(Self {
			conn: Mutex::new(conn),
		})
	}

	fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
		self.conn.lock().expect("storage mutex poisoned")
	}

	pub fn list_notes(&self) -> rusqlite::Result<Vec<Note>> {
		let conn = self.lock();
		let mut stmt = conn.prepare(
			"SELECT id, name, content, rich_content, preferred_editor_mode, \
			 parent_id, sort_order, tags, created_at, modified_at FROM notes",
		)?;
		let rows = stmt.query_map([], row_to_note)?;
		rows.collect()
	}

	pub fn get_note(&self, id: &str) -> rusqlite::Result<Option<Note>> {
		let conn = self.lock();
		let mut stmt = conn.prepare(
			"SELECT id, name, content, rich_content, preferred_editor_mode, \
			 parent_id, sort_order, tags, created_at, modified_at FROM notes WHERE id = ?1",
		)?;
		let mut rows = stmt.query_map(params![id], row_to_note)?;
		match rows.next() {
			Some(note) => Ok(Some(note?)),
			None => Ok(None),
		}
	}

	pub fn upsert_note(&self, note: &Note) -> rusqlite::Result<()> {
		let conn = self.lock();
		conn.execute(
			"INSERT INTO notes \
			 (id, name, content, rich_content, preferred_editor_mode, parent_id, \
			  sort_order, tags, created_at, modified_at) \
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) \
			 ON CONFLICT(id) DO UPDATE SET \
			  name = excluded.name, content = excluded.content, \
			  rich_content = excluded.rich_content, \
			  preferred_editor_mode = excluded.preferred_editor_mode, \
			  parent_id = excluded.parent_id, sort_order = excluded.sort_order, \
			  tags = excluded.tags, modified_at = excluded.modified_at",
			params![
				note.id,
				note.name,
				note.content,
				note.rich_content.to_string(),
				note.preferred_editor_mode,
				note.parent_id,
				note.sort_order,
				serde_json::Value::from(note.tags.clone()).to_string(),
				note.created_at,
				note.modified_at,
			],
		)?;
		Ok(())
	}

	pub fn delete_note(&self, id: &str) -> rusqlite::Result<()> {
		self.lock().execute("DELETE FROM notes WHERE id = ?1", params![id])?;
		Ok(())
	}

	pub fn list_folders(&self) -> rusqlite::Result<Vec<Folder>> {
		let conn = self.lock();
		let mut stmt = conn
			.prepare("SELECT id, name, parent_id, sort_order, is_open FROM folders")?;
		let rows = stmt.query_map([], row_to_folder)?;
		rows.collect()
	}

	pub fn upsert_folder(&self, folder: &Folder) -> rusqlite::Result<()> {
		let conn = self.lock();
		conn.execute(
			"INSERT INTO folders (id, name, parent_id, sort_order, is_open) \
			 VALUES (?1, ?2, ?3, ?4, ?5) \
			 ON CONFLICT(id) DO UPDATE SET \
			  name = excluded.name, parent_id = excluded.parent_id, \
			  sort_order = excluded.sort_order, is_open = excluded.is_open",
			params![
				folder.id,
				folder.name,
				folder.parent_id,
				folder.sort_order,
				folder.is_open as i64,
			],
		)?;
		Ok(())
	}

	/// Deletes a folder. The `ON DELETE CASCADE` foreign keys remove descendant
	/// folders and any notes parented anywhere in that subtree.
	pub fn delete_folder(&self, id: &str) -> rusqlite::Result<()> {
		self.lock()
			.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
		Ok(())
	}
}

fn row_to_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
	let rich_raw: String = row.get(3)?;
	let tags_raw: String = row.get(7)?;
	Ok(Note {
		id: row.get(0)?,
		name: row.get(1)?,
		content: row.get(2)?,
		rich_content: serde_json::from_str(&rich_raw)
			.unwrap_or_else(|_| serde_json::Value::Array(Vec::new())),
		preferred_editor_mode: row.get(4)?,
		parent_id: row.get(5)?,
		sort_order: row.get(6)?,
		tags: serde_json::from_str(&tags_raw).unwrap_or_default(),
		created_at: row.get(8)?,
		modified_at: row.get(9)?,
	})
}

fn row_to_folder(row: &rusqlite::Row<'_>) -> rusqlite::Result<Folder> {
	let is_open: i64 = row.get(4)?;
	Ok(Folder {
		id: row.get(0)?,
		name: row.get(1)?,
		parent_id: row.get(2)?,
		sort_order: row.get(3)?,
		is_open: is_open != 0,
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	fn note(id: &str, parent: Option<&str>) -> Note {
		Note {
			id: id.to_string(),
			name: format!("{id}.md"),
			content: "hello".to_string(),
			rich_content: serde_json::json!([{ "type": "paragraph" }]),
			preferred_editor_mode: "block".to_string(),
			parent_id: parent.map(|p| p.to_string()),
			sort_order: 0,
			tags: vec!["a".to_string()],
			created_at: 1,
			modified_at: 1,
		}
	}

	fn folder(id: &str, parent: Option<&str>) -> Folder {
		Folder {
			id: id.to_string(),
			name: id.to_string(),
			parent_id: parent.map(|p| p.to_string()),
			sort_order: 0,
			is_open: true,
		}
	}

	#[test]
	fn note_roundtrips_with_json_and_tags() {
		let store = Storage::open(Path::new(":memory:")).unwrap();
		store.upsert_note(&note("n1", None)).unwrap();
		let got = store.get_note("n1").unwrap().unwrap();
		assert_eq!(got.name, "n1.md");
		assert_eq!(got.tags, vec!["a".to_string()]);
		assert_eq!(got.rich_content[0]["type"], "paragraph");
	}

	#[test]
	fn upsert_updates_in_place() {
		let store = Storage::open(Path::new(":memory:")).unwrap();
		store.upsert_note(&note("n1", None)).unwrap();
		let mut edited = note("n1", None);
		edited.content = "edited".to_string();
		store.upsert_note(&edited).unwrap();
		assert_eq!(store.list_notes().unwrap().len(), 1);
		assert_eq!(store.get_note("n1").unwrap().unwrap().content, "edited");
	}

	#[test]
	fn deleting_folder_cascades_to_subtree_and_notes() {
		let store = Storage::open(Path::new(":memory:")).unwrap();
		store.upsert_folder(&folder("root", None)).unwrap();
		store.upsert_folder(&folder("child", Some("root"))).unwrap();
		store.upsert_note(&note("n1", Some("child"))).unwrap();
		store.upsert_note(&note("n2", None)).unwrap();

		store.delete_folder("root").unwrap();

		assert!(store.list_folders().unwrap().is_empty());
		let notes = store.list_notes().unwrap();
		assert_eq!(notes.len(), 1);
		assert_eq!(notes[0].id, "n2");
	}
}
