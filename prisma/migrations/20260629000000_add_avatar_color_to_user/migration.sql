-- Deterministic avatar color assigned at signup and reused on every avatar
-- surface. Nullable so existing rows keep working; the app derives a stable
-- fallback color from the user id until a value is backfilled.

ALTER TABLE "user" ADD COLUMN "avatar_color" TEXT;
