-- Full-text search parity (issue #201): index the combined name+body tsvector
-- the web `searchNotes` server action queries, so ranked note search does not
-- seq-scan every note. IMMUTABLE expression required for an expression index,
-- hence the explicit 'english' regconfig and coalesce of the nullable columns.
CREATE INDEX IF NOT EXISTS "notes_fulltext_idx"
    ON "notes"
    USING GIN (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("content", '')));
