# Local-First Backend Spec

## Goal

Move the app from:

- direct Zustand -> IndexedDB helper coupling
- local-only persistence
- no sync or auth boundary

to:

- local-first persistence with `PGlite`
- repository-driven frontend data access
- background sync queue
- `Hono` backend for auth, sync, snapshot, and search
- instant-feeling UI with optimistic local writes

The primary product requirement is:

**All user actions must feel instant.**

That means:

- UI updates immediately from local state
- local persistence commits without waiting for network
- network sync happens after local commit
- remote failures never block editing

## Chosen Stack

Frontend shell:

- `Next` stays as the app shell and UI runtime

Client local database:

- `PGlite`

Backend API:

- `Hono`

Server database:

- `Postgres`

State strategy:

- Zustand remains the view-state and optimistic interaction layer
- stores no longer call persistence functions directly
- stores depend on repository interfaces

## Why This Stack

### Why not server-first

The current app already feels fast because writes are local and optimistic. Moving note edits to a request/response backend path would make the app feel worse unless a local DB still owns the interaction path.

### Why `PGlite`

The current IndexedDB object-store model is enough for basic persistence, but the app is already growing into richer domains:

- notes
- folders
- journal entries
- tags
- favorites
- recents
- projects
- preferences
- future sync metadata

These are easier to query, migrate, and sync when they live in a relational local store.

### Why `Hono`

For this app, `Hono` is the best backend fit because it is:

- lightweight
- portable across Node/Bun/edge
- simple for route-based sync APIs
- less framework-heavy than turning Next route handlers into the long-term data backend

`Elysia` is a valid option if the backend is guaranteed to stay Bun-only. This plan chooses `Hono` because it gives more deployment flexibility while staying fast.

## Current State

### Existing persistence

Current persistence is shaped around:

- `src/core/shared/persistence-types.ts`
- `src/core/storage/*`
- `src/core/notes/*`
- `src/core/folders/*`
- `src/core/journal/*`
- `src/store/notes-store.ts`
- `src/features/journal/store.ts`

### Existing persistent entities

Already modeled:

- notes
- folders
- journal entries
- journal tags
- preferences

Persisted stores currently defined:

- `notes`
- `folders`
- `journalEntries`
- `tags`
- `preferences`

### Existing local-only sidebar state

Currently sidebar domain data is stored outside the persistence contract:

- favorites
- recents
- projects
- custom sections

These must become first-class local DB records before sync can be correct.

## Product Rules

These are non-negotiable.

### Rule 1: Local commit first

Every create/update/delete flow must do this order:

1. mutate in-memory Zustand state
2. commit to local DB
3. enqueue sync operation
4. flush in background

### Rule 2: Saved and synced are different

UI state must distinguish:

- saved locally
- syncing
- sync error

Do not reuse the current save badge as if it means cloud persistence.

### Rule 3: Deletes are tombstones

No synced entity should be hard deleted immediately.

Use:

- `deleted_at`
- `version`
- `updated_at`

This is required for cross-device reconciliation.

### Rule 4: No network on typing path

Typing, selection, sidebar toggles, navigation, and document creation must never wait on the backend.

### Rule 5: Start simple on conflict handling

Use last-write-wins first for:

- folders
- projects
- recents
- favorites
- preferences
- tags

Use whole-document last-write-wins first for:

- notes
- journal entries

If data is overwritten remotely, preserve the previous local version as a conflict copy rather than blocking sync.

## Target Repo Shape

This repo is currently a single Next app. The lowest-risk path is:

### Phase 1 repo shape

Keep one app, add Hono under Next API entrypoint:

```text
src/
  app/
    api/
      [[...route]]/
        route.ts
  server/
    api/
      app.ts
      routes/
        auth.ts
        sync.ts
        snapshot.ts
        search.ts
      services/
        sync-service.ts
      db/
        schema.ts
```

### Phase 2 repo shape

When sync is stable, extract API into a separate workspace:

```text
apps/
  web/
  api/
packages/
  contracts/
  persistence/
  sync-engine/
```

This spec is written so Phase 1 works now without forcing a monorepo migration first.

## Execution Tracks

This work can be run in parallel across four tracks.

### Track A: Local DB and migration

Deliverables:

- `PGlite` schema
- migration from current IndexedDB records
- local repository implementations

### Track B: Frontend data boundaries

Deliverables:

- repository interfaces
- stores no longer calling persistence helpers directly
- save-state split into local save and sync state

### Track C: Sync engine

