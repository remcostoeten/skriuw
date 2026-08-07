-- Sync convergence v1: terminal identity tombstones, preserved document
-- conflict alternatives, precise conflict subreasons, and a no-op received
-- outcome. See v2/docs/specs/sync-convergence-v1.md.

CREATE TABLE sync_tombstones (
    entity_kind TEXT NOT NULL CHECK (
        entity_kind IN ('node', 'tag', 'person', 'note_property', 'property_template')
    ),
    entity_id TEXT NOT NULL,
    scope_id TEXT NOT NULL DEFAULT '',
    root_id TEXT,
    operation_id TEXT,
    server_sequence INTEGER CHECK (
        server_sequence IS NULL OR
        (server_sequence > 0 AND server_sequence <= 9007199254740991)
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    PRIMARY KEY (entity_kind, entity_id, scope_id)
) STRICT;

ALTER TABLE sync_conflicts ADD COLUMN subreason TEXT CHECK (
    subreason IS NULL OR subreason IN (
        'concurrent_document_version',
        'tombstone_blocked',
        'concurrent_field_edit',
        'collection_conflict',
        'tree_conflict',
        'content_unavailable'
    )
);

CREATE TABLE sync_document_conflicts (
    conflict_id TEXT PRIMARY KEY REFERENCES sync_conflicts(id),
    note_id TEXT NOT NULL,
    remote_title TEXT,
    remote_document_json TEXT NOT NULL,
    remote_markdown TEXT NOT NULL,
    remote_word_count INTEGER NOT NULL CHECK (remote_word_count >= 0),
    remote_expected_revision INTEGER,
    remote_at INTEGER NOT NULL,
    local_title TEXT,
    local_document_json TEXT,
    local_markdown TEXT,
    local_revision INTEGER,
    base_available INTEGER NOT NULL DEFAULT 0 CHECK (base_available IN (0, 1)),
    resolved_choice TEXT CHECK (
        resolved_choice IS NULL OR resolved_choice IN ('local', 'remote', 'merged')
    ),
    resolved_document_json TEXT,
    resolved_markdown TEXT,
    resolved_revision INTEGER,
    resolved_at INTEGER CHECK (resolved_at IS NULL OR resolved_at >= 0),
    CHECK ((resolved_choice IS NULL) = (resolved_at IS NULL)),
    CHECK (
        (local_document_json IS NULL) = (local_markdown IS NULL) AND
        (local_document_json IS NULL) = (local_revision IS NULL)
    )
) STRICT;

CREATE INDEX sync_document_conflicts_note
    ON sync_document_conflicts(note_id)
    WHERE resolved_at IS NULL;

-- sync_received_operations gains the 'no_op' outcome; SQLite cannot alter a
-- CHECK constraint, so the table is rebuilt in place.
CREATE TABLE sync_received_operations_v2 (
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
        outcome IN ('applied', 'local_echo', 'conflict', 'no_op')
    ),
    conflict_id TEXT REFERENCES sync_conflicts(id),
    received_at INTEGER NOT NULL CHECK (received_at >= 0),
    CHECK ((outcome = 'conflict') = (conflict_id IS NOT NULL))
) STRICT;

INSERT INTO sync_received_operations_v2
    SELECT operation_id, device_id, client_sequence, base_server_sequence,
           server_sequence, operation_json, outcome, conflict_id, received_at
    FROM sync_received_operations;

DROP TABLE sync_received_operations;

ALTER TABLE sync_received_operations_v2 RENAME TO sync_received_operations;

CREATE INDEX sync_received_operations_device_sequence
    ON sync_received_operations(device_id, client_sequence);
