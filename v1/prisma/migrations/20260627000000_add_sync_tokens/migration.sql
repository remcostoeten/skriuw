-- Desktop sync tokens: hashed bearer tokens for non-cookie API access from the
-- desktop app. The plaintext token is only returned at creation time.

CREATE TABLE "sync_tokens" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY['sync:read']::TEXT[],
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_tokens_token_hash_key" ON "sync_tokens"("token_hash");
CREATE INDEX "sync_tokens_user_id_revoked_at_expires_at_idx" ON "sync_tokens"("user_id", "revoked_at", "expires_at");

ALTER TABLE "sync_tokens" ADD CONSTRAINT "sync_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