Deliverables:

- local operation queue
- push/pull worker
- retry rules
- conflict recording

### Track D: Hono backend

Deliverables:

- auth/session endpoints
- push/pull endpoints
- snapshot endpoint
- server-side Postgres schema

## Local Database Schema

The local DB must cover current entities plus sync infrastructure.

### Core entities

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content_md TEXT NOT NULL,
  content_rich_json TEXT NOT NULL,
  preferred_editor_mode TEXT NOT NULL CHECK (preferred_editor_mode IN ('raw', 'block')),
  parent_folder_id TEXT REFERENCES folders(id),
  journal_meta_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  last_modified_by_device_id TEXT NOT NULL
);

CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_folder_id TEXT REFERENCES folders(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  last_modified_by_device_id TEXT NOT NULL
);

CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY,
  date_key TEXT NOT NULL UNIQUE,
  content_md TEXT NOT NULL,
  mood TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  last_modified_by_device_id TEXT NOT NULL
);

CREATE TABLE journal_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  last_modified_by_device_id TEXT NOT NULL
);

CREATE TABLE journal_entry_tags (
  entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES journal_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);
```

### Sidebar entities

```sql
CREATE TABLE sidebar_sections (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  is_collapsed INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL,
  custom_config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  last_modified_by_device_id TEXT NOT NULL
);

CREATE TABLE favorites (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('file', 'folder')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  last_modified_by_device_id TEXT NOT NULL
);

CREATE TABLE recents (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('file', 'folder')),
  accessed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  last_modified_by_device_id TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL,
  icon TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  last_modified_by_device_id TEXT NOT NULL
);

CREATE TABLE project_items (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('file', 'folder')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, item_id, item_type)
);

CREATE TABLE preferences (
  id TEXT PRIMARY KEY,
  editor_default_mode_raw INTEGER NOT NULL DEFAULT 0,
  template_style TEXT NOT NULL,
  diary_mode_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  last_modified_by_device_id TEXT NOT NULL
);
```

### Sync entities

```sql
CREATE TABLE sync_operations (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op_type TEXT NOT NULL CHECK (op_type IN ('upsert', 'delete')),
  payload_json TEXT NOT NULL,
  entity_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'failed', 'acked')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE TABLE sync_state (
  singleton_key TEXT PRIMARY KEY CHECK (singleton_key = 'default'),
  user_id TEXT,
  device_id TEXT NOT NULL,
  last_pulled_cursor TEXT,
  last_pushed_at TEXT,
  last_pulled_at TEXT,
  last_sync_error TEXT
);

CREATE TABLE conflicted_documents (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_payload_json TEXT NOT NULL,
  remote_payload_json TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('pending', 'accepted_local', 'accepted_remote'))
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  app_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Required indexes

```sql
CREATE INDEX idx_notes_parent_folder_id ON notes(parent_folder_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_folders_parent_folder_id ON folders(parent_folder_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_journal_entries_date_key ON journal_entries(date_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_favorites_item ON favorites(item_type, item_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recents_accessed_at ON recents(accessed_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_updated_at ON projects(updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_sync_operations_status_created_at ON sync_operations(status, created_at);
```

## Server Database Schema

The server DB mirrors synced entities.

Difference from local DB:

- no UI-only ephemeral fields
- includes `user_id`
- stores global sync cursor ordering

Each synced table should include:

- `user_id`
- `id`
- `version`
- `updated_at`
- `deleted_at`
- `last_modified_by_device_id`

Also add:

```sql
CREATE TABLE sync_events (
  sequence BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  entity_version INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_modified_by_device_id TEXT NOT NULL
);
```

`sync_events.sequence` is the pull cursor.

## Canonical Domain Contracts

### Shared metadata contract

Every synced entity must expose:

```ts
type SyncMetadata = {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  lastModifiedByDeviceId: string;
};
```

### Operation contract

```ts
type SyncOperation<TPayload = unknown> = {
  id: string;
  entityType:
    | "note"
    | "folder"
    | "journalEntry"
    | "journalTag"
    | "favorite"
    | "recent"
    | "project"
    | "projectItem"
    | "sidebarSection"
    | "preference";
  entityId: string;
  opType: "upsert" | "delete";
  payload: TPayload;
  entityVersion: number;
  createdAt: string;
  idempotencyKey: string;
};
```

### Change envelope contract

