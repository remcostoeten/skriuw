CREATE TABLE sync_conflicts (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL UNIQUE,
    operation_type TEXT NOT NULL,
    server_sequence INTEGER NOT NULL UNIQUE CHECK (
        server_sequence > 0 AND server_sequence <= 9007199254740991
    ),
    reason_code TEXT NOT NULL CHECK (
        reason_code IN (
            'revision_conflict',
            'missing_dependency',
            'identity_conflict',
            'domain_conflict'
        )
    ),
    operation_json TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    resolved_at INTEGER CHECK (resolved_at IS NULL OR resolved_at >= created_at)
) STRICT;

CREATE INDEX sync_conflicts_unresolved
    ON sync_conflicts(created_at, id)
    WHERE resolved_at IS NULL;

CREATE TABLE sync_received_operations (
    operation_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    client_sequence INTEGER NOT NULL CHECK (
        client_sequence > 0 AND client_sequence <= 9007199254740991
    ),
    base_server_sequence INTEGER NOT NULL CHECK (
        base_server_sequence >= 0 AND
        base_server_sequence <= 9007199254740991
    ),
    server_sequence INTEGER NOT NULL UNIQUE CHECK (
        server_sequence > 0 AND server_sequence <= 9007199254740991
    ),
    operation_json TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'local_echo', 'conflict')),
    conflict_id TEXT REFERENCES sync_conflicts(id),
    received_at INTEGER NOT NULL CHECK (received_at >= 0),
    CHECK ((outcome = 'conflict') = (conflict_id IS NOT NULL))
) STRICT;

CREATE INDEX sync_received_operations_device_sequence
    ON sync_received_operations(device_id, client_sequence);
