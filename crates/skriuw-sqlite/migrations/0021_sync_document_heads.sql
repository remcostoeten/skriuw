-- Base-proof document reconciliation.
--
-- A replicated SaveDocument used to be judged against `documents.revision`, a
-- device-local edit counter. Devices that joined through the replicated log
-- rather than a checkpoint start every note at revision 1, so any workspace
-- that existed before its first sign-in diverged permanently. This table
-- records, per note, the server sequence of the newest document write this
-- device has already incorporated, which is the fact the merge rule actually
-- needs: an incoming write whose causal base covers that point is downstream
-- and can fast-forward, and anything older is genuine concurrency.

CREATE TABLE sync_document_heads (
    note_id TEXT PRIMARY KEY,
    server_sequence INTEGER NOT NULL CHECK (
        server_sequence > 0 AND server_sequence <= 9007199254740991
    )
) STRICT;

-- Existing connections carry a log that already answers this. Seeding from it
-- keeps an upgraded device from treating settled history as unseen, which
-- would let a remote write fast-forward over a local edit still in the outbox.
INSERT INTO sync_document_heads(note_id, server_sequence)
SELECT note_id, MAX(server_sequence)
FROM (
    SELECT json_extract(operation_json, '$.operation.noteId') AS note_id,
           server_sequence
    FROM sync_received_operations
    WHERE outcome IN ('applied', 'local_echo', 'no_op')
      AND json_extract(operation_json, '$.operation.type') = 'save_document'
    UNION ALL
    SELECT json_extract(operation_json, '$.operation.id') AS note_id,
           server_sequence
    FROM sync_received_operations
    WHERE outcome IN ('applied', 'local_echo', 'no_op')
      AND json_extract(operation_json, '$.operation.type') = 'create_note'
)
WHERE note_id IS NOT NULL
GROUP BY note_id;

-- sync_document_conflicts gains the 'superseded' resolution, written when a
-- later causally-downstream write settles a divergence the user never got to.
-- Both preserved versions stay; only the open status closes. SQLite cannot
-- alter a CHECK constraint, so the table is rebuilt in place.
CREATE TABLE sync_document_conflicts_v2 (
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
        resolved_choice IS NULL OR
        resolved_choice IN ('local', 'remote', 'merged', 'superseded')
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

INSERT INTO sync_document_conflicts_v2
    SELECT conflict_id, note_id, remote_title, remote_document_json,
           remote_markdown, remote_word_count, remote_expected_revision,
           remote_at, local_title, local_document_json, local_markdown,
           local_revision, base_available, resolved_choice,
           resolved_document_json, resolved_markdown, resolved_revision,
           resolved_at
    FROM sync_document_conflicts;

DROP TABLE sync_document_conflicts;

ALTER TABLE sync_document_conflicts_v2 RENAME TO sync_document_conflicts;

CREATE INDEX sync_document_conflicts_note
    ON sync_document_conflicts(note_id)
    WHERE resolved_at IS NULL;
