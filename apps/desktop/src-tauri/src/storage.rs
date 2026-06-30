use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

/// A note row, serialized to match the TypeScript `NoteFile` contract
/// (`src/domain/notes/models.ts`). `richContent`, `tags`, and `properties` are stored as JSON
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
    pub properties: serde_json::Value,
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

/// One soft-deleted note or folder, persisted on disk under `.skriuw/trash/`.
/// `batch_id` groups a folder-delete cascade (the folder + its subfolders + the
/// notes it held) so the Trash UI restores/purges it as one unit. It mirrors the
/// web backend's batch id scheme: `note:<id>` for a standalone note, or
/// `folder:<rootId>` for a folder cascade.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashRecord {
    pub batch_id: String,
    pub kind: String,
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub sort_order: i64,
    pub deleted_at: i64,
}

/// A journal entry row, matching the TypeScript `JournalEntry` contract
/// (`src/domain/journal/models.ts`). `tags` is stored as JSON TEXT but crosses
/// IPC as a real array; the two timestamps cross as epoch-millis numbers and
/// `mood` as a string or null. Journal lives only in the SQLite index + a
/// markdown mirror in the vault — it has no folder/link/FTS machinery.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub id: String,
    pub date_key: String,
    #[serde(default)]
    pub title: Option<String>,
    pub content: String,
    pub tags: Vec<String>,
    pub mood: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// A journal tag row, matching the TypeScript `JournalTag` contract. `usage_count`
/// is persisted but recomputed from entries/notes by `deriveWorkspaceTags` on the
/// TS side, so its stored value is advisory only.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalTag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub usage_count: i64,
}

/// A person row, serialized to match the TypeScript `Person` contract
/// (`src/domain/people/models.ts`). `color` is a nullable property-colour key.
/// Names are unique so a `$mention` or property pick always resolves to one
/// durable record (the desktop analogue of the cloud `@@unique([userId, name])`).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

/// An immutable snapshot of a note captured for history, matching the
/// TypeScript `NoteVersion` contract (`src/domain/notes/models.ts`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteVersion {
    pub id: String,
    pub note_id: String,
    pub name: String,
    pub content: String,
    pub rich_content: serde_json::Value,
    pub preferred_editor_mode: String,
    pub parent_id: Option<String>,
    pub tags: Vec<String>,
    pub properties: serde_json::Value,
    pub reason: String,
    pub content_hash: String,
    pub created_at: i64,
}

/// The fields of a note worth versioning — everything in `NoteVersion` except
/// the row's own identity (`id`, `reason`, `contentHash`, `createdAt`), which
/// `insert_note_version` derives.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteVersionSnapshot {
    pub name: String,
    pub content: String,
    pub rich_content: serde_json::Value,
    pub preferred_editor_mode: String,
    pub parent_id: Option<String>,
    pub tags: Vec<String>,
    pub properties: serde_json::Value,
}

impl From<&Note> for NoteVersionSnapshot {
    fn from(note: &Note) -> Self {
        NoteVersionSnapshot {
            name: note.name.clone(),
            content: note.content.clone(),
            rich_content: note.rich_content.clone(),
            preferred_editor_mode: note.preferred_editor_mode.clone(),
            parent_id: note.parent_id.clone(),
            tags: note.tags.clone(),
            properties: note.properties.clone(),
        }
    }
}

/// One full-text search hit: the note id/name plus a highlighted content
/// snippet (FTS5 `snippet()` output, `[match]` markers, `…` ellipsis).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub name: String,
    pub snippet: String,
}

/// One outgoing link extracted from a note's content by the TS `extractNoteLinks`
/// helper. The regex stays in TS (single source of truth); Rust only persists the
/// pre-extracted rows. Exactly one of `target_note_id` (markdown `note://id`
/// links) or `target_title_key` (normalized `[[wiki]]` title) is set per row.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLinkInput {
    pub kind: String,
    pub raw: String,
    pub target_label: String,
    pub alias: Option<String>,
    pub target_note_id: Option<String>,
    pub target_title_key: Option<String>,
}

/// Candidate backlink sources for a target note, plus the ambiguity verdict for
/// each of the target's title keys. The TS side does the final mapping to
/// `ResolvedNoteLink[]` so the output is byte-identical to `buildNoteBacklinks`:
/// a title-key match only counts when that key resolves to a single note.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkSources {
    pub sources: Vec<BacklinkSource>,
    pub ambiguous_title_keys: Vec<String>,
}

/// One candidate source note that links to the target, with the link row's
/// shape so TS can rebuild a `NoteLink` without re-reading the source content.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkSource {
    pub note: Note,
    pub kind: String,
    pub raw: String,
    pub target_label: String,
    pub alias: Option<String>,
    pub matched_note_id: bool,
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
	properties            TEXT NOT NULL DEFAULT '[]',
	created_at            INTEGER NOT NULL,
	modified_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

-- Outgoing links per note, so backlink resolution becomes an indexed lookup
-- instead of an O(n) scan that regex-parses every note on each open. One row per
-- extracted link; `target_note_id` is set for markdown `note://id` links and
-- `target_title_key` (the normalized `[[wiki]]` title) for wiki links. Rows are
-- owned by their source note and cascade-deleted with it.
CREATE TABLE IF NOT EXISTS note_links (
	source_note_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
	kind             TEXT NOT NULL,
	raw              TEXT NOT NULL,
	target_label     TEXT NOT NULL,
	alias            TEXT,
	target_note_id   TEXT,
	target_title_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_note_links_target_id ON note_links(target_note_id);
CREATE INDEX IF NOT EXISTS idx_note_links_target_title ON note_links(target_title_key);
CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_note_id);

