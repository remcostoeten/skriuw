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
