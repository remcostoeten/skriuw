-- Collaboration domain: access requests, accepted collaborators, and notifications.
-- The models were added to schema.prisma (commit 350a4198) but no migration was
-- ever generated, so these tables never existed in any deployed database.

-- CreateTable
CREATE TABLE "collaboration_requests" (
    "id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "requester_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "collaboration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_collaborators" (
    "id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'viewer',
    "invited_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collaboration_requests_owner_id_status_idx" ON "collaboration_requests"("owner_id", "status");

-- CreateIndex
CREATE INDEX "collaboration_requests_requester_id_status_idx" ON "collaboration_requests"("requester_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_requests_note_id_requester_id_key" ON "collaboration_requests"("note_id", "requester_id");

-- CreateIndex
CREATE INDEX "note_collaborators_user_id_idx" ON "note_collaborators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "note_collaborators_note_id_user_id_key" ON "note_collaborators"("note_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_created_at_idx" ON "notifications"("user_id", "read", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_collaborators" ADD CONSTRAINT "note_collaborators_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_collaborators" ADD CONSTRAINT "note_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_collaborators" ADD CONSTRAINT "note_collaborators_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
