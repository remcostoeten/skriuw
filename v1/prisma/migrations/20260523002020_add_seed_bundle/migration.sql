-- AlterTable
ALTER TABLE "user" ADD COLUMN     "editor_preferences" JSONB;

-- CreateTable
CREATE TABLE "seed_bundles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "folders" JSONB NOT NULL DEFAULT '[]',
    "notes" JSONB NOT NULL DEFAULT '[]',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "journals" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seed_bundles_pkey" PRIMARY KEY ("id")
);

-- Enforce at most one active bundle. Partial unique index over is_active
-- restricted to rows where is_active = true: at most one such row can exist.
CREATE UNIQUE INDEX "seed_bundles_one_active"
    ON "seed_bundles" ("is_active") WHERE "is_active" = true;