-- Normalized title keys per note, mirroring the TS title index: each note
-- contributes its file-name key and its heading-title key (both computed in TS
-- so the same regex stays the single source of truth). Backlink resolution uses
-- this to decide whether a `[[wiki]]` title is unique (resolved) or shared
-- (ambiguous → not a backlink), matching `buildNoteBacklinks` exactly.
CREATE TABLE IF NOT EXISTS note_titles (
	note_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
	title_key TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_note_titles_key ON note_titles(title_key);
CREATE INDEX IF NOT EXISTS idx_note_titles_note ON note_titles(note_id);

-- Full-text index over note name + content. External-content table backed by
-- `notes` (content_rowid = the notes table's implicit integer rowid), so the
-- index stores only the inverted terms, not a second copy of the bodies. Kept
-- in sync by the triggers below — including the UPDATE branch that the upsert's
-- ON CONFLICT path takes — so search never goes stale.
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
	name,
	content,
	content='notes',
	content_rowid='rowid',
	tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS notes_fts_ai AFTER INSERT ON notes BEGIN
	INSERT INTO notes_fts(rowid, name, content)
	VALUES (new.rowid, new.name, new.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_ad AFTER DELETE ON notes BEGIN
	INSERT INTO notes_fts(notes_fts, rowid, name, content)
	VALUES ('delete', old.rowid, old.name, old.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_au AFTER UPDATE ON notes BEGIN
	INSERT INTO notes_fts(notes_fts, rowid, name, content)
	VALUES ('delete', old.rowid, old.name, old.content);
	INSERT INTO notes_fts(rowid, name, content)
	VALUES (new.rowid, new.name, new.content);
END;

-- Journal entries + tags. Account-only on the web (Prisma); on desktop they are
-- a local-first feature whose source of truth is markdown in the vault, with
-- these tables as the queried index (rebuilt from the vault on launch).
CREATE TABLE IF NOT EXISTS journal_entries (
	id          TEXT PRIMARY KEY,
	date_key    TEXT NOT NULL,
	title       TEXT,
	content     TEXT NOT NULL DEFAULT '',
	mood        TEXT,
	tags        TEXT NOT NULL DEFAULT '[]',
	created_at  INTEGER NOT NULL,
	updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date_key);

CREATE TABLE IF NOT EXISTS journal_tags (
	id          TEXT PRIMARY KEY,
	name        TEXT NOT NULL,
	color       TEXT NOT NULL,
	usage_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS people (
	id    TEXT PRIMARY KEY,
	name  TEXT NOT NULL UNIQUE,
	color TEXT
);

-- Version history snapshots, one row per captured checkpoint. Capture/dedupe
-- rules live in versioning.rs (mirrors the web `note_versions` Postgres table
-- and its versioning.ts rules); this table is local-only, never synced.
CREATE TABLE IF NOT EXISTS note_versions (
	id                    TEXT PRIMARY KEY,
	note_id               TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
	name                  TEXT NOT NULL,
	content               TEXT NOT NULL DEFAULT '',
	rich_content          TEXT NOT NULL DEFAULT '[]',
	preferred_editor_mode TEXT NOT NULL DEFAULT 'block',
	parent_id             TEXT,
	tags                  TEXT NOT NULL DEFAULT '[]',
	properties            TEXT NOT NULL DEFAULT '[]',
	reason                TEXT NOT NULL,
	content_hash          TEXT NOT NULL,
	created_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_note_versions_note ON note_versions(note_id, created_at DESC);
"#;

impl Storage {
    /// Opens (creating if missing) the SQLite database at `path`, enables WAL +
    /// foreign keys, and applies the schema.
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Self::open_connection(path)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn open_connection(path: &Path) -> rusqlite::Result<Connection> {
        let conn = Connection::open(path)?;
        // WAL = concurrent reads while writing; synchronous=NORMAL is the safe,
        // faster companion to WAL (durable across app crashes, only at risk on OS
        // crash, acceptable for a local notes store). busy_timeout avoids spurious
        // SQLITE_BUSY if a read overlaps the checkpoint.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch(SCHEMA)?;
        ensure_column(&conn, "notes", "properties", "TEXT NOT NULL DEFAULT '[]'")?;
        ensure_column(&conn, "journal_entries", "title", "TEXT")?;
        // Repopulate the FTS index from the content table. Cheap for a local
        // workspace and idempotent — covers a DB created before the FTS table
        // existed (no-op once the triggers have kept it current).
        conn.execute_batch("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild');")?;
        Ok(conn)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("storage mutex poisoned")
    }

    /// Reopens the storage file in place. Used after snapshot/reset flows replace
    /// the database on disk so the long-lived Tauri state does not keep talking to
    /// an unlinked SQLite handle.
    pub fn reload(&self, path: &Path) -> rusqlite::Result<()> {
        let conn = Self::open_connection(path)?;
        let mut guard = self.lock();
        *guard = conn;
        Ok(())
    }

    pub fn list_notes(&self) -> rusqlite::Result<Vec<Note>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id, name, content, rich_content, preferred_editor_mode, \
			 parent_id, sort_order, tags, properties, created_at, modified_at FROM notes",
        )?;
        let rows = stmt.query_map([], row_to_note)?;
        rows.collect()
    }

    pub fn get_note(&self, id: &str) -> rusqlite::Result<Option<Note>> {
        let conn = self.lock();
        let mut stmt = conn.prepare_cached(
            "SELECT id, name, content, rich_content, preferred_editor_mode, \
			 parent_id, sort_order, tags, properties, created_at, modified_at FROM notes WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], row_to_note)?;
        match rows.next() {
            Some(note) => Ok(Some(note?)),
            None => Ok(None),
        }
    }

    pub fn upsert_note(&self, note: &Note) -> rusqlite::Result<()> {
        let conn = self.lock();
        upsert_note_with(&conn, note)
    }

    /// Batch-upsert notes inside one transaction — used by bulk paths (seeding,
    /// import). One fsync for the whole batch instead of one per note.
    pub fn upsert_notes(&self, notes: &[Note]) -> rusqlite::Result<()> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        for note in notes {
            upsert_note_with(&tx, note)?;
        }
        tx.commit()
    }

    /// Full-text search over note name + content, ranked by FTS5 relevance.
    pub fn search_notes(&self, query: &str, limit: i64) -> rusqlite::Result<Vec<SearchHit>> {
        let match_expr = match build_fts_match(query) {
            Some(expr) => expr,
            None => return Ok(Vec::new()),
        };
        let conn = self.lock();
        let mut stmt = conn.prepare_cached(
            "SELECT n.id, n.name, snippet(notes_fts, 1, '[', ']', '…', 12) \
			 FROM notes_fts JOIN notes n ON n.rowid = notes_fts.rowid \
			 WHERE notes_fts MATCH ?1 ORDER BY rank LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![match_expr, limit], |row| {
            Ok(SearchHit {
                id: row.get(0)?,
                name: row.get(1)?,
                snippet: row.get(2)?,
            })
        })?;
        rows.collect()
    }

    pub fn delete_note(&self, id: &str) -> rusqlite::Result<()> {
        self.lock()
            .execute("DELETE FROM notes WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Replaces a note's outgoing link rows and its title keys in one transaction
    /// (delete-then-insert), keeping both indexes in lockstep with the note's
    /// content on each create/update. `title_keys` are the note's normalized
    /// name + heading keys, computed in TS.
    pub fn replace_note_links(
        &self,
        source_note_id: &str,
        links: &[NoteLinkInput],
        title_keys: &[String],
    ) -> rusqlite::Result<()> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        replace_note_links_with(&tx, source_note_id, links, title_keys)?;
        tx.commit()
    }

    /// True once the link index has been populated for the workspace. Checks
    /// `note_titles` (written for every note, even link-free ones) rather than
    /// `note_links` so a workspace with notes but no links still counts as
    /// indexed. The TS side uses this to fall back to the legacy JS scan and run
    /// a one-time backfill for a workspace whose notes predate the index.
    pub fn has_indexed_links(&self) -> rusqlite::Result<bool> {
        let conn = self.lock();
        let titles: i64 =
            conn.query_row("SELECT COUNT(*) FROM note_titles", [], |row| row.get(0))?;
        if titles > 0 {
            return Ok(true);
        }
        let notes: i64 = conn.query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))?;
        Ok(notes == 0)
    }

    /// Returns the candidate source notes that link to `target_id` — matched by an
    /// explicit `note://id` link OR a `[[wiki]]` title key the target owns — plus
    /// which of those title keys are ambiguous (shared by more than one note).
    /// TS turns this into the final `ResolvedNoteLink[]`.
    pub fn get_backlink_sources(
        &self,
        target_id: &str,
        title_keys: &[String],
    ) -> rusqlite::Result<BacklinkSources> {
        let conn = self.lock();

        let mut ambiguous_title_keys = Vec::new();
        {
            let mut count_stmt = conn.prepare_cached(
                "SELECT COUNT(DISTINCT note_id) FROM note_titles WHERE title_key = ?1",
            )?;
            for key in title_keys {
                if key.is_empty() {
                    continue;
                }
                let count: i64 = count_stmt.query_row(params![key], |row| row.get(0))?;
                if count > 1 {
                    ambiguous_title_keys.push(key.clone());
                }
            }
        }

        let resolvable_keys: Vec<&String> = title_keys
            .iter()
            .filter(|key| !key.is_empty() && !ambiguous_title_keys.contains(key))
            .collect();

        let key_set: std::collections::HashSet<&str> =
            resolvable_keys.iter().map(|k| k.as_str()).collect();

        let mut stmt = conn.prepare(
            "SELECT DISTINCT l.kind, l.raw, l.target_label, l.alias, l.target_note_id, \
			   l.target_title_key, \
			   n.id, n.name, n.content, n.rich_content, n.preferred_editor_mode, \
			   n.parent_id, n.sort_order, n.tags, n.properties, n.created_at, n.modified_at \
			 FROM note_links l JOIN notes n ON n.id = l.source_note_id \
			 WHERE l.source_note_id != ?1 \
			   AND (l.target_note_id = ?1 OR l.target_title_key IS NOT NULL)",
        )?;

        let mut rows = stmt.query(params![target_id])?;
        let mut seen_sources: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut sources = Vec::new();

        while let Some(row) = rows.next()? {
            let target_note_id: Option<String> = row.get(4)?;
            let target_title_key: Option<String> = row.get(5)?;

            let matched_note_id = target_note_id.as_deref() == Some(target_id);
            let matched_title = match &target_title_key {
                Some(key) => key_set.contains(key.as_str()),
                None => false,
            };
            if !matched_note_id && !matched_title {
                continue;
            }

            let note = row_to_note_offset(row, 6)?;
            if !seen_sources.insert(note.id.clone()) {
                continue;
            }

            sources.push(BacklinkSource {
                kind: row.get(0)?,
                raw: row.get(1)?,
                target_label: row.get(2)?,
                alias: row.get(3)?,
                matched_note_id,
                note,
            });
        }

        Ok(BacklinkSources {
            sources,
            ambiguous_title_keys,
        })
    }

    pub fn list_folders(&self) -> rusqlite::Result<Vec<Folder>> {
        let conn = self.lock();
        let mut stmt =
            conn.prepare("SELECT id, name, parent_id, sort_order, is_open FROM folders")?;
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

    pub fn list_journal_entries(&self) -> rusqlite::Result<Vec<JournalEntry>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id, date_key, title, content, mood, tags, created_at, updated_at \
			 FROM journal_entries ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map([], row_to_journal_entry)?;
        rows.collect()
    }

    pub fn upsert_journal_entry(&self, entry: &JournalEntry) -> rusqlite::Result<()> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO journal_entries \
			 (id, date_key, title, content, mood, tags, created_at, updated_at) \
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
			 ON CONFLICT(id) DO UPDATE SET \
			  date_key = excluded.date_key, title = excluded.title, \
			  content = excluded.content, \
			  mood = excluded.mood, tags = excluded.tags, \
			  updated_at = excluded.updated_at",
            params![
                entry.id,
                entry.date_key,
                entry.title,
                entry.content,
                entry.mood,
                serde_json::Value::from(entry.tags.clone()).to_string(),
                entry.created_at,
                entry.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_journal_entry(&self, id: &str) -> rusqlite::Result<()> {
        self.lock()
            .execute("DELETE FROM journal_entries WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn list_journal_tags(&self) -> rusqlite::Result<Vec<JournalTag>> {
        let conn = self.lock();
        let mut stmt = conn
            .prepare("SELECT id, name, color, usage_count FROM journal_tags ORDER BY name ASC")?;
        let rows = stmt.query_map([], row_to_journal_tag)?;
        rows.collect()
    }

    pub fn upsert_journal_tag(&self, tag: &JournalTag) -> rusqlite::Result<()> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO journal_tags (id, name, color, usage_count) \
			 VALUES (?1, ?2, ?3, ?4) \
			 ON CONFLICT(id) DO UPDATE SET \
			  name = excluded.name, color = excluded.color, \
			  usage_count = excluded.usage_count",
            params![tag.id, tag.name, tag.color, tag.usage_count],
        )?;
        Ok(())
    }

    pub fn delete_journal_tag(&self, id: &str) -> rusqlite::Result<()> {
        self.lock()
            .execute("DELETE FROM journal_tags WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn list_people(&self) -> rusqlite::Result<Vec<Person>> {
        let conn = self.lock();
        let mut stmt = conn.prepare("SELECT id, name, color FROM people ORDER BY name ASC")?;
        let rows = stmt.query_map([], row_to_person)?;
        rows.collect()
    }

    /// Reuse-by-name: creating a person whose name already exists returns the
    /// stored row untouched (id and colour preserved), so the same `$mention`
    /// or property pick always resolves to one durable record.
    pub fn create_person(
        &self,
        id: &str,
        name: &str,
        color: Option<&str>,
    ) -> rusqlite::Result<Person> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO people (id, name, color) VALUES (?1, ?2, ?3) \
			 ON CONFLICT(name) DO NOTHING",
            params![id, name, color],
        )?;
        conn.query_row(
            "SELECT id, name, color FROM people WHERE name = ?1",
            params![name],
            row_to_person,
        )
    }

    fn latest_note_version_lean(
        &self,
        note_id: &str,
    ) -> rusqlite::Result<Option<crate::versioning::LatestVersionLean>> {
        let conn = self.lock();
        let mut stmt = conn.prepare_cached(
            "SELECT content_hash, created_at, content FROM note_versions \
				 WHERE note_id = ?1 ORDER BY created_at DESC LIMIT 1",
        )?;
        let mut rows = stmt.query_map(params![note_id], |row| {
            Ok(crate::versioning::LatestVersionLean {
                content_hash: row.get(0)?,
                created_at: row.get(1)?,
                content: row.get(2)?,
            })
        })?;
        match rows.next() {
            Some(latest) => Ok(Some(latest?)),
            None => Ok(None),
        }
    }

    /// Applies the should-persist dedupe/throttle check against the note's
    /// latest version, then inserts and prunes if it passes. Returns the new
    /// row's id, or `None` if the snapshot wasn't worth persisting.
    pub fn insert_note_version(
        &self,
        note_id: &str,
        snapshot: &NoteVersionSnapshot,
        reason: &str,
        created_at: i64,
    ) -> rusqlite::Result<Option<String>> {
        let latest = self.latest_note_version_lean(note_id)?;
        if !crate::versioning::should_persist(snapshot, reason, created_at, latest.as_ref()) {
            return Ok(None);
        }

        let id = uuid::Uuid::new_v4().to_string();
        let hash = crate::versioning::content_hash(snapshot);
        self.lock().execute(
            "INSERT INTO note_versions \
				 (id, note_id, name, content, rich_content, preferred_editor_mode, \
				  parent_id, tags, properties, reason, content_hash, created_at) \
				 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                id,
                note_id,
                snapshot.name,
                snapshot.content,
                snapshot.rich_content.to_string(),
                snapshot.preferred_editor_mode,
                snapshot.parent_id,
                serde_json::Value::from(snapshot.tags.clone()).to_string(),
                snapshot.properties.to_string(),
                reason,
                hash,
                created_at,
            ],
        )?;

        self.prune_note_versions(note_id)?;
        Ok(Some(id))
    }

    /// Overwrites an existing version row in place (same-session checkpoint
    /// reuse, mirroring web's `updateExistingNoteVersion`), unless the content
    /// hash is unchanged. Returns whether a row was actually updated.
    pub fn update_existing_note_version(
        &self,
        version_id: &str,
        note_id: &str,
        snapshot: &NoteVersionSnapshot,
    ) -> rusqlite::Result<bool> {
        let hash = crate::versioning::content_hash(snapshot);
        let changed = self.lock().execute(
            "UPDATE note_versions SET name = ?, content = ?, rich_content = ?, \
				 preferred_editor_mode = ?, parent_id = ?, tags = ?, properties = ?, content_hash = ? \
				 WHERE id = ? AND note_id = ? AND content_hash != ?",
            params![
                snapshot.name,
                snapshot.content,
                snapshot.rich_content.to_string(),
                snapshot.preferred_editor_mode,
                snapshot.parent_id,
                serde_json::Value::from(snapshot.tags.clone()).to_string(),
                snapshot.properties.to_string(),
                hash,
                version_id,
                note_id,
                hash,
            ],
        )?;
        Ok(changed > 0)
    }

    /// Drops everything but the most recent `RETENTION_LIMIT` versions for a
    /// note, so full-content snapshots cannot grow unbounded.
    fn prune_note_versions(&self, note_id: &str) -> rusqlite::Result<()> {
        self.lock().execute(
            "DELETE FROM note_versions WHERE note_id = ?1 AND id NOT IN (\
					SELECT id FROM note_versions WHERE note_id = ?1 \
					ORDER BY created_at DESC LIMIT ?2\
				 )",
            params![note_id, crate::versioning::RETENTION_LIMIT],
        )?;
        Ok(())
    }

    pub fn list_note_versions(&self, note_id: &str, limit: i64) -> rusqlite::Result<Vec<NoteVersion>> {
        let conn = self.lock();
        let mut stmt = conn.prepare_cached(
            "SELECT id, note_id, name, content, rich_content, preferred_editor_mode, \
				 parent_id, tags, properties, reason, content_hash, created_at \
				 FROM note_versions WHERE note_id = ?1 ORDER BY created_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![note_id, limit], row_to_note_version)?;
        rows.collect()
    }

    pub fn get_note_version(&self, version_id: &str) -> rusqlite::Result<Option<NoteVersion>> {
        let conn = self.lock();
        let mut stmt = conn.prepare_cached(
            "SELECT id, note_id, name, content, rich_content, preferred_editor_mode, \
				 parent_id, tags, properties, reason, content_hash, created_at \
				 FROM note_versions WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![version_id], row_to_note_version)?;
        match rows.next() {
            Some(version) => Ok(Some(version?)),
            None => Ok(None),
        }
    }
}

fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for existing in columns {
        if existing? == column {
            return Ok(());
        }
    }
    conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
        [],
    )?;
    Ok(())
}

