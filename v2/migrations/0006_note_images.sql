CREATE TABLE IF NOT EXISTS note_images (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    content_hash TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS note_images_note ON note_images(note_id);
CREATE INDEX IF NOT EXISTS note_images_hash ON note_images(content_hash);
