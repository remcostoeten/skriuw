-- Add missing columns to notes table
-- These columns exist in schema.ts but were never migrated
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "cover_image" text;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "icon" text;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "tags" text[];
