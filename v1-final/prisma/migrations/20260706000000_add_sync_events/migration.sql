CREATE TABLE "sync_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "token_id" UUID,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resource_id" UUID,
    "resource_name" TEXT,
    "message" TEXT,
    "idempotency_key" TEXT,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_events_idempotency_key_key" ON "sync_events"("idempotency_key");
CREATE INDEX "sync_events_user_id_created_at_idx" ON "sync_events"("user_id", "created_at" DESC);
CREATE INDEX "sync_events_token_id_created_at_idx" ON "sync_events"("token_id", "created_at" DESC);

ALTER TABLE "sync_events"
ADD CONSTRAINT "sync_events_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