```ts
type RemoteChange<TPayload = unknown> = {
  cursor: string;
  entityType: SyncOperation["entityType"];
  entityId: string;
  opType: "upsert" | "delete";
  payload: TPayload;
  entityVersion: number;
  updatedAt: string;
  lastModifiedByDeviceId: string;
};
```

## Frontend Repository Interfaces

Stores should depend on interfaces like these.

### Notes repository

```ts
export interface NotesRepository {
  listNotes(): Promise<NoteFile[]>;
  getNoteById(id: string): Promise<NoteFile | null>;
  createNote(input: CreateNoteInput): Promise<NoteFile>;
  updateNote(input: UpdateNoteInput): Promise<NoteFile>;
  deleteNote(id: string): Promise<void>;
  applyRemoteNoteChanges(changes: RemoteChange[]): Promise<void>;
}
```

### Folders repository

```ts
export interface FoldersRepository {
  listFolders(): Promise<NoteFolder[]>;
  createFolder(input: CreateFolderInput): Promise<NoteFolder>;
  updateFolder(input: UpdateFolderInput): Promise<NoteFolder>;
  deleteFolder(id: string): Promise<void>;
  applyRemoteFolderChanges(changes: RemoteChange[]): Promise<void>;
}
```

### Journal repository

```ts
export interface JournalRepository {
  listEntries(): Promise<JournalEntry[]>;
  listTags(): Promise<JournalTag[]>;
  createOrUpdateEntry(input: UpsertJournalEntryInput): Promise<JournalEntry>;
  deleteEntry(id: string): Promise<void>;
  createTag(input: CreateJournalTagInput): Promise<JournalTag>;
  deleteTag(id: string): Promise<void>;
  applyRemoteJournalChanges(changes: RemoteChange[]): Promise<void>;
}
```

### Sidebar repository

```ts
export interface SidebarRepository {
  getConfig(): Promise<SidebarConfig>;
  upsertFavorite(input: FavoriteInput): Promise<void>;
  removeFavorite(id: string): Promise<void>;
  upsertRecent(input: RecentInput): Promise<void>;
  upsertProject(input: ProjectInput): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  updateSections(input: SidebarSectionsUpdate): Promise<void>;
  applyRemoteSidebarChanges(changes: RemoteChange[]): Promise<void>;
}
```

### Sync repository

```ts
export interface SyncQueueRepository {
  enqueue(operation: SyncOperation): Promise<void>;
  markProcessing(ids: string[]): Promise<void>;
  markAcked(ids: string[]): Promise<void>;
  markFailed(ids: string[], error: string): Promise<void>;
  listPending(limit: number): Promise<SyncOperation[]>;
  getSyncState(): Promise<LocalSyncState>;
  updateSyncState(input: Partial<LocalSyncState>): Promise<void>;
}
```

## Store Refactor Rule

Current anti-pattern:

- `notes-store.ts` imports persistence actions directly
- `journal/store.ts` imports persistence actions directly

Target pattern:

- store imports repository factory or repository context
- store performs optimistic state mutation
- repository writes local DB
- sync queue gets appended by repository or sync orchestrator

No UI store should know if the persistence target is IndexedDB, `PGlite`, or remote.

## Sync Engine

The sync engine is a client service, not a UI component.

### Responsibilities

- flush pending operations
- poll/pull remote changes
- apply remote changes into local DB
- update sync state
- retry failures with backoff
- skip sync when offline

### Flush triggers

- app startup after hydration
- `visibilitychange` to visible
- `online` event
- every 5 to 10 seconds while app is visible and authenticated
- explicit manual retry from UI later

### Push algorithm

1. read pending ops ordered by `created_at`
2. mark selected ops as `processing`
3. send to `POST /sync/push`
4. if success, mark as `acked`
5. if failure, mark as `failed` and increase `retry_count`

### Pull algorithm

1. read local `last_pulled_cursor`
2. request `GET /sync/pull?cursor=...`
3. apply changes transactionally to local DB
4. update `last_pulled_cursor`

### Retry strategy

- immediate retry on reconnect
- exponential backoff by queue batch
- stop retrying after repeated auth failures until session refresh

### Conflict handling

If remote change version is newer than local unsynced state:

- preserve local payload in `conflicted_documents`
- apply remote canonical row
- surface a conflict badge later

Do not block pull because of one conflict.

## API Contracts

### `POST /auth/session`

Purpose:

- create or refresh user session
- return `userId`, `deviceId`, and sync eligibility

Response:

```json
{
  "user": { "id": "usr_123", "email": "user@example.com" },
  "device": { "id": "dev_123" }
}
```

