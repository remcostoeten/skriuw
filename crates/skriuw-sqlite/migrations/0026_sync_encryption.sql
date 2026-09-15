CREATE TABLE sync_encryption (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    key_id TEXT NOT NULL,
    scheme TEXT NOT NULL,
    key_material BLOB NOT NULL,
    enabled_at INTEGER NOT NULL CHECK (enabled_at >= 0),
    sealed_checkpoint_at INTEGER CHECK (
        sealed_checkpoint_at IS NULL OR sealed_checkpoint_at >= 0
    )
) STRICT;
