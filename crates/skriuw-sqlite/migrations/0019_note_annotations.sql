-- Annotation threads deliberately carry no foreign key to their note. The
-- anchor lives in the document as a mark, and deleting the anchored text must
-- leave the thread intact so it can surface as an orphan rather than vanish
-- with the words it described. Purging a note removes its threads explicitly.
CREATE TABLE note_annotations (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
    anchor_text TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    resolved_at INTEGER CHECK (resolved_at IS NULL OR resolved_at >= 0),
    CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
) STRICT;

-- author_id stays nullable and unused while Skriuw is single-user. It exists
-- now so that attributing a comment later is a write, not a table rebuild.
CREATE TABLE note_annotation_comments (
    id TEXT PRIMARY KEY,
    annotation_id TEXT NOT NULL,
    body_markdown TEXT NOT NULL CHECK (length(body_markdown) > 0),
    author_id TEXT,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0 AND updated_at >= created_at)
) STRICT;

CREATE INDEX note_annotations_note ON note_annotations(note_id, created_at, id);

CREATE INDEX note_annotation_comments_thread
    ON note_annotation_comments(annotation_id, created_at, id);

-- SQLite cannot widen a CHECK in place, and the terminal tombstone write uses
-- INSERT OR IGNORE, so an unlisted kind is discarded in silence rather than
-- failing. Rebuild with 'annotation' included. Rows carry over unchanged.
CREATE TABLE sync_tombstones_next (
    entity_kind TEXT NOT NULL CHECK (
        entity_kind IN (
            'node', 'tag', 'person', 'note_property', 'property_template',
            'task', 'prompt', 'annotation'
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
