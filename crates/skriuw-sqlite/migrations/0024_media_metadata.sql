CREATE TABLE IF NOT EXISTS media_metadata (
    content_hash TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    alt TEXT NOT NULL,
    updated_at INTEGER NOT NULL
) STRICT;
