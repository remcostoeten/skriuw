use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
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
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub cover: Option<String>,
    // Serialized Excalidraw scene drawn over the whole note (annotate mode).
    // SQLite-only like a note's `rich_content` — never written to the vault
    // markdown, so it survives reconcile only while the body fields match.
    #[serde(default)]
    pub annotation_scene: String,
    pub created_at: i64,
    pub modified_at: i64,
}

/// A note row without its body columns (`content`, `rich_content`) — what the
/// sidebar/list UI actually consumes. Listing bodies for every note ships
/// megabytes of JSON over IPC per call on a real vault; this keeps the list
/// payload to metadata, mirroring the web backend's metadata-only list query
/// (`listNoteMetadata` in `domain/notes/queries.ts`). The TS side fills
/// `content`/`richContent` with empty values to preserve the `NoteFile` shape.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMetadata {
    pub id: String,
    pub name: String,
    pub preferred_editor_mode: String,
    pub parent_id: Option<String>,
    pub sort_order: i64,
    pub tags: Vec<String>,
    pub properties: serde_json::Value,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub cover: Option<String>,
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
    // Structured BlockNote document, kept so `$person` chips retain their id for
    // graph/people indexing (markdown flattening drops it). Defaults to an empty
    // document for legacy entries written before this field existed.
    #[serde(default = "empty_rich_content")]
    pub rich_content: serde_json::Value,
    pub tags: Vec<String>,
    pub mood: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

fn empty_rich_content() -> serde_json::Value {
    serde_json::Value::Array(Vec::new())
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

/// Local counterpart of the web Task record. Tasks are kept in the desktop
/// SQLite index so the task workspace works without a signed-in account.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub tags: Vec<String>,
    pub assignee_ids: Vec<String>,
    pub description: String,
    pub source_note_id: Option<String>,
    pub source_block_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
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

/// A note-tag colour row, serialized to match the TypeScript `GuestTagMeta`
/// contract (`src/core/workspace-backend/local-store.ts`).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteTagMeta {
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

/// One note's link-index replacement, for the bulk backfill path.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLinkReplacement {
    pub note_id: String,
    pub links: Vec<NoteLinkInput>,
    pub title_keys: Vec<String>,
}

/// Candidate backlink sources for a target note, plus the ambiguity verdict for
/// each of the target's title keys. The TS side does the final mapping to
/// `ResolvedNoteLink[]`. Title-key matches count even when the key is shared by
/// multiple notes (matching web server resolution); `ambiguous_title_keys` is
/// informational.
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

/// One tag with its note membership count, aggregated from `note_links` rows
/// of kind `tag` — mirrors the web's Prisma `listTags` aggregation.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSummaryRow {
    pub name: String,
    pub color: Option<String>,
    pub note_count: i64,
}

/// A note summary for tag/person membership pages (id + name + modified time).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaggedNoteSummaryRow {
    pub id: String,
    pub name: String,
    pub modified_at: i64,
}

/// A `note_links` row narrowed to what the TS graph builder needs.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLinkRow {
    pub source_note_id: String,
    pub target_note_id: Option<String>,
    pub target_label: String,
    pub kind: String,
}

/// Tauri-managed handle around the single SQLite connection. Every command
/// locks the mutex for the duration of its query; SQLite itself serializes
/// writers, and the workspace is single-user/local so contention is trivial.
pub struct Storage {
    conn: Mutex<Connection>,
}

const LINK_INDEX_VERSION: i64 = 2;

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
	icon                  TEXT,
	cover                 TEXT,
	annotation_scene      TEXT NOT NULL DEFAULT '',
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
-- this to report which `[[wiki]]` title keys are shared by multiple notes;
-- shared titles still count as backlinks of every match, like the web server.
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
	id           TEXT PRIMARY KEY,
	date_key     TEXT NOT NULL,
	title        TEXT,
	content      TEXT NOT NULL DEFAULT '',
	rich_content TEXT NOT NULL DEFAULT '[]',
	mood         TEXT,
	tags         TEXT NOT NULL DEFAULT '[]',
	created_at   INTEGER NOT NULL,
	updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date_key);

