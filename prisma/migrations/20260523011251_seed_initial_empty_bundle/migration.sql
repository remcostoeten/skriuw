-- Insert one initial empty active bundle if and only if no active bundle
-- exists yet. The partial unique index seed_bundles_one_active enforces
-- "at most one active row" at the schema level; this seed step ensures
-- "at least one" so the admin UI never opens to an empty state.
--
-- gen_random_uuid() is provided by pgcrypto, which Neon enables by default
-- on Postgres 13+. Safe on a fresh DB and idempotent across re-runs.

INSERT INTO "seed_bundles" ("id", "name", "is_active", "updated_at")
SELECT gen_random_uuid(), 'Default', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "seed_bundles" WHERE "is_active" = true);
