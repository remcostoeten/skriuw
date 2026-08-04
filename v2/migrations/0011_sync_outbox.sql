CREATE TABLE sync_connection (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    workspace_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    connected_at INTEGER NOT NULL CHECK (connected_at >= 0),
    disconnected_at INTEGER CHECK (
        disconnected_at IS NULL OR disconnected_at >= connected_at
    ),
    observed_server_sequence INTEGER NOT NULL DEFAULT 0 CHECK (
        observed_server_sequence >= 0 AND
        observed_server_sequence <= 9007199254740991
    ),
    next_client_sequence INTEGER NOT NULL DEFAULT 1 CHECK (
        next_client_sequence > 0 AND
        next_client_sequence <= 9007199254740991
    )
) STRICT;

CREATE TABLE sync_outbox (
    operation_id TEXT PRIMARY KEY,
    client_sequence INTEGER NOT NULL UNIQUE CHECK (
        client_sequence > 0 AND client_sequence <= 9007199254740991
    ),
    base_server_sequence INTEGER NOT NULL CHECK (
        base_server_sequence >= 0 AND
        base_server_sequence <= 9007199254740991
    ),
    operation_json TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    claimed_by TEXT,
    claimed_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at INTEGER NOT NULL DEFAULT 0 CHECK (next_attempt_at >= 0),
    last_error TEXT,
    CHECK ((claimed_by IS NULL) = (claimed_at IS NULL))
) STRICT;

CREATE INDEX sync_outbox_claim
    ON sync_outbox(client_sequence, next_attempt_at, claimed_at);

CREATE TABLE sync_blocked_operations (
    id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL,
    operation_json TEXT NOT NULL,
    reason_code TEXT NOT NULL CHECK (
        reason_code IN ('operation_too_large', 'unsupported_operation')
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    resolved_at INTEGER CHECK (resolved_at IS NULL OR resolved_at >= created_at)
) STRICT;

CREATE INDEX sync_blocked_operations_unresolved
    ON sync_blocked_operations(created_at, id)
    WHERE resolved_at IS NULL;
