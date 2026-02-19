CREATE TYPE "public"."action_type" AS ENUM('created', 'updated', 'deleted', 'checked', 'unchecked', 'moved', 'pinned', 'unpinned', 'favorited', 'unfavorited');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('note', 'folder', 'task');--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"original_name" text,
	"size" integer NOT NULL,
	"type" text NOT NULL,
	"storage_provider" text DEFAULT 'uploadthing' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_tags" (
	"note_id" text NOT NULL,
	"tag_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1',
	"user_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"action" "action_type" NOT NULL,
	"entity_name" text NOT NULL,
	"metadata" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "cover_image" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_user_id_idx" ON "files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "files_created_at_idx" ON "files" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "note_tags_pk" ON "note_tags" USING btree ("note_id","tag_id");--> statement-breakpoint
CREATE INDEX "note_tags_note_idx" ON "note_tags" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "note_tags_tag_idx" ON "note_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tags_user_id_idx" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_idx" ON "tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "activity_events_user_id_idx" ON "activity_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_events_created_at_idx" ON "activity_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activity_events_user_created_at_idx" ON "activity_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_events_entity_idx" ON "activity_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_config_user_active_unique_idx" ON "ai_provider_config" USING btree ("user_id","is_active");