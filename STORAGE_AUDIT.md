# Storage Architecture Audit & Drizzle + Turso Implementation Plan

## Current Architecture Analysis

### Storage Adapter Pattern
The application uses a well-structured adapter pattern with:
- **StorageAdapter Interface** (`client/shared/storage/types/index.ts`)
  - Defines contract for all storage implementations
  - Supports lifecycle methods (initialize, destroy)
  - CRUD operations for Notes and Folders
  - Event system for storage changes
  - Batch operations support

### Current Implementations

1. **LocalStorageAdapter** (`client/shared/storage/implementations/LocalStorageAdapter.ts`)
   - ✅ Fully implemented
   - Stores entire data structure as JSON in localStorage
   - **Limitations:**
     - No query capabilities (loads entire dataset)
     - Performance degrades with large datasets
     - No indexing
     - Synchronous operations only
     - Size limitations (~5-10MB)

2. **ElectricSQLAdapter** (`client/shared/storage/implementations/ElectricSQLAdapter.ts`)
   - ⚠️ Partially implemented (placeholder)
   - Uses ElectricSQL for sync
   - **Issues:**
     - Schema generation incomplete
     - Complex setup requirements
     - Not optimized for local-first performance

### Data Model

**Notes:**
```typescript
interface Note {
  id: string;
  name: string;
  content: Block[]; // BlockNote blocks (JSON)
  createdAt: number;
  updatedAt: number;
  type: 'note';
}
```

**Folders:**
```typescript
interface Folder {
  id: string;
  name: string;
  type: 'folder';
  children: (Note | Folder)[];
  createdAt: number;
  updatedAt: number;
}
```

**Hierarchical Structure:**
- Folders can contain Notes and other Folders
- Currently stored as nested JSON structure
- Requires recursive traversal for operations

### Usage Patterns

1. **Primary Hook:** `useNotes()` in `client/features/notes/hooks/useNotes.ts`
   - Fetches all items on mount
   - Provides CRUD operations
   - Manually refreshes after mutations

2. **Storage Factory:** `client/shared/storage/StorageFactory.ts`
   - Singleton pattern
   - Registry-based adapter creation
   - Currently only registers `localStorage` adapter

3. **Configuration:** `client/app/storage/config.ts`
   - Environment-based adapter selection
   - Already has `drizzle-turso` in valid adapters list
   - Ready for implementation

## Drizzle ORM + Turso SQLite Implementation Strategy

### Technology Stack

**Core Libraries:**
- `drizzle-orm` - Type-safe ORM
- `@libsql/client` - Turso/libSQL client with WASM support for browser
- `drizzle-kit` - Migration and schema generation tool

**Why This Stack:**
1. **Local-First:** `@libsql/client` supports local SQLite files via WASM
2. **Blazing Fast:** Direct SQLite access, no network overhead for local operations
3. **Optional Sync:** Can sync with Turso cloud when online
4. **Type Safety:** Drizzle provides full TypeScript type inference
5. **Query Performance:** Proper indexing and SQL queries vs JSON parsing

### Architecture Design

#### Database Schema

```sql
-- Notes table
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL, -- JSON stringified Block[]
  folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Folders table
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_notes_folder_id ON notes(folder_id);
CREATE INDEX idx_folders_parent_id ON folders(parent_id);
CREATE INDEX idx_notes_updated_at ON notes(updated_at DESC);
CREATE INDEX idx_folders_updated_at ON folders(updated_at DESC);
```

#### Local-First Strategy

1. **Primary Storage:** Local SQLite file (via libSQL WASM)
   - Stored in browser IndexedDB or File System Access API
   - All queries/mutations hit local DB first
   - Zero network latency for local operations

2. **Optional Sync:** Turso cloud sync
   - Background sync when online
   - Conflict resolution strategy
   - Can be disabled for pure local mode

3. **Performance Optimizations:**
   - Indexes on frequently queried columns
   - Batch operations in transactions
   - Prepared statements for repeated queries
   - Connection pooling (single connection for browser)

### Implementation Plan

#### Phase 1: Setup & Schema
1. Install dependencies
2. Create Drizzle schema definitions
3. Set up migration system
4. Create database initialization

#### Phase 2: Adapter Implementation
1. Implement `DrizzleTursoAdapter` class
2. Map database schema to application types
3. Implement all StorageAdapter methods
4. Add event system integration

#### Phase 3: Integration
1. Register adapter in StorageFactory
2. Update configuration
3. Test with existing UI components
4. Performance testing

#### Phase 4: Optimization
1. Add query optimizations
2. Implement batch operations
3. Add connection pooling
4. Performance benchmarking

## Migration Strategy

Since you mentioned no backwards compatibility needed:
- **Clean Slate:** New adapter starts fresh
- **No Migration:** Old localStorage data not migrated
- **Default Data:** Can seed with default README note if needed

## Performance Expectations

**Current (localStorage):**
- Load all items: ~50-200ms (depends on data size)
- Create note: ~10-50ms
- Update note: ~20-100ms (full JSON rewrite)
- Query by ID: O(n) - must scan all items

**Target (Drizzle + SQLite):**
- Load all items: ~5-20ms (with indexes)
- Create note: ~1-5ms (direct insert)
- Update note: ~1-5ms (targeted update)
- Query by ID: O(log n) - indexed lookup

**Expected Improvement:** 5-10x faster for most operations

## Next Steps

1. ✅ Audit complete
2. ⏭️ Install dependencies
3. ⏭️ Create schema
4. ⏭️ Implement adapter
5. ⏭️ Test integration
6. ⏭️ Remove localStorage adapter (optional)

