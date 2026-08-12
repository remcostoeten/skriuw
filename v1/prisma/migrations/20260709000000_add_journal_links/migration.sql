-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN "rich_content" JSONB;

-- CreateTable
CREATE TABLE "journal_links" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_journal_id" UUID NOT NULL,
    "target_note_id" UUID,
    "target_label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_links_user_id_source_journal_id_idx" ON "journal_links"("user_id", "source_journal_id");

-- CreateIndex
CREATE INDEX "journal_links_user_id_target_note_id_idx" ON "journal_links"("user_id", "target_note_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_links_source_journal_id_kind_target_label_key" ON "journal_links"("source_journal_id", "kind", "target_label");

-- AddForeignKey
ALTER TABLE "journal_links" ADD CONSTRAINT "journal_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_links" ADD CONSTRAINT "journal_links_source_journal_id_fkey" FOREIGN KEY ("source_journal_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
