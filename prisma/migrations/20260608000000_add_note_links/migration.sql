-- Persisted knowledge-graph edges (one row per outgoing link or tag membership).
CREATE TABLE "note_links" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_note_id" UUID NOT NULL,
    "target_note_id" UUID,
    "target_label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "note_links_source_note_id_kind_target_label_key" ON "note_links"("source_note_id", "kind", "target_label");
CREATE INDEX "note_links_user_id_source_note_id_idx" ON "note_links"("user_id", "source_note_id");
CREATE INDEX "note_links_user_id_target_note_id_idx" ON "note_links"("user_id", "target_note_id");

ALTER TABLE "note_links" ADD CONSTRAINT "note_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_source_note_id_fkey" FOREIGN KEY ("source_note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
