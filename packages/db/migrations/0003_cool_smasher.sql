CREATE TABLE "ai_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" bigint,
	"rate_limited_until" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tokens_used" integer,
	"prompt_hash" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_config" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"base_prompt" text,
	"temperature" integer DEFAULT 70,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_prompt_log" ADD CONSTRAINT "ai_prompt_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_config" ADD CONSTRAINT "ai_provider_config_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_api_keys_provider_idx" ON "ai_api_keys" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "ai_api_keys_provider_active_idx" ON "ai_api_keys" USING btree ("provider","is_active");--> statement-breakpoint
CREATE INDEX "ai_prompt_log_user_id_idx" ON "ai_prompt_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_prompt_log_user_created_idx" ON "ai_prompt_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_provider_config_user_id_idx" ON "ai_provider_config" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_provider_config_user_active_idx" ON "ai_provider_config" USING btree ("user_id","is_active");