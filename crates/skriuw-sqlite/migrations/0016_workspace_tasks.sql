-- Tasks deliberately carry no foreign key to their source note. A cascade
-- would destroy the task with the note, and an automatic SET NULL would break
-- the paired-null source link. Purging a note detaches its tasks explicitly so
-- the record survives its source and stays visible.
CREATE TABLE workspace_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'done')),
    priority TEXT NOT NULL CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
    due_date TEXT,
    description TEXT NOT NULL,
    tag_ids_json TEXT NOT NULL CHECK (json_valid(tag_ids_json)),
    assignee_ids_json TEXT NOT NULL CHECK (json_valid(assignee_ids_json)),
    source_note_id TEXT,
    source_block_id TEXT,
    detached_at INTEGER,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
    CHECK ((source_note_id IS NULL) = (source_block_id IS NULL)),
    CHECK (detached_at IS NULL OR source_note_id IS NULL)
) STRICT;

CREATE UNIQUE INDEX workspace_tasks_source
    ON workspace_tasks(source_note_id, source_block_id)
    WHERE source_note_id IS NOT NULL;

CREATE INDEX workspace_tasks_source_note
    ON workspace_tasks(source_note_id)
    WHERE source_note_id IS NOT NULL;

CREATE INDEX workspace_tasks_board ON workspace_tasks(status, due_date, id);

CREATE INDEX workspace_tasks_recent ON workspace_tasks(updated_at DESC, id);
