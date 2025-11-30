# Postgres Migration Plan

## Current State Analysis

### Complex CRUD Layer Components

The current codebase has a complex multi-adapter storage system that needs to be simplified:

#### 1. **Storage Adapter System** (`src/api/storage/`)
- **Generic Storage Factory** (`generic-storage-factory.ts`): Factory pattern managing multiple adapters
- **Three Storage Adapters**:
  - `generic-drizzle-libsql-http.ts` - LibSQL/Turso HTTP adapter for web
  - `generic-drizzle-tauri-sqlite.ts` - Tauri SQLite adapter for desktop
  - `generic-local-storage.ts` - Browser localStorage fallback
- **Generic CRUD Layer** (`crud/`):
  - `create.ts` - Generic create operations
  - `read.ts` - Generic read operations
  - `update.ts` - Generic update operations
  - `destroy.ts` - Generic delete operations
  - `move.ts` - Move operations for nested structures
- **Generic Types** (`generic-types.ts`): Complex type definitions for adapter abstraction

#### 2. **Database Configuration**
- **Drizzle Config** (`drizzle.config.ts`): Multi-target config (web/desktop) with SQLite/LibSQL
- **Base Entities** (`src/data/drizzle/base-entities.ts`): SQLite-specific schema using `sqliteTable`
- **Client** (`src/data/drizzle/client.ts`): LibSQL client wrapper

#### 3. **Storage Configuration System**
- **Storage Config** (`src/app/storage/config.ts`): Environment-based adapter selection
- **Storage Preferences**: User preference storage for adapter selection
- **Storage Onboarding**: UI for selecting storage adapters

#### 4. **Dependencies**
- `@libsql/client` - LibSQL/Turso client
- `@tauri-apps/plugin-sql` - Tauri SQLite plugin
- `drizzle-orm` with SQLite dialect

## What Needs to Be Replaced

### Files to Remove/Replace

1. **Storage Adapter System** (Remove entirely):
   - `src/api/storage/adapters/generic-drizzle-libsql-http.ts`
   - `src/api/storage/adapters/generic-drizzle-tauri-sqlite.ts`
   - `src/api/storage/adapters/generic-local-storage.ts`
   - `src/api/storage/generic-storage-factory.ts`
   - `src/api/storage/generic-types.ts` (simplify significantly)

2. **Generic CRUD Layer** (Simplify to direct Postgres queries):
   - `src/api/storage/crud/create.ts` → Replace with direct Postgres inserts
   - `src/api/storage/crud/read.ts` → Replace with direct Postgres selects
   - `src/api/storage/crud/update.ts` → Replace with direct Postgres updates
   - `src/api/storage/crud/destroy.ts` → Replace with direct Postgres deletes
   - `src/api/storage/crud/move.ts` → Replace with direct Postgres updates

3. **Database Configuration** (Update):
   - `drizzle.config.ts` → Change to Postgres dialect
   - `src/data/drizzle/base-entities.ts` → Change `sqliteTable` to `pgTable`, update column types
   - `src/data/drizzle/client.ts` → Replace LibSQL client with Postgres client

4. **Storage Configuration** (Simplify):
   - `src/app/storage/config.ts` → Remove adapter selection, just use Postgres connection string
   - `src/app/storage/preferences.ts` → Remove adapter preferences
   - `src/app/storage/adapter-utils.ts` → Remove adapter utilities

5. **Feature Files Using Adapters** (Update):
   - All files in `src/features/*/api/` that use generic storage
   - `src/features/storage-status/` - Update to show Postgres connection status
   - `src/features/storage-onboarding/` - Simplify to just Postgres connection setup

### Dependencies to Change

**Remove:**
- `@libsql/client`
- `@tauri-apps/plugin-sql`

**Add:**
- `postgres` or `pg` (Postgres client)
- Update `drizzle-orm` to use Postgres dialect

### Schema Changes Required

1. **Column Type Changes:**
   - SQLite `integer` with `mode: "number"` → Postgres `integer` or `bigint`
   - SQLite `text` → Postgres `text` or `varchar`
   - SQLite `json` stored as text → Postgres `jsonb` (native JSON support)

