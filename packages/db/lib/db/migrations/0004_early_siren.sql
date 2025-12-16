ALTER TABLE "folders" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "shortcuts" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE INDEX "folders_user_id_idx" ON "folders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "folders_user_parent_idx" ON "folders" USING btree ("user_id","parent_folder_id");--> statement-breakpoint
CREATE INDEX "notes_user_id_idx" ON "notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notes_user_parent_idx" ON "notes" USING btree ("user_id","parent_folder_id");--> statement-breakpoint
CREATE INDEX "settings_user_id_idx" ON "settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "settings_user_key_idx" ON "settings" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "shortcuts_user_id_idx" ON "shortcuts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_note_idx" ON "tasks" USING btree ("user_id","note_id");