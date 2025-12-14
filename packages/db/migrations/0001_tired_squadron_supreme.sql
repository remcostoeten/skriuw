CREATE TABLE "storage_connectors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'configured' NOT NULL,
	"config" text NOT NULL,
	"oauth2_tokens" text,
	"last_validated_at" bigint,
	"last_error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storage_connectors" ADD CONSTRAINT "storage_connectors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_connectors_user_id_idx" ON "storage_connectors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "storage_connectors_user_type_idx" ON "storage_connectors" USING btree ("user_id","type");