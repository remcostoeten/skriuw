CREATE TABLE "folders" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_folder_id" text,
	"pinned" integer DEFAULT 0,
	"pinned_at" integer,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"type" text DEFAULT 'folder' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"parent_folder_id" text,
	"pinned" integer DEFAULT 0,
	"pinned_at" integer,
	"favorite" integer DEFAULT 0,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"type" text DEFAULT 'note' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"block_id" text NOT NULL,
	"content" text NOT NULL,
	"checked" integer DEFAULT 0 NOT NULL,
	"parent_task_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
