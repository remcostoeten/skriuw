CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
) STRICT;

CREATE TABLE workspace_nodes (
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

CREATE INDEX workspace_nodes_parent_rank
    ON workspace_nodes(parent_id, rank, id);

CREATE INDEX workspace_nodes_deleted
    ON workspace_nodes(deleted_at);

CREATE TABLE documents (
    note_id TEXT PRIMARY KEY REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    document_json TEXT NOT NULL,
    markdown TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    word_count INTEGER NOT NULL CHECK (word_count >= 0)
) STRICT;

CREATE VIRTUAL TABLE documents_fts USING fts5(
    note_id UNINDEXED,
    title,
    markdown,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE app_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
) STRICT;

CREATE TABLE history_cache (
    note_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    commit_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    summary TEXT NOT NULL,
    PRIMARY KEY (note_id, commit_id)
) STRICT;

CREATE INDEX history_cache_note_created
    ON history_cache(note_id, created_at DESC);

CREATE TABLE git_outbox (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    markdown TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (note_id, revision)
) STRICT;

CREATE INDEX git_outbox_created
    ON git_outbox(created_at, id);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (1, 'initial', 10);

PRAGMA user_version = 1;
