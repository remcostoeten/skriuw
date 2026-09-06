ALTER TABLE history_cache ADD COLUMN additions INTEGER CHECK (additions >= 0);
ALTER TABLE history_cache ADD COLUMN deletions INTEGER CHECK (deletions >= 0);