CREATE TABLE IF NOT EXISTS tasks (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'todo',
	priority TEXT NOT NULL DEFAULT 'medium',
	due_date TEXT,
	tags TEXT NOT NULL DEFAULT '[]',
	assignee_ids TEXT NOT NULL DEFAULT '[]',
	description TEXT NOT NULL DEFAULT '',
	source_note_id TEXT,
	source_block_id TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due_date ON tasks(status, due_date);

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

-- Note-tag metadata (colour only). Tag membership stays derived from note
-- content, mirroring the cloud `note_tags` Postgres table.
CREATE TABLE IF NOT EXISTS note_tags (
	name  TEXT PRIMARY KEY,
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
        ensure_column(&conn, "notes", "icon", "TEXT")?;
        ensure_column(&conn, "notes", "cover", "TEXT")?;
        ensure_column(
            &conn,
            "notes",
            "annotation_scene",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(&conn, "journal_entries", "title", "TEXT")?;
        ensure_column(
            &conn,
            "journal_entries",
            "rich_content",
            "TEXT NOT NULL DEFAULT '[]'",
        )?;
        // Link-index generation, tracked in the SQLite user_version pragma.
        // v2: the index gained `tag`/`person` rows (previously wiki/markdown
        // only), so rows written by older builds are incomplete. Dropping the
        // index makes every note "unindexed" again; the frontend backfill that
        // runs after the launch reconcile rebuilds it with the new row set.
        let link_index_version: i64 =
            conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        if link_index_version < LINK_INDEX_VERSION {
            conn.execute_batch("DELETE FROM note_links; DELETE FROM note_titles;")?;
            conn.pragma_update(None, "user_version", LINK_INDEX_VERSION)?;
        }
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
			 parent_id, sort_order, tags, properties, created_at, modified_at, \
			 icon, cover, annotation_scene FROM notes",
        )?;
        let rows = stmt.query_map([], row_to_note)?;
        rows.collect()
    }

    /// Lists every note WITHOUT its body columns. This is the sidebar/list hot
    /// path; bodies are fetched per note via `get_note`/`get_notes`.
    pub fn list_note_metadata(&self) -> rusqlite::Result<Vec<NoteMetadata>> {
        let conn = self.lock();
        let mut stmt = conn.prepare_cached(
            "SELECT id, name, preferred_editor_mode, parent_id, sort_order, \
			 tags, properties, created_at, modified_at, icon, cover FROM notes",
        )?;
        let rows = stmt.query_map([], row_to_note_metadata)?;
        rows.collect()
    }

    pub fn get_note(&self, id: &str) -> rusqlite::Result<Option<Note>> {
        let conn = self.lock();
        let mut stmt = conn.prepare_cached(
            "SELECT id, name, content, rich_content, preferred_editor_mode, \
			 parent_id, sort_order, tags, properties, created_at, modified_at, \
			 icon, cover, annotation_scene FROM notes WHERE id = ?1",
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
    /// `tags` (from `tag:`/`#` operators) AND-filter on note_links tag rows;
    /// `people` (from `person:`/`$` operators, lowercase name fragments)
    /// AND-filter on note_links person rows joined to the people table. With no
    /// free text the filters run alone, ordered by recency.
    pub fn search_notes(
        &self,
        query: &str,
        tags: &[String],
        people: &[String],
        limit: i64,
    ) -> rusqlite::Result<Vec<SearchHit>> {
        let tag_clause = " AND EXISTS (SELECT 1 FROM note_links l WHERE l.source_note_id = n.id AND l.kind = 'tag' AND l.target_label = ?)";
        let person_clause = " AND EXISTS (SELECT 1 FROM note_links l JOIN people p ON p.id = l.target_label WHERE l.source_note_id = n.id AND l.kind = 'person' AND LOWER(p.name) LIKE ?)";
        let filter_clauses =
            [tag_clause.repeat(tags.len()), person_clause.repeat(people.len())].concat();
        let person_patterns: Vec<String> =
            people.iter().map(|name| format!("%{name}%")).collect();
        let conn = self.lock();

        let (sql, text_param) = match build_fts_match(query) {
            Some(expr) => (
                [
                    "SELECT n.id, n.name, snippet(notes_fts, 1, '[', ']', '\u{2026}', 12) ",
                    "FROM notes_fts JOIN notes n ON n.rowid = notes_fts.rowid ",
                    "WHERE notes_fts MATCH ?",
                    &filter_clauses,
                    " ORDER BY rank LIMIT ?",
                ]
                .concat(),
                Some(expr),
            ),
            None if !tags.is_empty() || !people.is_empty() => (
                [
                    "SELECT n.id, n.name, substr(n.content, 1, 120) ",
                    "FROM notes n WHERE 1=1",
                    &filter_clauses,
                    " ORDER BY n.modified_at DESC LIMIT ?",
                ]
                .concat(),
                None,
            ),
            None => return Ok(Vec::new()),
        };

        let mut stmt = conn.prepare(&sql)?;
        let mut values: Vec<&dyn rusqlite::types::ToSql> = Vec::new();
        if let Some(expr) = &text_param {
            values.push(expr);
        }
        for tag in tags {
            values.push(tag);
        }
        for pattern in &person_patterns {
            values.push(pattern);
        }
        values.push(&limit);
        let rows = stmt.query_map(values.as_slice(), |row| {
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

    /// Notes that have never had their links indexed — no `note_titles` rows
    /// (those are written for every indexed note, even link-free ones). Filled
    /// by the frontend backfill, since link extraction semantics live in TS.
    pub fn list_unindexed_note_ids(&self) -> rusqlite::Result<Vec<String>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id FROM notes WHERE id NOT IN (SELECT DISTINCT note_id FROM note_titles)",
        )?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect()
    }

    /// Replaces the link rows + title keys for many notes in one transaction.
    pub fn replace_note_links_bulk(
        &self,
        entries: &[NoteLinkReplacement],
    ) -> rusqlite::Result<()> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        for entry in entries {
            replace_note_links_with(&tx, &entry.note_id, &entry.links, &entry.title_keys)?;
        }
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

    /// Drops the whole link index (link rows + title keys) so the frontend
    /// backfill rebuilds it from scratch. Used when the extraction semantics
    /// change at runtime — e.g. toggling the "detect #tags in text" preference,
    /// whose effect is baked into the persisted rows at write time.
    pub fn clear_note_links_index(&self) -> rusqlite::Result<()> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM note_links", [])?;
        tx.execute("DELETE FROM note_titles", [])?;
        tx.commit()
    }

    /// Every tag with its distinct-note count, from the persisted `tag` link
    /// rows — plus color-only entries from `note_tags` that no note carries.
    /// Sorted by count desc then name asc, matching the web `listTags` action.
    pub fn list_tag_summaries(&self) -> rusqlite::Result<Vec<TagSummaryRow>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT c.label AS name, t.color AS color, c.cnt AS note_count \
			 FROM (SELECT target_label AS label, COUNT(DISTINCT source_note_id) AS cnt \
			       FROM note_links WHERE kind = 'tag' GROUP BY target_label) c \
			 LEFT JOIN note_tags t ON t.name = c.label \
			 UNION ALL \
			 SELECT t.name, t.color, 0 FROM note_tags t \
			 WHERE t.name NOT IN (SELECT DISTINCT target_label FROM note_links WHERE kind = 'tag') \
			 ORDER BY note_count DESC, name ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(TagSummaryRow {
                name: row.get(0)?,
                color: row.get(1)?,
                note_count: row.get(2)?,
            })
        })?;
        rows.collect()
    }

    /// Notes carrying a link row of `kind` pointing at `label` (a normalized
    /// tag name or a person id), newest-modified first.
    pub fn list_linked_note_summaries(
        &self,
        kind: &str,
        label: &str,
    ) -> rusqlite::Result<Vec<TaggedNoteSummaryRow>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT DISTINCT n.id, n.name, n.modified_at \
			 FROM note_links l JOIN notes n ON n.id = l.source_note_id \
			 WHERE l.kind = ?1 AND l.target_label = ?2 \
			 ORDER BY n.modified_at DESC",
        )?;
        let rows = stmt.query_map(params![kind, label], |row| {
            Ok(TaggedNoteSummaryRow {
                id: row.get(0)?,
                name: row.get(1)?,
                modified_at: row.get(2)?,
            })
        })?;
        rows.collect()
    }

    /// Every persisted link row, narrowed to the fields the TS graph builder
    /// consumes. Replaces shipping all note bodies over IPC for the graph view.
    pub fn list_note_link_rows(&self) -> rusqlite::Result<Vec<NoteLinkRow>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT source_note_id, target_note_id, target_label, kind FROM note_links",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(NoteLinkRow {
                source_note_id: row.get(0)?,
                target_note_id: row.get(1)?,
                target_label: row.get(2)?,
                kind: row.get(3)?,
            })
        })?;
        rows.collect()
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

        // A wiki link whose title is shared by multiple notes counts as a
        // backlink of each of them, matching the web server's note_links
        // resolution — ambiguity surfaces more backlinks rather than hiding
        // them. `ambiguous_title_keys` stays in the payload so the UI can
        // still flag duplicate-title matches if it wants to.
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

        let key_set: std::collections::HashSet<&str> = title_keys
            .iter()
            .filter(|key| !key.is_empty())
            .map(|k| k.as_str())
            .collect();

        let mut stmt = conn.prepare(
            "SELECT DISTINCT l.kind, l.raw, l.target_label, l.alias, l.target_note_id, \
			   l.target_title_key, \
			   n.id, n.name, n.content, n.rich_content, n.preferred_editor_mode, \
			   n.parent_id, n.sort_order, n.tags, n.properties, n.created_at, n.modified_at, \
			   n.icon, n.cover, n.annotation_scene \
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
        upsert_folder_with(&self.lock(), folder)
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
            "SELECT id, date_key, title, content, rich_content, mood, tags, created_at, updated_at \
			 FROM journal_entries ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map([], row_to_journal_entry)?;
        rows.collect()
    }

    pub fn upsert_journal_entry(&self, entry: &JournalEntry) -> rusqlite::Result<()> {
        upsert_journal_entry_with(&self.lock(), entry)
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
        upsert_journal_tag_with(&self.lock(), tag)
    }

    pub fn delete_journal_tag(&self, id: &str) -> rusqlite::Result<()> {
        self.lock()
            .execute("DELETE FROM journal_tags WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn list_tasks(&self) -> rusqlite::Result<Vec<Task>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id, title, status, priority, due_date, tags, assignee_ids, description, source_note_id, source_block_id, created_at, updated_at FROM tasks ORDER BY updated_at DESC",
        )?;
        let tasks = stmt.query_map([], row_to_task)?.collect();
        tasks
    }

    pub fn upsert_task(&self, task: &Task) -> rusqlite::Result<()> {
        self.lock().execute(
            "INSERT INTO tasks (id, title, status, priority, due_date, tags, assignee_ids, description, source_note_id, source_block_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12) ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status, priority=excluded.priority, due_date=excluded.due_date, tags=excluded.tags, assignee_ids=excluded.assignee_ids, description=excluded.description, source_note_id=excluded.source_note_id, source_block_id=excluded.source_block_id, updated_at=excluded.updated_at",
            params![task.id, task.title, task.status, task.priority, task.due_date, serde_json::to_string(&task.tags).unwrap_or_else(|_| "[]".to_string()), serde_json::to_string(&task.assignee_ids).unwrap_or_else(|_| "[]".to_string()), task.description, task.source_note_id, task.source_block_id, task.created_at, task.updated_at],
        )?;
        Ok(())
    }

    pub fn delete_task(&self, id: &str) -> rusqlite::Result<()> {
        self.lock().execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Batched import for desktop pull-sync: every folder/note/journal entry/tag
    /// upsert plus tombstone delete runs in one SQLite transaction, so a crash
    /// mid-import can't leave the local index half-written — it either reflects
    /// the full pulled archive or the prior state. The on-disk vault (markdown
    /// files, written by the caller before/after this call) isn't part of this
    /// transaction; it's the source of truth and can always be resynced into the
    /// index via `reconcile_index`.
    pub fn import_workspace(
        &self,
        folders: &[Folder],
        notes: &[Note],
        journal_entries: &[JournalEntry],
        journal_tags: &[JournalTag],
        deleted_note_ids: &[String],
        deleted_folder_ids: &[String],
        deleted_journal_entry_ids: &[String],
        deleted_journal_tag_ids: &[String],
    ) -> rusqlite::Result<()> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        for folder in folders {
            upsert_folder_with(&tx, folder)?;
        }
        for note in notes {
            upsert_note_with(&tx, note)?;
        }
        for entry in journal_entries {
            upsert_journal_entry_with(&tx, entry)?;
        }
        for tag in journal_tags {
            upsert_journal_tag_with(&tx, tag)?;
        }
        for id in deleted_note_ids {
            tx.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
        }
        for id in deleted_folder_ids {
            tx.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
        }
        for id in deleted_journal_entry_ids {
            tx.execute("DELETE FROM journal_entries WHERE id = ?1", params![id])?;
        }
        for id in deleted_journal_tag_ids {
            tx.execute("DELETE FROM journal_tags WHERE id = ?1", params![id])?;
        }
        tx.commit()
    }

    pub fn list_people(&self) -> rusqlite::Result<Vec<Person>> {
        let conn = self.lock();
        let mut stmt = conn.prepare("SELECT id, name, color FROM people ORDER BY name ASC")?;
        let rows = stmt.query_map([], row_to_person)?;
        rows.collect()
    }

    /// Reuse-by-name (case-insensitive): creating a person whose name already
    /// exists under any casing returns the stored row untouched (id, colour, and
    /// original casing preserved), so `$johndoe` and `$Johndoe` always resolve to
    /// the one durable record instead of spawning a duplicate.
    pub fn create_person(
        &self,
        id: &str,
        name: &str,
        color: Option<&str>,
    ) -> rusqlite::Result<Person> {
        let conn = self.lock();
        if let Some(existing) = conn
            .query_row(
                "SELECT id, name, color FROM people WHERE name = ?1 COLLATE NOCASE",
                params![name],
                row_to_person,
            )
            .optional()?
        {
            return Ok(existing);
        }
        conn.execute(
            "INSERT INTO people (id, name, color) VALUES (?1, ?2, ?3) \
			 ON CONFLICT(name) DO NOTHING",
            params![id, name, color],
        )?;
        conn.query_row(
            "SELECT id, name, color FROM people WHERE name = ?1 COLLATE NOCASE",
            params![name],
            row_to_person,
        )
    }

    pub fn update_person(
        &self,
        id: &str,
        name: Option<&str>,
        color: Option<Option<&str>>,
    ) -> rusqlite::Result<Person> {
        let conn = self.lock();
        if let Some(name) = name {
            conn.execute("UPDATE people SET name = ?2 WHERE id = ?1", params![id, name])?;
        }
        if let Some(color) = color {
            conn.execute("UPDATE people SET color = ?2 WHERE id = ?1", params![id, color])?;
        }
        conn.query_row(
            "SELECT id, name, color FROM people WHERE id = ?1",
            params![id],
            row_to_person,
        )
    }

    pub fn delete_person(&self, id: &str) -> rusqlite::Result<()> {
        let conn = self.lock();
        conn.execute("DELETE FROM people WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn list_note_tag_meta(&self) -> rusqlite::Result<Vec<NoteTagMeta>> {
        let conn = self.lock();
        let mut stmt = conn.prepare("SELECT name, color FROM note_tags ORDER BY name ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(NoteTagMeta {
                name: row.get(0)?,
                color: row.get(1)?,
            })
        })?;
        rows.collect()
    }

    pub fn upsert_note_tag_meta(&self, name: &str, color: Option<&str>) -> rusqlite::Result<()> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO note_tags (name, color) VALUES (?1, ?2) \
			 ON CONFLICT(name) DO UPDATE SET color = excluded.color",
            params![name, color],
        )?;
        Ok(())
    }

    pub fn delete_note_tag_meta(&self, name: &str) -> rusqlite::Result<()> {
        let conn = self.lock();
        conn.execute("DELETE FROM note_tags WHERE name = ?1", params![name])?;
        Ok(())
    }

    /// Moves a tag's colour to a new name (rename/merge). Keeps the target's
    /// existing colour when it already has one.
    pub fn rename_note_tag_meta(&self, from: &str, to: &str) -> rusqlite::Result<()> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO note_tags (name, color) \
			 SELECT ?2, color FROM note_tags WHERE name = ?1 \
			 ON CONFLICT(name) DO NOTHING",
            params![from, to],
        )?;
        conn.execute("DELETE FROM note_tags WHERE name = ?1", params![from])?;
        Ok(())
    }

    fn latest_note_version_lean(
        &self,
        note_id: &str,
    ) -> rusqlite::Result<Option<crate::versioning::LatestVersionLean>> {
        let conn = self.lock();
        let mut stmt = conn.prepare_cached(
            "SELECT id, content_hash, created_at, content, reason FROM note_versions \
				 WHERE note_id = ?1 ORDER BY created_at DESC LIMIT 1",
        )?;
        let mut rows = stmt.query_map(params![note_id], |row| {
            Ok(crate::versioning::LatestVersionLean {
                id: row.get(0)?,
                content_hash: row.get(1)?,
                created_at: row.get(2)?,
                content: row.get(3)?,
                reason: row.get(4)?,
            })
        })?;
        match rows.next() {
            Some(latest) => Ok(Some(latest?)),
            None => Ok(None),
        }
    }

    /// Applies the dedupe/trivial-edit/coalesce decision against the note's
    /// latest version, then inserts (or overwrites the latest row) and prunes.
    /// Returns the persisted row's id, or `None` if the snapshot was skipped.
    pub fn insert_note_version(
        &self,
        note_id: &str,
        snapshot: &NoteVersionSnapshot,
        reason: &str,
        created_at: i64,
    ) -> rusqlite::Result<Option<String>> {
        let latest = self.latest_note_version_lean(note_id)?;
        match crate::versioning::decide(snapshot, reason, created_at, latest.as_ref()) {
            crate::versioning::VersionDecision::Skip => return Ok(None),
            crate::versioning::VersionDecision::Coalesce(version_id) => {
                self.update_existing_note_version(&version_id, note_id, snapshot)?;
                return Ok(Some(version_id));
            }
            crate::versioning::VersionDecision::Insert => {}
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
		  sort_order, tags, properties, created_at, modified_at, icon, cover, \
		  annotation_scene) \
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) \
		 ON CONFLICT(id) DO UPDATE SET \
		  name = excluded.name, content = excluded.content, \
		  rich_content = excluded.rich_content, \
		  preferred_editor_mode = excluded.preferred_editor_mode, \
		  parent_id = excluded.parent_id, sort_order = excluded.sort_order, \
		  tags = excluded.tags, properties = excluded.properties, \
		  modified_at = excluded.modified_at, \
		  icon = excluded.icon, cover = excluded.cover, \
		  annotation_scene = excluded.annotation_scene",
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
        note.icon,
        note.cover,
        note.annotation_scene,
    ])?;
    Ok(())
}

