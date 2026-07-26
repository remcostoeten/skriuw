CREATE TABLE provider_import_receipts (
    provider TEXT NOT NULL,
    source_key TEXT NOT NULL,
    source_path TEXT NOT NULL,
    note_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    imported_at INTEGER NOT NULL,
    PRIMARY KEY (provider, source_key, source_path)
) STRICT;

CREATE INDEX provider_import_receipts_note
    ON provider_import_receipts(note_id);
