ALTER TABLE "notes" ADD COLUMN "semantic_embedding" JSONB;

CREATE INDEX "notes_semantic_embedding_updated_at_idx"
  ON "notes"("user_id", "updated_at")
  WHERE "deleted_at" IS NULL AND "semantic_embedding" IS NOT NULL;
