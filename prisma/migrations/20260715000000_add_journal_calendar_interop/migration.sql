ALTER TABLE "journal_entries"
ADD COLUMN "calendar_source_id" TEXT,
ADD COLUMN "calendar_source_uid" TEXT;

CREATE INDEX "journal_entries_user_id_calendar_source_id_calendar_source_uid_idx"
ON "journal_entries"("user_id", "calendar_source_id", "calendar_source_uid");

CREATE TABLE "journal_feed_tokens" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "journal_feed_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "journal_feed_tokens_token_hash_key"
ON "journal_feed_tokens"("token_hash");

CREATE INDEX "journal_feed_tokens_user_id_revoked_at_created_at_idx"
ON "journal_feed_tokens"("user_id", "revoked_at", "created_at" DESC);

ALTER TABLE "journal_feed_tokens"
ADD CONSTRAINT "journal_feed_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