### `POST /devices/register`

Body:

```json
{
  "deviceId": "dev_123",
  "platform": "web",
  "appVersion": "0.1.0"
}
```

### `POST /sync/push`

Body:

```json
{
  "deviceId": "dev_123",
  "operations": [
    {
      "id": "op_123",
      "entityType": "note",
      "entityId": "note_123",
      "opType": "upsert",
      "entityVersion": 4,
      "payload": {
        "id": "note_123",
        "name": "README.md",
        "contentMd": "# README",
        "contentRichJson": [],
        "preferredEditorMode": "block",
        "parentFolderId": null,
        "journalMetaJson": null,
        "createdAt": "2026-03-16T12:00:00.000Z",
        "updatedAt": "2026-03-16T12:00:03.000Z",
        "deletedAt": null,
        "lastModifiedByDeviceId": "dev_123"
      },
      "createdAt": "2026-03-16T12:00:03.100Z",
      "idempotencyKey": "dev_123:op_123"
    }
  ]
}
```

Response:

```json
{
  "ackedOperationIds": ["op_123"],
  "serverCursor": "1842"
}
```

### `GET /sync/pull`

Query:

- `cursor`
- `deviceId`

Response:

```json
{
  "cursor": "1845",
  "changes": [
    {
      "cursor": "1843",
      "entityType": "note",
      "entityId": "note_999",
      "opType": "upsert",
      "entityVersion": 8,
      "payload": {
        "id": "note_999",
        "name": "Ideas.md",
        "contentMd": "# Ideas",
        "contentRichJson": [],
        "preferredEditorMode": "block",
        "parentFolderId": null,
        "journalMetaJson": null,
        "createdAt": "2026-03-15T10:00:00.000Z",
        "updatedAt": "2026-03-16T12:01:10.000Z",
        "deletedAt": null,
        "lastModifiedByDeviceId": "dev_other"
      },
      "updatedAt": "2026-03-16T12:01:10.000Z",
      "lastModifiedByDeviceId": "dev_other"
    }
  ]
}
```

### `GET /snapshot`

Purpose:

- bootstrap a new device
- restore local DB after reinstall

Response:

```json
{
  "snapshotVersion": 1,
  "takenAt": "2026-03-16T12:05:00.000Z",
  "data": {
    "notes": [],
    "folders": [],
    "journalEntries": [],
    "journalTags": [],
    "favorites": [],
    "recents": [],
    "projects": [],
    "projectItems": [],
    "sidebarSections": [],
    "preferences": []
  },
  "cursor": "2001"
}
```

### `GET /search`

Phase 1:

- optional
- can be omitted until sync is stable

If implemented:

- search current user’s data on the server
- intended for cross-device/global results only

Local-first search should still remain primary in the app.

## Hono App Layout

Recommended Phase 1 file structure:

```text
src/server/api/
  app.ts
  context.ts
  routes/
    auth.ts
    devices.ts
    sync.ts
    snapshot.ts
    search.ts
  services/
    sync-service.ts
    snapshot-service.ts
    auth-service.ts
  db/
    client.ts
    schema.ts
```

### `src/server/api/app.ts`

Responsibilities:

- create Hono app
- register middleware
- mount routes

### `src/app/api/[[...route]]/route.ts`

Responsibilities:

- adapt Next request handling into Hono runtime
- temporary Phase 1 bridge

## Frontend Integration Plan

### Step 1: Add persistence boundaries

Create:

```text
src/core/persistence/
  repositories/
    notes-repository.ts
    folders-repository.ts
    journal-repository.ts
    sidebar-repository.ts
    preferences-repository.ts
    sync-queue-repository.ts
  adapters/
    indexeddb/
    pglite/
```

Initially:

- `indexeddb` adapter wraps the current storage layer
- behavior remains unchanged

This step is required before any `PGlite` migration.

### Step 2: Add local sync tables and service

Create:

```text
src/core/sync/
  sync-engine.ts
  sync-worker.ts
  sync-status.ts
  conflict-store.ts
  contracts.ts
```

### Step 3: Replace store persistence calls

Refactor:

- `src/store/notes-store.ts`
- `src/features/journal/store.ts`
- `src/modules/sidebar/store.ts`
- `src/store/preferences-store.ts`

So they call repositories instead of direct persistence helpers.

### Step 4: Migrate local DB to PGlite

Migration behavior:

1. detect existing IndexedDB data
2. create `PGlite` schema if not present
3. import IndexedDB records
4. set migration marker
5. continue using `PGlite`

