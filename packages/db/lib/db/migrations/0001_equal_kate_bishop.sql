ALTER TABLE "folders" ADD COLUMN "deleted_at" bigint;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "deleted_at" bigint;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_date" bigint;--> statement-breakpoint
CREATE INDEX "folders_parent_folder_idx" ON "folders" USING btree ("parent_folder_id");--> statement-breakpoint
CREATE INDEX "folders_deleted_at_idx" ON "folders" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "notes_parent_folder_idx" ON "notes" USING btree ("parent_folder_id");--> statement-breakpoint
CREATE INDEX "notes_deleted_at_idx" ON "notes" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "notes_pinned_idx" ON "notes" USING btree ("pinned");--> statement-breakpoint
CREATE INDEX "notes_updated_at_idx" ON "notes" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "settings_key_idx" ON "settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "tasks_note_id_idx" ON "tasks" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "tasks_block_id_idx" ON "tasks" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "tasks_note_block_idx" ON "tasks" USING btree ("note_id","block_id");--> statement-breakpoint
CREATE INDEX "tasks_due_date_idx" ON "tasks" USING btree ("due_date");