/// Shared upsert body. Takes `&Connection` so both the single-note path and the
/// batched transaction path reuse the exact same SQL (deref coercion lets the
/// MutexGuard and the Transaction both pass as `&Connection`).
fn upsert_note_with(conn: &Connection, note: &Note) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare_cached(
        "INSERT INTO notes \
		 (id, name, content, rich_content, preferred_editor_mode, parent_id, \
		  sort_order, tags, properties, created_at, modified_at) \
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) \
		 ON CONFLICT(id) DO UPDATE SET \
		  name = excluded.name, content = excluded.content, \
		  rich_content = excluded.rich_content, \
		  preferred_editor_mode = excluded.preferred_editor_mode, \
		  parent_id = excluded.parent_id, sort_order = excluded.sort_order, \
		  tags = excluded.tags, properties = excluded.properties, \
		  modified_at = excluded.modified_at",
    )?;
    stmt.execute(params![
        note.id,
        note.name,
        note.content,
        note.rich_content.to_string(),
        note.preferred_editor_mode,
        note.parent_id,
        note.sort_order,
        serde_json::Value::from(note.tags.clone()).to_string(),
        note.properties.to_string(),
        note.created_at,
        note.modified_at,
    ])?;
    Ok(())
}

/// Shared body for replacing a note's link + title rows. Takes `&Connection` so
/// it works against both a `Transaction` (the live path) and a plain connection.
fn replace_note_links_with(
    conn: &Connection,
    source_note_id: &str,
    links: &[NoteLinkInput],
    title_keys: &[String],
) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM note_links WHERE source_note_id = ?1",
        params![source_note_id],
    )?;
    conn.execute(
        "DELETE FROM note_titles WHERE note_id = ?1",
        params![source_note_id],
    )?;
    {
        let mut stmt = conn.prepare_cached(
            "INSERT INTO note_links \
			 (source_note_id, kind, raw, target_label, alias, target_note_id, target_title_key) \
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )?;
        for link in links {
            stmt.execute(params![
                source_note_id,
                link.kind,
                link.raw,
                link.target_label,
                link.alias,
                link.target_note_id,
                link.target_title_key,
            ])?;
        }
    }
    {
        let mut stmt =
            conn.prepare_cached("INSERT INTO note_titles (note_id, title_key) VALUES (?1, ?2)")?;
        for key in title_keys {
            if key.is_empty() {
                continue;
            }
            stmt.execute(params![source_note_id, key])?;
        }
    }
    Ok(())
}

