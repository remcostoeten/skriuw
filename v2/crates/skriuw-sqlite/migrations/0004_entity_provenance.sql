ALTER TABLE workspace_tags ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_tags ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_tags ADD COLUMN created_in TEXT;

ALTER TABLE workspace_people ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_people ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_people ADD COLUMN created_in TEXT;
