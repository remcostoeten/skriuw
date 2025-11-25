# Drizzle Storage Architecture

This blueprint captures how to introduce a Drizzle-backed storage layer that keeps web (Vercel) and Tauri 2.0 desktop clients in lockstep while preserving the app's instant, optimistic UI semantics.

## Goals
- **Single codebase, multiple backends:** one set of schemas/migrations that run against libsql (Turso) for cloud and SQLite for Tauri, without a bespoke sync server.
- **Instant UI semantics:** keep mutations optimistic; all writes hit a local queue first so the BlockNote-driven UI never stalls.
- **Deterministic sync:** a small, well-defined outbox and revision model to reconcile offline edits and multi-device changes.

## Adapter matrix
- **Web (Vercel):** `drizzleLibsql` (primary) with a `localStorage` fallback for offline-only sessions.
- **Desktop (Tauri 2.0):** `drizzleLocalSqlite` (primary) with an optional `drizzleLibsql` replica for cloud sync; `localStorage` remains the safe fallback when SQLite is unavailable.
- **Serverless migrations:** run the same migrations against libsql/SQLite targets; schema generation is driven by a single source of truth.

These adapter names are registered in `StorageAdapterName` so the onboarding flow can switch adapters without special-casing the UI.

## Base entity schemas
Shared, library-free schema descriptions live in `src/data/drizzle/base-entities.ts` so they can be consumed by Drizzle table builders, seeders, and validators:

- **notes:** block-based document JSON, folder linkage, authored/edited metadata.
- **note_revisions:** immutable snapshots for history, undo/redo, and conflict resolution.
- **folders:** hierarchical tree with parent linkage.
- **profiles:** attribution metadata for collaboration and presence (used when cloud sync is enabled).
- **device_replicas:** per-device logical clocks to coordinate offline-first merges.
- **storage_queue:** optimistic outbox for mutations awaiting cloud confirmation.

Each table lists allowed dialects (libsql/SQLite), indexes, and relationship hints so generation scripts can emit dialect-specific DDL while keeping the domain model stable.

## Sync + optimistic workflow
1. **Onboarding choice:** user selects local vs. cloud; the selection is persisted and passed to `initializeGenericStorage`.
2. **Optimistic enqueue:** mutations write to `storage_queue` (desktop) or memory (web) and update UI state immediately.
3. **Apply + fan-out:** the local Drizzle adapter applies the mutation to the primary store; a background worker pushes queued items to the cloud replica (libsql).
4. **Conflict handling:** when a remote write lands, merge using `note_revisions` + device clocks; the latest resolved version updates `notes` and emits storage events to refresh React state.

## Migrations + tooling
- Generate migrations from `baseEntitySchemas` to keep column parity across libsql/SQLite.
- Seed local replicas with a minimal profile/device row on first launch to avoid empty-state edge cases.
- Add health checks that surface adapter status (online/offline, replica drift) in the existing storage status panel.

## Migration from localStorage
- Provide a one-time import that reads legacy `localStorage` keys, maps them into the `notes`/`folders` tables, and enqueues initial revisions.
- After migration, set the persisted adapter to `drizzleLocalSqlite` (desktop) or `drizzleLibsql` (web) so future sessions skip the legacy path.