/// Reads a `Note` from a row whose note columns begin at `base` (used when the
/// note is joined alongside other columns). Column order matches `row_to_note`.
fn row_to_note_offset(row: &rusqlite::Row<'_>, base: usize) -> rusqlite::Result<Note> {
    let rich_raw: String = row.get(base + 3)?;
    let tags_raw: String = row.get(base + 7)?;
    let properties_raw: String = row.get(base + 8)?;
    Ok(Note {
        id: row.get(base)?,
        name: row.get(base + 1)?,
        content: row.get(base + 2)?,
        rich_content: serde_json::from_str(&rich_raw)
            .unwrap_or_else(|_| serde_json::Value::Array(Vec::new())),
        preferred_editor_mode: row.get(base + 4)?,
        parent_id: row.get(base + 5)?,
        sort_order: row.get(base + 6)?,
        tags: serde_json::from_str(&tags_raw).unwrap_or_default(),
        properties: serde_json::from_str(&properties_raw)
            .unwrap_or_else(|_| serde_json::Value::Array(Vec::new())),
        created_at: row.get(base + 9)?,
        modified_at: row.get(base + 10)?,
    })
}

/// Builds a safe FTS5 MATCH expression from raw user input. Each whitespace
/// token is reduced to its alphanumeric characters (dropping FTS5 operators so
/// user punctuation can't trigger a syntax error or injection) and turned into a
/// prefix query; tokens are AND-ed. Returns `None` when nothing usable remains.
fn build_fts_match(query: &str) -> Option<String> {
    let tokens: Vec<String> = query
        .split_whitespace()
        .map(|token| {
            token
                .chars()
                .filter(|c| c.is_alphanumeric())
                .collect::<String>()
        })
        .filter(|token| !token.is_empty())
        .map(|token| format!("{token}*"))
        .collect();
    if tokens.is_empty() {
        None
    } else {
        Some(tokens.join(" "))
    }
}

