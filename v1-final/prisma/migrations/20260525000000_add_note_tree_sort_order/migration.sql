ALTER TABLE "folders" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "notes" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "folders_user_id_parent_id_sort_order_created_at_idx" ON "folders"("user_id", "parent_id", "sort_order", "created_at");
CREATE INDEX "notes_user_id_parent_id_sort_order_created_at_idx" ON "notes"("user_id", "parent_id", "sort_order", "created_at");
