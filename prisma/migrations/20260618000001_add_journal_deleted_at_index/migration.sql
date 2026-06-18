-- The `@@index([userId, dateKey, deletedAt])` on JournalEntry exists in
-- schema.prisma but was never written to a migration (the journal_entry_unique_date
-- migration only added the partial unique index). Add it so the DB matches schema.

-- CreateIndex
CREATE INDEX "journal_entries_user_id_date_key_deleted_at_idx" ON "journal_entries"("user_id", "date_key", "deleted_at");
