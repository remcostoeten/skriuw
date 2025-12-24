ALTER TABLE "notes" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;
ALTER TABLE "notes" ADD COLUMN "public_id" text;
ALTER TABLE "notes" ADD COLUMN "public_views" integer DEFAULT 0 NOT NULL;
CREATE UNIQUE INDEX "notes_public_id_idx" ON "notes" USING btree ("public_id");

CREATE TABLE "note_visitors" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"visitor_key" text NOT NULL,
	"viewer_user_id" text,
	"created_at" bigint NOT NULL
);
ALTER TABLE "note_visitors" ADD CONSTRAINT "note_visitors_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "note_visitors_note_idx" ON "note_visitors" USING btree ("note_id");
CREATE UNIQUE INDEX "note_visitors_note_visitor_idx" ON "note_visitors" USING btree ("note_id","visitor_key");
CREATE INDEX "note_visitors_visitor_idx" ON "note_visitors" USING btree ("visitor_key");
