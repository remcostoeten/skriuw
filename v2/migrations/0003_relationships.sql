CREATE TABLE IF NOT EXISTS workspace_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS workspace_people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    initials TEXT,
    color TEXT,
    note TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS document_references (
    source_note_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('tag', 'person', 'note')),
    target_id TEXT NOT NULL,
    PRIMARY KEY (source_note_id, kind, target_id)
) STRICT;

CREATE INDEX IF NOT EXISTS document_references_target ON document_references(kind, target_id, source_note_id);
