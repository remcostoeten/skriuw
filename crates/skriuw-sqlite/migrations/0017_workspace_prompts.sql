-- User-defined AI prompts. Prompts are ordinary workspace content: they carry
-- no provider, model, endpoint, or credential, so they replicate, export, and
-- archive next to notes without ever becoming a secret.
--
-- built_in_id names the shipped prompt this record shadows. It is unique, so a
-- built-in can be customised once and reset by deleting the shadow; a shipped
-- built-in update can never overwrite the user's copy.
CREATE TABLE workspace_prompts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    input_shape TEXT NOT NULL CHECK (input_shape IN ('selection', 'note', 'freeform')),
    temperature_millis INTEGER CHECK (
        temperature_millis IS NULL OR (temperature_millis >= 0 AND temperature_millis <= 1000)
    ),
    max_output_bytes INTEGER NOT NULL CHECK (
        max_output_bytes > 0 AND max_output_bytes <= 4194304
    ),
    built_in_id TEXT,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
) STRICT;

CREATE UNIQUE INDEX workspace_prompts_built_in
    ON workspace_prompts(built_in_id)
    WHERE built_in_id IS NOT NULL;

CREATE INDEX workspace_prompts_recent ON workspace_prompts(created_at, id);

-- sync_tombstones only accepted the five entity kinds that existed when
-- convergence shipped, and the terminal tombstone write uses INSERT OR IGNORE,
-- so any later kind was discarded in silence instead of failing. SQLite cannot
-- widen a CHECK in place, so the table is rebuilt with the kinds that actually
-- reach it. Rows carry over unchanged.
CREATE TABLE sync_tombstones_next (
    entity_kind TEXT NOT NULL CHECK (
        entity_kind IN (
            'node', 'tag', 'person', 'note_property', 'property_template', 'task', 'prompt'
        )
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

INSERT INTO sync_tombstones_next (
    entity_kind, entity_id, scope_id, root_id, operation_id, server_sequence, created_at
)
SELECT entity_kind, entity_id, scope_id, root_id, operation_id, server_sequence, created_at
FROM sync_tombstones;

DROP TABLE sync_tombstones;

ALTER TABLE sync_tombstones_next RENAME TO sync_tombstones;
