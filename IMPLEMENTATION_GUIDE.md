# Drizzle ORM + Turso SQLite Implementation Guide

## Overview

This guide explains how to use the new Drizzle ORM + Turso SQLite storage adapter for blazing-fast, local-first storage.

## Installation

Install the required dependencies:

```bash
pnpm install drizzle-orm @libsql/client
pnpm install -D drizzle-kit
```

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```env
# For local-only mode (default)
VITE_STORAGE_ADAPTER=drizzle-turso
VITE_LOCAL_DB_PATH=quantum-works.db

# For Turso sync mode (optional)
VITE_TURSO_URL=libsql://your-database.turso.io
VITE_TURSO_AUTH_TOKEN=your-auth-token
```

### Storage Configuration

The adapter is already configured in `client/app/storage/config.ts`. To use it:

1. **Local-Only Mode** (Recommended for development):
   ```env
   VITE_STORAGE_ADAPTER=drizzle-turso
   ```
   This uses a local SQLite file with no sync overhead.

2. **Turso Sync Mode** (For production with sync):
   ```env
   VITE_STORAGE_ADAPTER=drizzle-turso
   VITE_TURSO_URL=libsql://your-database.turso.io
   VITE_TURSO_AUTH_TOKEN=your-auth-token
   ```
   This syncs with Turso cloud while maintaining local-first performance.

## Database Migrations

### Generate Migrations

After modifying the schema (`client/shared/storage/drizzle/schema.ts`):

```bash
pnpm db:generate
```

This creates migration files in `client/shared/storage/drizzle/migrations/`.

### Apply Migrations

Migrations are automatically applied on first initialization. For manual migration:

```bash
pnpm db:migrate
```

### Database Studio

View and edit your database:

```bash
pnpm db:studio
```

## Usage

The adapter implements the same `StorageAdapter` interface, so no code changes are needed in your application. Simply change the environment variable:

```typescript
// In client/app/storage/config.ts
// The adapter is selected based on VITE_STORAGE_ADAPTER
```

## Performance Benefits

### Query Performance

- **Local-first**: All queries hit local SQLite first (0 network latency)
- **Indexed queries**: Proper SQL indexes for fast lookups
- **Targeted updates**: Only update changed rows, not entire dataset

### Expected Performance

| Operation | localStorage | Drizzle + SQLite | Improvement |
|-----------|--------------|------------------|-------------|
| Load all items | 50-200ms | 5-20ms | 5-10x faster |
| Create note | 10-50ms | 1-5ms | 5-10x faster |
| Update note | 20-100ms | 1-5ms | 10-20x faster |
| Query by ID | O(n) scan | O(log n) indexed | Massive |

## Architecture

### Local-First Design

1. **Primary Storage**: Local SQLite file (via libSQL WASM)
   - Stored in browser IndexedDB or File System Access API
   - Zero network latency for all operations
   - Works completely offline

2. **Optional Sync**: Turso cloud sync (when configured)
   - Background sync when online
   - Automatic conflict resolution
   - Can be disabled for pure local mode

### Database Schema

```sql
-- Notes table with indexes
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL, -- JSON stringified Block[]
  folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_notes_folder_id ON notes(folder_id);
CREATE INDEX idx_notes_updated_at ON notes(updated_at DESC);

-- Folders table with indexes
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_folders_parent_id ON folders(parent_id);
CREATE INDEX idx_folders_updated_at ON folders(updated_at DESC);
```

## Migration from localStorage

Since you mentioned no backwards compatibility needed:

1. **Clean Start**: New adapter starts with empty database
2. **Default Data**: Can seed with default README note if configured
3. **No Migration**: Old localStorage data is not migrated

To seed default data, pass `defaultItems` in adapter options (see `LocalStorageAdapter` for example default items structure).

## Troubleshooting

### Database Not Initializing

- Check browser console for errors
- Ensure `@libsql/client` is properly installed
- Verify environment variables are set correctly

### Performance Issues

- Check that indexes are created (run `pnpm db:generate` if schema changed)
- Verify you're using local mode (not syncing unnecessarily)
- Check browser DevTools Performance tab for bottlenecks

### Sync Issues (Turso)

- Verify Turso URL and auth token are correct
- Check network connectivity
- Review Turso dashboard for sync status

## Next Steps

1. ✅ Install dependencies: `pnpm install`
2. ✅ Set environment variable: `VITE_STORAGE_ADAPTER=drizzle-turso`
3. ✅ Run migrations: `pnpm db:generate` (if needed)
4. ✅ Test the application
5. ⏭️ Remove localStorage adapter (optional, if not needed)

## Removing localStorage Adapter

If you want to completely remove the localStorage adapter:

1. Delete `client/shared/storage/implementations/LocalStorageAdapter.ts`
2. Remove from `StorageFactory.ts` registry
3. Update `DEFAULT_STORAGE_CONFIG` in `client/app/storage/config.ts`
4. Remove localStorage from valid adapters list

