-- Automatic convergence: superseded received operations replace the
-- user-facing conflict record, losing document bodies are preserved as
-- history revisions with provenance, and rehydration after server log
-- truncation gets its bookkeeping. See docs/adr/0037-automatic-sync-convergence.md.

-- 1. history_outbox gains provenance; the revision uniqueness is scoped per
--    provenance so a superseded body can sit beside the local revision it lost
--    to. SQLite cannot alter a UNIQUE constraint, so the table is rebuilt.
CREATE TABLE history_outbox_next (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    markdown TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    claimed_by TEXT,
    claimed_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    next_attempt_at INTEGER NOT NULL DEFAULT 0 CHECK (next_attempt_at >= 0),
    provenance TEXT NOT NULL DEFAULT 'local' CHECK (
        provenance IN ('local', 'remote', 'superseded')
    ),
    UNIQUE (note_id, revision, provenance)
) STRICT;

INSERT INTO history_outbox_next (
    id, note_id, revision, markdown, created_at, claimed_by, claimed_at,
    attempts, last_error, next_attempt_at
)
SELECT id, note_id, revision, markdown, created_at, claimed_by, claimed_at,
       attempts, last_error, next_attempt_at
FROM history_outbox;

DROP INDEX history_outbox_claim;

DROP TABLE history_outbox;

ALTER TABLE history_outbox_next RENAME TO history_outbox;

CREATE INDEX history_outbox_claim
    ON history_outbox(next_attempt_at, claimed_at, created_at, id);

-- 2. sync_received_operations: the 'conflict' outcome becomes 'superseded'
--    with the reason and bounded detail stored inline. Existing conflict rows
--    are rewritten from the conflict record before that record is dropped.
CREATE TABLE sync_received_operations_next (
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
    outcome TEXT NOT NULL CHECK (
        outcome IN ('applied', 'local_echo', 'no_op', 'superseded')
    ),
    reason TEXT,
    detail TEXT,
    received_at INTEGER NOT NULL CHECK (received_at >= 0),
    CHECK ((outcome = 'superseded') = (reason IS NOT NULL))
) STRICT;

INSERT INTO sync_received_operations_next (
    operation_id, device_id, client_sequence, base_server_sequence,
    server_sequence, operation_json, outcome, reason, detail, received_at
)
SELECT received.operation_id,
       received.device_id,
       received.client_sequence,
       received.base_server_sequence,
       received.server_sequence,
       received.operation_json,
       CASE WHEN received.outcome = 'conflict' THEN 'superseded'
            ELSE received.outcome END,
       CASE WHEN received.outcome = 'conflict'
            THEN COALESCE(conflict.subreason, conflict.reason_code, 'domain_conflict')
            END,
       CASE WHEN received.outcome = 'conflict' THEN conflict.message END,
       received.received_at
FROM sync_received_operations received
LEFT JOIN sync_conflicts conflict ON conflict.id = received.conflict_id;

DROP TABLE sync_received_operations;

ALTER TABLE sync_received_operations_next RENAME TO sync_received_operations;

CREATE INDEX sync_received_operations_device_sequence
    ON sync_received_operations(device_id, client_sequence);

-- 3. The conflict record is gone; every divergence converges automatically.
DROP TABLE sync_document_conflicts;

DROP TABLE sync_conflicts;

-- 4. sync_blocked_operations gains the 'cloud_rejected' reason for a batch the
--    server rejected identically on three consecutive pushes.
CREATE TABLE sync_blocked_operations_next (
    id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL,
    operation_json TEXT NOT NULL,
    reason_code TEXT NOT NULL CHECK (
        reason_code IN (
            'operation_too_large',
            'unsupported_operation',
            'asset_content_missing',
            'cloud_rejected'
        )
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    resolved_at INTEGER CHECK (resolved_at IS NULL OR resolved_at >= created_at),
    resolution TEXT CHECK (
        (resolution IS NULL OR resolution IN ('retried', 'discarded')) AND
        ((resolution IS NULL) = (resolved_at IS NULL))
    )
) STRICT;

INSERT INTO sync_blocked_operations_next (
    id, operation_type, operation_json, reason_code, created_at, resolved_at, resolution
)
SELECT id, operation_type, operation_json, reason_code, created_at, resolved_at, resolution
FROM sync_blocked_operations;

DROP TABLE sync_blocked_operations;

ALTER TABLE sync_blocked_operations_next RENAME TO sync_blocked_operations;

CREATE INDEX sync_blocked_operations_unresolved
    ON sync_blocked_operations(created_at, id)
    WHERE resolved_at IS NULL;

CREATE INDEX sync_blocked_operations_discarded
    ON sync_blocked_operations(resolved_at DESC)
    WHERE resolution = 'discarded';

-- 5. The checkpoint sequence a device was last rebuilt from. Own-device
--    operations above it that have no outbox or received row are re-applied
--    as remote operations instead of being rejected as unmatched echoes.
ALTER TABLE sync_connection ADD COLUMN rehydrated_through INTEGER NOT NULL DEFAULT 0 CHECK (
    rehydrated_through >= 0 AND rehydrated_through <= 9007199254740991
);

-- 6. Note mentions the sync apply path could not resolve yet because the
--    mentioned note arrives later in the log; re-resolved when it does.
CREATE TABLE sync_dangling_references (
    note_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    PRIMARY KEY (note_id, target_id)
) STRICT;
