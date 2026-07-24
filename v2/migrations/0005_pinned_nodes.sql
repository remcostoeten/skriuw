ALTER TABLE workspace_nodes ADD COLUMN pinned_at INTEGER;

CREATE INDEX IF NOT EXISTS workspace_nodes_pinned
    ON workspace_nodes(pinned_at) WHERE pinned_at IS NOT NULL;
