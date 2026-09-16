ALTER TABLE workspace_nodes ADD COLUMN locked_at INTEGER;

ALTER TABLE documents ADD COLUMN sealed_body BLOB;
ALTER TABLE documents ADD COLUMN sealed_nonce TEXT;
ALTER TABLE documents ADD COLUMN sealed_key_id TEXT;

CREATE TABLE note_lock (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    kind TEXT NOT NULL CHECK (kind IN ('pin', 'passphrase')),
    key_id TEXT NOT NULL CHECK (length(key_id) > 0),
    kdf_salt TEXT NOT NULL CHECK (length(kdf_salt) > 0),
    secret_wrap_json TEXT NOT NULL,
    recovery_wrap_json TEXT NOT NULL,
    hint TEXT,
    configured_at INTEGER NOT NULL CHECK (configured_at >= 0),
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    next_attempt_at INTEGER CHECK (next_attempt_at IS NULL OR next_attempt_at >= 0)
) STRICT;
