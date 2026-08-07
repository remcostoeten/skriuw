CREATE TABLE sync_blocked_operations_next (
    id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL,
    operation_json TEXT NOT NULL,
    reason_code TEXT NOT NULL CHECK (
        reason_code IN (
            'operation_too_large',
            'unsupported_operation',
            'asset_content_missing'
        )
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    resolved_at INTEGER CHECK (resolved_at IS NULL OR resolved_at >= created_at)
) STRICT;

INSERT INTO sync_blocked_operations_next
    SELECT id, operation_type, operation_json, reason_code, created_at, resolved_at
    FROM sync_blocked_operations;

DROP TABLE sync_blocked_operations;

ALTER TABLE sync_blocked_operations_next RENAME TO sync_blocked_operations;

CREATE INDEX sync_blocked_operations_unresolved
    ON sync_blocked_operations(created_at, id)
    WHERE resolved_at IS NULL;