/// Shared upsert body, mirroring `upsert_note_with` so single-write and
/// batched-transaction callers share the exact same SQL.
fn upsert_folder_with(conn: &Connection, folder: &Folder) -> rusqlite::Result<()> {
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

/// Shared upsert body, mirroring `upsert_note_with` so single-write and
/// batched-transaction callers share the exact same SQL.
fn upsert_journal_entry_with(conn: &Connection, entry: &JournalEntry) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO journal_entries \
		 (id, date_key, title, content, rich_content, mood, tags, created_at, updated_at) \
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
		 ON CONFLICT(id) DO UPDATE SET \
		  date_key = excluded.date_key, title = excluded.title, \
		  content = excluded.content, rich_content = excluded.rich_content, \
		  mood = excluded.mood, tags = excluded.tags, \
		  updated_at = excluded.updated_at",
        params![
            entry.id,
            entry.date_key,
            entry.title,
            entry.content,
            entry.rich_content.to_string(),
            entry.mood,
            serde_json::Value::from(entry.tags.clone()).to_string(),
            entry.created_at,
            entry.updated_at,
        ],
    )?;
    Ok(())
}

/// Shared upsert body, mirroring `upsert_note_with` so single-write and
/// batched-transaction callers share the exact same SQL.
fn upsert_journal_tag_with(conn: &Connection, tag: &JournalTag) -> rusqlite::Result<()> {
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
        icon: row.get(base + 11)?,
        cover: row.get(base + 12)?,
        annotation_scene: row.get(base + 13)?,
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
        icon: row.get(11)?,
        cover: row.get(12)?,
        annotation_scene: row.get(13)?,
    })
}

