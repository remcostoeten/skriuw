CREATE TABLE "calendar_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'skip',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_status" TEXT,
    "last_sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "calendar_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calendar_subscriptions_user_id_created_at_idx"
ON "calendar_subscriptions"("user_id", "created_at" DESC);

CREATE INDEX "calendar_subscriptions_enabled_last_sync_at_idx"
ON "calendar_subscriptions"("enabled", "last_sync_at");

ALTER TABLE "calendar_subscriptions"
ADD CONSTRAINT "calendar_subscriptions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
