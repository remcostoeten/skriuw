ALTER TABLE workspace_nodes ADD COLUMN cover_image_id TEXT;
ALTER TABLE workspace_nodes ADD COLUMN cover_full_width INTEGER NOT NULL DEFAULT 0
    CHECK (cover_full_width IN (0, 1));
ALTER TABLE workspace_nodes ADD COLUMN cover_position_x REAL NOT NULL DEFAULT 50
    CHECK (cover_position_x >= 0 AND cover_position_x <= 100);
ALTER TABLE workspace_nodes ADD COLUMN cover_position_y REAL NOT NULL DEFAULT 50
    CHECK (cover_position_y >= 0 AND cover_position_y <= 100);
ALTER TABLE workspace_nodes ADD COLUMN cover_zoom REAL NOT NULL DEFAULT 1
    CHECK (cover_zoom >= 1 AND cover_zoom <= 3);
