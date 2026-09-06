ALTER TABLE history_cache ADD COLUMN word_count INTEGER CHECK (word_count >= 0);