fn row_to_note_metadata(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteMetadata> {
    let tags_raw: String = row.get(5)?;
    let properties_raw: String = row.get(6)?;
    Ok(NoteMetadata {
        id: row.get(0)?,
        name: row.get(1)?,
        preferred_editor_mode: row.get(2)?,
        parent_id: row.get(3)?,
        sort_order: row.get(4)?,
        tags: serde_json::from_str(&tags_raw).unwrap_or_default(),
        properties: serde_json::from_str(&properties_raw)
            .unwrap_or_else(|_| serde_json::Value::Array(Vec::new())),
        created_at: row.get(7)?,
        modified_at: row.get(8)?,
        icon: row.get(9)?,
        cover: row.get(10)?,
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
    let rich_raw: String = row.get(4)?;
    let tags_raw: String = row.get(6)?;
    Ok(JournalEntry {
        id: row.get(0)?,
        date_key: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        rich_content: serde_json::from_str(&rich_raw).unwrap_or_else(|_| empty_rich_content()),
        mood: row.get(5)?,
        tags: serde_json::from_str(&tags_raw).unwrap_or_default(),
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
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

fn row_to_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?, title: row.get(1)?, status: row.get(2)?, priority: row.get(3)?,
        due_date: row.get(4)?, tags: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
        assignee_ids: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
        description: row.get(7)?, source_note_id: row.get(8)?, source_block_id: row.get(9)?,
        created_at: row.get(10)?, updated_at: row.get(11)?,
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
            icon: None,
            cover: None,
            annotation_scene: String::new(),
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
        let hits = store.search_notes("milk", &[], &[], 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "n1");
        assert!(hits[0].snippet.contains('['));

        // name match + prefix
        assert_eq!(store.search_notes("road", &[], &[], 10).unwrap()[0].id, "n2");

        // edits flow through the UPDATE trigger
        store
            .upsert_note(&note_with("n2", "Roadmap.md", "ship the mobile build"))
            .unwrap();
        assert!(store.search_notes("desktop", &[], &[], 10).unwrap().is_empty());
        assert_eq!(store.search_notes("mobile", &[], &[], 10).unwrap()[0].id, "n2");

        // delete removes from the index
        store.delete_note("n1").unwrap();
        assert!(store.search_notes("milk", &[], &[], 10).unwrap().is_empty());
    }

    #[test]
    fn search_filters_by_tag_operator() {
        fn tag_link(tag: &str) -> NoteLinkInput {
            NoteLinkInput {
                kind: "tag".to_string(),
                raw: format!("#{tag}"),
                target_label: tag.to_string(),
                alias: None,
                target_note_id: None,
                target_title_key: None,
            }
        }

        let store = Storage::open(Path::new(":memory:")).unwrap();
        store
            .upsert_note(&note_with("n1", "Groceries.md", "buy oat milk"))
            .unwrap();
        store
            .upsert_note(&note_with("n2", "Recipes.md", "oat pancakes"))
            .unwrap();
        store
            .replace_note_links("n1", &[tag_link("food")], &["groceries".to_string()])
            .unwrap();
        store
            .replace_note_links(
                "n2",
                &[tag_link("food"), tag_link("cooking")],
                &["recipes".to_string()],
            )
            .unwrap();

        // text + tag narrows the FTS hits
        let hits = store
            .search_notes("oat", &["cooking".to_string()], &[], 10)
            .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "n2");

        // tags AND together
        assert!(store
            .search_notes("oat", &["food".to_string(), "missing".to_string()], &[], 10)
            .unwrap()
            .is_empty());

        // tag-only query (no free text) lists matching notes
        let tag_only = store.search_notes("", &["food".to_string()], &[], 10).unwrap();
        assert_eq!(tag_only.len(), 2);

        // person filter joins people by name fragment, case-insensitive
        store.create_person("p1", "Ann Example", None).unwrap();
        store
            .replace_note_links(
                "n1",
                &[
                    tag_link("food"),
                    NoteLinkInput {
                        kind: "person".to_string(),
                        raw: "$Ann Example".to_string(),
                        target_label: "p1".to_string(),
                        alias: None,
                        target_note_id: None,
                        target_title_key: None,
                    },
                ],
                &["groceries".to_string()],
            )
            .unwrap();
        let by_person = store
            .search_notes("", &[], &["ann".to_string()], 10)
            .unwrap();
        assert_eq!(by_person.len(), 1);
        assert_eq!(by_person[0].id, "n1");
        let with_text = store
            .search_notes("oat", &[], &["ann".to_string()], 10)
            .unwrap();
        assert_eq!(with_text.len(), 1);
        assert_eq!(with_text[0].id, "n1");
        assert!(store
            .search_notes("", &[], &["nobody".to_string()], 10)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn fts_ignores_punctuation_only_and_empty_queries() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store
            .upsert_note(&note_with("n1", "Note.md", "content"))
            .unwrap();
        assert!(store.search_notes("   ", &[], &[], 10).unwrap().is_empty());
        assert!(store.search_notes("!!! ??? \"", &[], &[], 10).unwrap().is_empty());
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
        assert_eq!(store.search_notes("second", &[], &[], 10).unwrap()[0].id, "n2");
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

    #[test]
    fn outdated_link_index_is_wiped_on_open() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("index.db");
        {
            let store = Storage::open(&db_path).unwrap();
            store.upsert_note(&note_with("n1", "A.md", "a")).unwrap();
            store
                .replace_note_links("n1", &[tag_link("rust")], &["a".to_string()])
                .unwrap();
            assert!(store.has_indexed_links().unwrap());
        }

        // Simulate a DB written by a build that predates the version bump.
        let conn = Connection::open(&db_path).unwrap();
        conn.pragma_update(None, "user_version", 0).unwrap();
        drop(conn);

        let store = Storage::open(&db_path).unwrap();
        assert!(store.list_note_link_rows().unwrap().is_empty());
        assert_eq!(store.list_unindexed_note_ids().unwrap(), vec!["n1".to_string()]);
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

    fn tag_link(label: &str) -> NoteLinkInput {
        NoteLinkInput {
            kind: "tag".to_string(),
            raw: format!("#{label}"),
            target_label: label.to_string(),
            alias: None,
            target_note_id: None,
            target_title_key: None,
        }
    }

    fn person_link(person_id: &str) -> NoteLinkInput {
        NoteLinkInput {
            kind: "person".to_string(),
            raw: person_id.to_string(),
            target_label: person_id.to_string(),
            alias: None,
            target_note_id: None,
            target_title_key: None,
        }
    }

    #[test]
    fn create_person_reuses_existing_row_case_insensitively() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        let first = store.create_person("p1", "Johndoe", None).unwrap();
        // Different casing + different id must resolve to the same stored person,
        // keeping the original casing rather than creating a duplicate.
        let second = store.create_person("p2", "johndoe", None).unwrap();
        assert_eq!(second.id, "p1");
        assert_eq!(second.name, "Johndoe");
        assert_eq!(store.list_people().unwrap().len(), 1);
        assert_eq!(first.id, second.id);
    }

    #[test]
    fn tag_and_person_rows_aggregate() {
        let store = Storage::open(Path::new(":memory:")).unwrap();
        store.upsert_note(&note_with("n1", "A.md", "a")).unwrap();
        store.upsert_note(&note_with("n2", "B.md", "b")).unwrap();
        store
            .replace_note_links(
                "n1",
                &[tag_link("rust"), tag_link("perf"), person_link("p1")],
                &["a".to_string()],
            )
            .unwrap();
        store
            .replace_note_links("n2", &[tag_link("rust")], &["b".to_string()])
            .unwrap();
        store.upsert_note_tag_meta("rust", Some("#f00")).unwrap();
        store.upsert_note_tag_meta("orphan", Some("#0f0")).unwrap();

        let summaries = store.list_tag_summaries().unwrap();
        let shaped: Vec<(String, Option<String>, i64)> = summaries
            .into_iter()
            .map(|s| (s.name, s.color, s.note_count))
            .collect();
        assert_eq!(
            shaped,
            vec![
                ("rust".to_string(), Some("#f00".to_string()), 2),
                ("perf".to_string(), None, 1),
                ("orphan".to_string(), Some("#0f0".to_string()), 0),
            ]
        );

        let tagged = store.list_linked_note_summaries("tag", "rust").unwrap();
        let mut tagged_ids: Vec<String> = tagged.into_iter().map(|t| t.id).collect();
        tagged_ids.sort();
        assert_eq!(tagged_ids, vec!["n1".to_string(), "n2".to_string()]);

        let mentions = store.list_linked_note_summaries("person", "p1").unwrap();
        assert_eq!(mentions.len(), 1);
        assert_eq!(mentions[0].id, "n1");

        // Tag/person rows never surface as backlinks: no target id or title key.
        let backlinks = store.get_backlink_sources("n2", &["b".to_string()]).unwrap();
        assert!(backlinks.sources.is_empty());

        assert_eq!(store.list_note_link_rows().unwrap().len(), 4);

        store.clear_note_links_index().unwrap();
        assert_eq!(store.list_note_link_rows().unwrap().len(), 0);
        assert_eq!(store.list_unindexed_note_ids().unwrap().len(), 2);
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
    fn ambiguous_title_is_a_backlink_of_every_match() {
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
        assert_eq!(
            ids(&got),
            vec!["src".to_string()],
            "a shared title key still yields a backlink source, like the web server"
        );

        let other = store
            .get_backlink_sources("a2", &["dup".to_string()])
            .unwrap();
        assert_eq!(ids(&other), vec!["src".to_string()]);
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
            rich_content: serde_json::Value::Array(Vec::new()),
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

        let coalesced = store
            .insert_note_version("n1", &version_snapshot("hello wide world"), "checkpoint", 2)
            .unwrap();
        assert_eq!(coalesced, first, "same-burst change must overwrite the latest row");
        assert_eq!(store.list_note_versions("n1", 10).unwrap().len(), 1);

        let after_window = store
            .insert_note_version(
                "n1",
                &version_snapshot("hello brand new world"),
                "checkpoint",
                2 + crate::versioning::COALESCE_WINDOW_MS,
            )
            .unwrap();
        assert!(after_window.is_some());
        assert_ne!(after_window, first);
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
