CREATE TABLE IF NOT EXISTS workspace_nodes (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('note', 'folder')),
    parent_id TEXT REFERENCES workspace_nodes(id),
    rank INTEGER NOT NULL,
    title TEXT NOT NULL,
    icon TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
) STRICT;

CREATE INDEX IF NOT EXISTS workspace_nodes_parent_rank
    ON workspace_nodes(parent_id, rank, id);

CREATE INDEX IF NOT EXISTS workspace_nodes_deleted
    ON workspace_nodes(deleted_at);

CREATE TABLE IF NOT EXISTS documents (
    note_id TEXT PRIMARY KEY REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    document_json TEXT NOT NULL,
    markdown TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    word_count INTEGER NOT NULL CHECK (word_count >= 0)
) STRICT;

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    note_id UNINDEXED,
    title,
    markdown,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS history_cache (
    note_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    version_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    summary TEXT NOT NULL,
    PRIMARY KEY (note_id, version_id)
) STRICT;

CREATE INDEX IF NOT EXISTS history_cache_note_created
    ON history_cache(note_id, created_at DESC);

CREATE TABLE IF NOT EXISTS history_outbox (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    markdown TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    claimed_by TEXT,
    claimed_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    UNIQUE (note_id, revision)
) STRICT;

CREATE INDEX IF NOT EXISTS history_outbox_claim
    ON history_outbox(claimed_at, created_at, id);
