ALTER TABLE "folders" ALTER COLUMN "pinned_at" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "folders" ALTER COLUMN "created_at" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "folders" ALTER COLUMN "updated_at" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "pinned_at" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "created_at" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "updated_at" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "created_at" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "updated_at" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "shortcuts" ALTER COLUMN "customized_at" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "shortcuts" ALTER COLUMN "created_at" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "shortcuts" ALTER COLUMN "updated_at" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "created_at" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "updated_at" SET DATA TYPE bigint;