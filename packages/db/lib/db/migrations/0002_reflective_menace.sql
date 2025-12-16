CREATE TABLE "ai_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_usage_user_month_idx" ON "ai_usage" USING btree ("user_id","month");