Do not attempt two-way compatibility long-term.

### Step 5: Add Hono sync endpoints

Start with:

- auth/session stub
- push
- pull
- snapshot

Do not build realtime yet.

## Save State Model

Current save model is too narrow for sync.

Replace with:

```ts
type DocumentPersistenceState =
  | "idle"
  | "saving-local"
  | "saved-local"
  | "syncing"
  | "synced"
  | "local-error"
  | "sync-error";
```

UI behavior:

- typing success shows `saved locally`
- queue flush shows `syncing`
- successful push/pull shows `synced`
- backend issue shows `sync error`

## Search Strategy

### Phase 1

Local search only.

Implement FTS against local `PGlite`:

- notes name
- notes content
- journal content
- tags

### Phase 2

Server search:

- only for cross-device or shared-account search
- not required for instant UX

## Security and Auth

Phase 1 auth can be minimal:

- session cookie
- authenticated API routes
- per-user scoped records

Phase 2:

- device registration
- token refresh
- encrypted snapshot export if required

## Exact Rollout Plan

### Phase 0: Preparation

Tasks:

- keep current app behavior stable
- add backend spec doc
- add repository interface package/folder

Exit criteria:

- no store imports `core/storage/*` directly except adapter implementations

### Phase 1: Repository boundary

Tasks:

- add interfaces
- wrap current IndexedDB implementation
- move notes/journal/sidebar/preferences stores to interfaces

Exit criteria:

- app behavior unchanged
- stores are persistence-backend agnostic

### Phase 2: Sidebar persistence completion

Tasks:

- move favorites/recents/projects/sidebar sections into persistence layer
- hydrate them from repository instead of pure Zustand persist middleware

Exit criteria:

- all durable user data is in one persistence system

### Phase 3: PGlite local DB

Tasks:

- add `PGlite`
- create SQL schema
- write migration from IndexedDB
- switch repositories from IndexedDB adapter to `PGlite` adapter

Exit criteria:

- app boots from `PGlite`
- IndexedDB migration runs once

### Phase 4: Sync queue

Tasks:

- create `sync_operations`
- enqueue on every mutating repository call
- background sync engine stub with no backend yet

Exit criteria:

- queue is populated
- UI exposes local save vs sync state

### Phase 5: Hono API in Next

Tasks:

- add Hono router
- add `push`, `pull`, `snapshot`
- add auth/session boundary
- add Postgres schema

Exit criteria:

- client can push queued ops and pull remote changes

### Phase 6: Conflict fallback

Tasks:

- create `conflicted_documents`
- preserve overwritten local payloads
- add minimal conflict indicator UI

Exit criteria:

- sync never silently drops user content

### Phase 7: Optional extraction

Tasks:

- move API out of Next into `apps/api`

Exit criteria:

- no app behavior change

## Package Additions

### Client

Expected additions:

- `@electric-sql/pglite`
- optional `@electric-sql/pglite-worker`
- optional FTS helper libs only if needed

### Server

Expected additions:

- `hono`
- `zod`
- `postgres` or `drizzle-orm` + Postgres driver

Recommended server DB layer:

- `drizzle-orm` with Postgres

This keeps schema definition explicit and TypeScript-friendly.

## Do Not Do

- do not make note typing call the backend
- do not block create/update/delete on network success
- do not introduce CRDTs for every entity
- do not leave sidebar data outside the canonical persistence layer
- do not treat `saved` and `synced` as the same state
- do not migrate to backend-first before repository boundaries exist

## First Implementation Tickets

If work starts immediately, the first tickets should be:

1. Add repository interfaces for notes, folders, journal, sidebar, preferences, and sync queue.
2. Implement IndexedDB-backed repository adapters around the current persistence code.
3. Refactor `notes-store.ts` to use repositories instead of direct persistence calls.
4. Refactor `journal/store.ts` to use repositories instead of direct persistence calls.
5. Move sidebar durable state into the persistence layer.
6. Add `PGlite` schema and one-way IndexedDB migration.
7. Add sync queue tables and enqueue on every mutating repository call.
8. Add Hono app mounted under Next API.
9. Implement `/sync/push` and `/sync/pull`.
10. Split save UI into local-save and sync states.

## Success Criteria

This migration is successful when:

- the app still feels immediate offline
- all edits are committed locally before network
- a second device can receive synced changes
- sync failures never block editing
- no user content is silently lost on conflict
- stores are no longer persistence-implementation aware