fn row_to_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    let rich_raw: String = row.get(3)?;
    let tags_raw: String = row.get(7)?;
    let properties_raw: String = row.get(8)?;
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
        properties: serde_json::from_str(&properties_raw)
            .unwrap_or_else(|_| serde_json::Value::Array(Vec::new())),
        created_at: row.get(9)?,
        modified_at: row.get(10)?,
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

fn row_to_journal_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<JournalEntry> {
    let tags_raw: String = row.get(5)?;
    Ok(JournalEntry {
        id: row.get(0)?,
        date_key: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        mood: row.get(4)?,
        tags: serde_json::from_str(&tags_raw).unwrap_or_default(),
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn row_to_journal_tag(row: &rusqlite::Row<'_>) -> rusqlite::Result<JournalTag> {
    Ok(JournalTag {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        usage_count: row.get(3)?,
    })
}

fn row_to_note_version(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteVersion> {
    let rich_raw: String = row.get(4)?;
    let tags_raw: String = row.get(7)?;
    let properties_raw: String = row.get(8)?;
    Ok(NoteVersion {
        id: row.get(0)?,
        note_id: row.get(1)?,
        name: row.get(2)?,
        content: row.get(3)?,
        rich_content: serde_json::from_str(&rich_raw)
            .unwrap_or_else(|_| serde_json::Value::Array(Vec::new())),
        preferred_editor_mode: row.get(5)?,
        parent_id: row.get(6)?,
        tags: serde_json::from_str(&tags_raw).unwrap_or_default(),
        properties: serde_json::from_str(&properties_raw)
            .unwrap_or_else(|_| serde_json::Value::Array(Vec::new())),
        reason: row.get(9)?,
        content_hash: row.get(10)?,
        created_at: row.get(11)?,
    })
}

fn row_to_person(row: &rusqlite::Row<'_>) -> rusqlite::Result<Person> {
    Ok(Person {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
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
            properties: serde_json::json!([]),
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

    fn note_with(id: &str, name: &str, content: &str) -> Note {
        let mut n = note(id, None);
        n.name = name.to_string();
        n.content = content.to_string();
        n
    }

    #[test]
    fn fts_searches_name_and_content_and_stays_in_sync() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store
            .upsert_note(&note_with("n1", "Groceries.md", "buy oat milk and apples"))
            .unwrap();
        store
            .upsert_note(&note_with("n2", "Roadmap.md", "ship the desktop build"))
            .unwrap();

        // content match
        let hits = store.search_notes("milk", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "n1");
        assert!(hits[0].snippet.contains('['));

        // name match + prefix
        assert_eq!(store.search_notes("road", 10).unwrap()[0].id, "n2");

        // edits flow through the UPDATE trigger
        store
            .upsert_note(&note_with("n2", "Roadmap.md", "ship the mobile build"))
            .unwrap();
        assert!(store.search_notes("desktop", 10).unwrap().is_empty());
        assert_eq!(store.search_notes("mobile", 10).unwrap()[0].id, "n2");

        // delete removes from the index
        store.delete_note("n1").unwrap();
        assert!(store.search_notes("milk", 10).unwrap().is_empty());
    }

    #[test]
    fn fts_ignores_punctuation_only_and_empty_queries() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store
            .upsert_note(&note_with("n1", "Note.md", "content"))
            .unwrap();
        assert!(store.search_notes("   ", 10).unwrap().is_empty());
        assert!(store.search_notes("!!! ??? \"", 10).unwrap().is_empty());
    }

    #[test]
    fn batch_upsert_is_indexed() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store
            .upsert_notes(&[
                note_with("n1", "Alpha.md", "first body"),
                note_with("n2", "Beta.md", "second body"),
            ])
            .unwrap();
        assert_eq!(store.list_notes().unwrap().len(), 2);
        assert_eq!(store.search_notes("second", 10).unwrap()[0].id, "n2");
    }

    #[test]
    fn reload_reopens_the_database_path() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("index.db");
        let store = Storage::open(&db_path).unwrap();
        store.upsert_folder(&folder("root", None)).unwrap();
        assert_eq!(store.list_folders().unwrap().len(), 1);

        std::fs::remove_file(&db_path).unwrap();
        store.reload(&db_path).unwrap();

        assert!(store.list_folders().unwrap().is_empty());
        store.upsert_folder(&folder("next", None)).unwrap();
        assert_eq!(store.list_folders().unwrap().len(), 1);
    }

    fn wiki_link(raw: &str, label: &str, key: &str) -> NoteLinkInput {
        NoteLinkInput {
            kind: "wiki".to_string(),
            raw: raw.to_string(),
            target_label: label.to_string(),
            alias: None,
            target_note_id: None,
            target_title_key: Some(key.to_string()),
        }
    }

    fn note_link(raw: &str, label: &str, target_id: &str) -> NoteLinkInput {
        NoteLinkInput {
            kind: "markdown-note-link".to_string(),
            raw: raw.to_string(),
            target_label: label.to_string(),
            alias: None,
            target_note_id: Some(target_id.to_string()),
            target_title_key: None,
        }
    }

    fn ids(sources: &BacklinkSources) -> Vec<String> {
        let mut v: Vec<String> = sources.sources.iter().map(|s| s.note.id.clone()).collect();
        v.sort();
        v
    }

    #[test]
    fn link_rows_persist_and_replace() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store
            .upsert_note(&note_with("n1", "Source.md", "body"))
            .unwrap();
        store
            .replace_note_links(
                "n1",
                &[wiki_link("[[Target]]", "Target", "target")],
                &["source".to_string()],
            )
            .unwrap();
        assert!(store.has_indexed_links().unwrap());

        store
            .replace_note_links(
                "n1",
                &[wiki_link("[[Other]]", "Other", "other")],
                &["source".to_string()],
            )
            .unwrap();
        let got = store
            .get_backlink_sources("t", &["target".to_string()])
            .unwrap();
        assert!(got.sources.is_empty());
        let got = store
            .get_backlink_sources("t", &["other".to_string()])
            .unwrap();
        assert_eq!(ids(&got), vec!["n1".to_string()]);
    }

    #[test]
    fn backlinks_resolve_for_wiki_and_note_links() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store
            .upsert_note(&note_with("active", "Active.md", "body"))
            .unwrap();
        store
            .upsert_note(&note_with("wiki-src", "WikiSrc.md", "[[Active]]"))
            .unwrap();
        store
            .upsert_note(&note_with("md-src", "MdSrc.md", "link"))
            .unwrap();

        store
            .replace_note_links("active", &[], &["active".to_string()])
            .unwrap();
        store
            .replace_note_links(
                "wiki-src",
                &[wiki_link("[[Active]]", "Active", "active")],
                &["wikisrc".to_string()],
            )
            .unwrap();
        store
            .replace_note_links(
                "md-src",
                &[note_link("[link](note://active)", "link", "active")],
                &["mdsrc".to_string()],
            )
            .unwrap();

        let got = store
            .get_backlink_sources("active", &["active".to_string()])
            .unwrap();
        assert_eq!(
            ids(&got),
            vec!["md-src".to_string(), "wiki-src".to_string()]
        );
        assert!(got.ambiguous_title_keys.is_empty());
    }

    #[test]
    fn ambiguous_title_is_not_a_backlink() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store.upsert_note(&note_with("a1", "Dup.md", "")).unwrap();
        store.upsert_note(&note_with("a2", "Dup.md", "")).unwrap();
        store
            .upsert_note(&note_with("src", "Src.md", "[[Dup]]"))
            .unwrap();

        store
            .replace_note_links("a1", &[], &["dup".to_string()])
            .unwrap();
        store
            .replace_note_links("a2", &[], &["dup".to_string()])
            .unwrap();
        store
            .replace_note_links(
                "src",
                &[wiki_link("[[Dup]]", "Dup", "dup")],
                &["src".to_string()],
            )
            .unwrap();

        let got = store
            .get_backlink_sources("a1", &["dup".to_string()])
            .unwrap();
        assert_eq!(got.ambiguous_title_keys, vec!["dup".to_string()]);
        assert!(
            got.sources.is_empty(),
            "an ambiguous title key must not yield a backlink source"
        );
    }

    #[test]
    fn deleting_note_cascades_link_rows_and_drops_backlink() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store
            .upsert_note(&note_with("active", "Active.md", ""))
            .unwrap();
        store
            .upsert_note(&note_with("src", "Src.md", "[[Active]]"))
            .unwrap();
        store
            .replace_note_links("active", &[], &["active".to_string()])
            .unwrap();
        store
            .replace_note_links(
                "src",
                &[wiki_link("[[Active]]", "Active", "active")],
                &["src".to_string()],
            )
            .unwrap();

        assert_eq!(
            ids(&store
                .get_backlink_sources("active", &["active".to_string()])
                .unwrap()),
            vec!["src".to_string()]
        );

        store.delete_note("src").unwrap();
        assert!(store
            .get_backlink_sources("active", &["active".to_string()])
            .unwrap()
            .sources
            .is_empty());
    }

    #[test]
    fn journal_entries_and_tags_roundtrip() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        let entry = JournalEntry {
            id: "j1".to_string(),
            date_key: "2026-06-24".to_string(),
            title: Some("A good day".to_string()),
            content: "a good day".to_string(),
            tags: vec!["work".to_string()],
            mood: Some("good".to_string()),
            created_at: 10,
            updated_at: 10,
        };
        store.upsert_journal_entry(&entry).unwrap();

        let got = store.list_journal_entries().unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].date_key, "2026-06-24");
        assert_eq!(got[0].title.as_deref(), Some("A good day"));
        assert_eq!(got[0].mood.as_deref(), Some("good"));
        assert_eq!(got[0].tags, vec!["work".to_string()]);

        let mut edited = entry;
        edited.content = "an edited day".to_string();
        edited.mood = None;
        edited.updated_at = 20;
        store.upsert_journal_entry(&edited).unwrap();
        let got = store.list_journal_entries().unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].content, "an edited day");
        assert_eq!(got[0].mood, None);

        store
            .upsert_journal_tag(&JournalTag {
                id: "t1".to_string(),
                name: "work".to_string(),
                color: "blue".to_string(),
                usage_count: 0,
            })
            .unwrap();
        assert_eq!(store.list_journal_tags().unwrap().len(), 1);

        store.delete_journal_entry("j1").unwrap();
        assert!(store.list_journal_entries().unwrap().is_empty());
        store.delete_journal_tag("t1").unwrap();
        assert!(store.list_journal_tags().unwrap().is_empty());
    }

    #[test]
    fn editing_content_updates_links() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store.upsert_note(&note_with("a", "A.md", "")).unwrap();
        store.upsert_note(&note_with("b", "B.md", "")).unwrap();
        store
            .upsert_note(&note_with("src", "Src.md", "[[A]]"))
            .unwrap();
        store
            .replace_note_links("a", &[], &["a".to_string()])
            .unwrap();
        store
            .replace_note_links("b", &[], &["b".to_string()])
            .unwrap();
        store
            .replace_note_links("src", &[wiki_link("[[A]]", "A", "a")], &["src".to_string()])
            .unwrap();

        assert_eq!(
            ids(&store.get_backlink_sources("a", &["a".to_string()]).unwrap()),
            vec!["src".to_string()]
        );

        store
            .replace_note_links("src", &[wiki_link("[[B]]", "B", "b")], &["src".to_string()])
            .unwrap();
        assert!(store
            .get_backlink_sources("a", &["a".to_string()])
            .unwrap()
            .sources
            .is_empty());
        assert_eq!(
            ids(&store.get_backlink_sources("b", &["b".to_string()]).unwrap()),
            vec!["src".to_string()]
        );
    }

    fn version_snapshot(content: &str) -> NoteVersionSnapshot {
        NoteVersionSnapshot {
            name: "Note.md".to_string(),
            content: content.to_string(),
            rich_content: serde_json::json!([]),
            preferred_editor_mode: "block".to_string(),
            parent_id: None,
            tags: vec![],
            properties: serde_json::json!([]),
        }
    }

    #[test]
    fn insert_note_version_dedupes_identical_snapshots() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store.upsert_note(&note("n1", None)).unwrap();

        let first = store
            .insert_note_version("n1", &version_snapshot("hello"), "checkpoint", 0)
            .unwrap();
        assert!(first.is_some());

        let dup = store
            .insert_note_version("n1", &version_snapshot("hello"), "checkpoint", 1)
            .unwrap();
        assert!(dup.is_none(), "identical content must not create a second row");

        let changed = store
            .insert_note_version("n1", &version_snapshot("hello world"), "checkpoint", 2)
            .unwrap();
        assert!(changed.is_some());

        assert_eq!(store.list_note_versions("n1", 10).unwrap().len(), 2);
    }

    #[test]
    fn insert_note_version_prunes_beyond_retention_limit() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store.upsert_note(&note("n1", None)).unwrap();

        for i in 0..(crate::versioning::RETENTION_LIMIT + 5) {
            store
                .insert_note_version(
                    "n1",
                    &version_snapshot(&format!("content {i}")),
                    "rename",
                    i,
                )
                .unwrap();
        }

        let versions = store.list_note_versions("n1", 1000).unwrap();
        assert_eq!(versions.len(), crate::versioning::RETENTION_LIMIT as usize);
        // The newest rows survive pruning, not the oldest.
        assert!(versions[0].content.contains(&(crate::versioning::RETENTION_LIMIT + 4).to_string()));
    }

    #[test]
    fn update_existing_note_version_overwrites_in_place() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store.upsert_note(&note("n1", None)).unwrap();
        let id = store
            .insert_note_version("n1", &version_snapshot("hello"), "checkpoint", 0)
            .unwrap()
            .unwrap();

        let changed = store
            .update_existing_note_version(&id, "n1", &version_snapshot("hello there"))
            .unwrap();
        assert!(changed);
        assert_eq!(store.list_note_versions("n1", 10).unwrap().len(), 1);
        assert_eq!(
            store.get_note_version(&id).unwrap().unwrap().content,
            "hello there"
        );

        let unchanged = store
            .update_existing_note_version(&id, "n1", &version_snapshot("hello there"))
            .unwrap();
        assert!(!unchanged, "identical content must report no change");
    }
}
