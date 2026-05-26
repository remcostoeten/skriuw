-- CreateTable
CREATE TABLE "note_share_views" (
    "id" UUID NOT NULL,
    "share_id" UUID NOT NULL,
    "viewer_hash" TEXT NOT NULL,
    "referrer" TEXT,
    "country" TEXT,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_share_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "note_share_views_share_id_viewed_at_idx" ON "note_share_views"("share_id", "viewed_at" DESC);

-- CreateIndex
CREATE INDEX "note_share_views_share_id_viewer_hash_idx" ON "note_share_views"("share_id", "viewer_hash");

-- AddForeignKey
ALTER TABLE "note_share_views" ADD CONSTRAINT "note_share_views_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "note_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