2. **Table Definitions:**
   - `sqliteTable` → `pgTable`
   - Update all column definitions to Postgres types
   - Update foreign key syntax if needed

3. **Migration Strategy:**
   - Generate new Drizzle migrations for Postgres
   - Data migration script if needed (if existing data exists)

## New Simplified Architecture

### Single Postgres Client
- One client file: `src/data/drizzle/client.ts`
- Direct connection to Postgres using connection string from env
- No adapter abstraction layer

### Direct CRUD Operations
- Use Drizzle ORM directly with Postgres
- Remove generic storage abstraction
- Feature-specific queries in their respective feature folders

### Simplified Configuration
- Single environment variable: `DATABASE_URL` (Postgres connection string)
- No adapter selection UI
- No storage onboarding flow (or simplified to just connection string input)

## Migration Steps

1. ✅ Document current state (this file)
2. ✅ Update `drizzle.config.ts` for Postgres
3. ✅ Update `base-entities.ts` schema to Postgres
4. ✅ Create new Postgres client
5. ✅ Remove all adapter files
6. ✅ Simplify CRUD operations - Updated notes feature to use direct Postgres
7. ✅ Update notes feature files to use direct Postgres
8. ✅ Update dependencies (package.json)
9. ⏳ Generate new migrations (run `pnpm drizzle:generate`)
10. ⏳ Test and verify

## Completed Changes

### Configuration
- ✅ `drizzle.config.ts` - Now uses Postgres with `DATABASE_URL` env var
- ✅ Removed `drizzle.config.libsql.ts` and `drizzle.config.sqlite.ts`

### Schema
- ✅ `src/data/drizzle/base-entities.ts` - Converted from SQLite to Postgres:
  - `sqliteTable` → `pgTable`
  - `integer` with `mode: "number"` → `timestamp` with `mode: "date"`
  - `text` for JSON → `jsonb` for native JSON support
  - Removed old adapter-related type definitions

### Database Client
- ✅ `src/data/drizzle/client.ts` - Replaced LibSQL client with Postgres client using `postgres` package
- ✅ Uses `DATABASE_URL` or `VITE_DATABASE_URL` environment variable

### Storage Layer
- ✅ Removed all adapter files:
  - `generic-drizzle-libsql-http.ts`
  - `generic-drizzle-tauri-sqlite.ts`
  - `generic-local-storage.ts`
  - `generic-storage-factory.ts`
- ✅ Simplified `generic-types.ts` to only export `BaseEntity`
- ✅ Updated `src/api/storage/index.ts` to remove adapter exports

### Notes Feature
- ✅ All notes API files now use direct Postgres queries:
  - `create-note.ts` → uses `createNoteRecordDb`
  - `create-folder.ts` → uses `createFolderRecordDb`
  - `update-note.ts` → uses `updateNoteRecordDb`
  - `delete-item.ts` → uses `deleteItemRecordDb`
  - `move-item.ts` → uses `moveItemRecordDb`
  - `rename-item.ts` → uses `renameItemRecordDb`
  - `get-note.ts` → uses `getNoteByIdDb`
  - `get-notes.ts` → uses `getNotesByFolderDb`
  - `get-items.ts` → uses `getNoteTreeDb`

### Dependencies
- ✅ Removed: `@libsql/client`, `@tauri-apps/plugin-sql`
- ✅ Added: `postgres` package
- ✅ Updated scripts: Simplified to `drizzle:generate`, `drizzle:migrate`, `drizzle:push`

## Remaining Work

### Other Features
- ⏳ Settings feature - May need Postgres table or direct queries
- ⏳ Shortcuts feature - May need Postgres table or direct queries
- ⏳ Storage status/onboarding UI - Needs to be updated or removed

### Environment Variables
- Set `DATABASE_URL` (or `VITE_DATABASE_URL` for client-side) to your Postgres connection string
- Format: `postgresql://user:password@host:port/database`

### Next Steps
1. Run `pnpm install` to install new dependencies
2. Set `DATABASE_URL` environment variable
3. Run `pnpm drizzle:generate` to generate migrations
4. Run `pnpm drizzle:push` or `pnpm drizzle:migrate` to apply schema
5. Test the application
6. Update or remove storage status/onboarding UI components

