-- Optional per-entry title for journal entries. Nullable so existing rows keep
-- working; the sidebar falls back to a content preview when it is absent.
ALTER TABLE "journal_entries" ADD COLUMN "title" TEXT;
