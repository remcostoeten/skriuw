# CRUD Layer Architecture

This document explains how the CRUD (Create, Read, Update, Delete) layer works in Skriuw, providing a clean abstraction over different storage backends.

## Overview

The CRUD layer is a **generic storage abstraction** that allows the application to work with any storage backend (localStorage, database, API, etc.) through a unified interface. This separation of concerns makes it easy to swap storage implementations without changing business logic.

## Architecture Layers

```
Business Logic (Features)
  ↓
CRUD Functions (lib/storage/crud/)
  ↓
Generic Storage Factory (lib/storage/generic-storage-factory.ts)
  ↓
Storage Adapter (lib/storage/adapters/)
  ↓
Actual Storage (API Routes → Database)
```

## CRUD Functions

Located in `lib/storage/crud/`, these are the main entry points for all storage operations:

### `read.ts` - Reading Data

```typescript
read<T>(storageKey: string, options?: ReadOptions<T>): Promise<T[] | T | undefined>
```

**Options:**

- `getById?: string` - Get a single entity by ID
- `filter?: (item: T) => boolean` - Filter results
- `sort?: (a: T, b: T) => number` - Sort results
- `getAll?: boolean` - Get all items

**Example:**

```typescript
// Get all notes
const allNotes = await read<Note>('Skriuw_notes')

// Get single note by ID
const note = await read<Note>('Skriuw_notes', { getById: 'note-123' })

// Filter and sort
const pinnedNotes = await read<Note>('Skriuw_notes', {
	filter: (note) => note.pinned === true,
	sort: (a, b) => a.updatedAt - b.updatedAt
})
```

### `create.ts` - Creating Data

```typescript
create<T>(storageKey: string, data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<T>
```

**Features:**

- Auto-generates `id`, `createdAt`, `updatedAt` if not provided
- Returns the created entity with all fields populated

**Example:**

```typescript
const newNote = await create<Note>('Skriuw_notes', {
	name: 'My Note',
	content: [],
	type: 'note'
})
// Returns: { id: 'note-123', name: 'My Note', createdAt: 1234567890, ... }
```

### `update.ts` - Updating Data

```typescript
update<T>(storageKey: string, id: string, data: Partial<T>): Promise<T | undefined>
```

**Features:**

- Partial updates (only send fields that changed)
- Auto-updates `updatedAt` timestamp
- Returns updated entity or `undefined` if not found

**Example:**

```typescript
const updated = await update<Note>('Skriuw_notes', 'note-123', {
	name: 'Updated Name',
	pinned: true
})
```

### `destroy.ts` - Deleting Data

```typescript
destroy(storageKey: string, id: string, options?: DestroyOptions): Promise<boolean>
```

**Options:**

- `recursive?: boolean` - Delete children recursively (for folders)

**Example:**

```typescript
const deleted = await destroy('Skriuw_notes', 'note-123')
// Returns: true if deleted, false if not found
```

### `move.ts` - Moving Entities

```typescript
move(storageKey: string, entityId: string, targetParentId: string | null): Promise<boolean>
```

**Purpose:**

- Moves notes/folders to different parent folders
- `targetParentId: null` moves to root level

**Example:**

```typescript
// Move note to folder
await move('Skriuw_notes', 'note-123', 'folder-456')

// Move to root
await move('Skriuw_notes', 'note-123', null)
```

## Storage Adapter Pattern

The CRUD functions delegate to a **Generic Storage Adapter** which implements the actual storage logic.

### Generic Storage Factory

`lib/storage/generic-storage-factory.ts` manages adapter lifecycle:

- **`initializeGenericStorage(config)`** - Initialize adapter on app startup
- **`getGenericStorage()`** - Get current adapter instance
- **`destroyGenericStorage()`** - Cleanup on app shutdown

### Storage Adapters

Adapters implement the `GenericStorageAdapter` interface:

```typescript
interface GenericStorageAdapter {
  name: string
  type: 'local' | 'remote' | 'hybrid'

  create<T>(storageKey: string, data: ...): Promise<T>
  read<T>(storageKey: string, options?: ReadOptions): Promise<T[] | T | undefined>
  update<T>(storageKey: string, id: string, data: Partial<T>): Promise<T | undefined>
  delete(storageKey: string, id: string): Promise<boolean>
  move<T>(storageKey: string, entityId: string, targetParentId: string | null): Promise<boolean>
  // ... lifecycle methods
}
```

### Current Adapter: `serverless-api`

Located in `lib/storage/adapters/serverless-api.ts`, this adapter:

1. **Makes HTTP requests** to Next.js API routes
2. **Maps storage keys to API endpoints:**
    - `Skriuw_notes` → `/api/notes`
    - `Skriuw_settings` → `/api/settings`
    - `Skriuw_shortcuts` → `/api/shortcuts`

3. **Handles CRUD operations:**
    - `create` → `POST /api/notes`
    - `read` → `GET /api/notes` or `GET /api/notes?id=...`
    - `update` → `PUT /api/notes`
    - `delete` → `DELETE /api/notes`
    - `move` → `PUT /api/notes` (with move operation)

4. **Emits events** for real-time updates (via event listeners)

## Data Flow Example

### Creating a Note

```
1. Feature calls: createNote({ name: 'My Note' })
   ↓
2. createNote() calls: create('Skriuw_notes', { name: 'My Note' })
   ↓
3. create() calls: getGenericStorage().create('Skriuw_notes', ...)
   ↓
4. serverless-api adapter: POST /api/notes { name: 'My Note' }
   ↓
5. API route: db.insert(notes).values({ name: 'My Note', ... })
   ↓
6. Database: INSERT INTO notes ...
   ↓
7. Response flows back up the chain
```

### Reading Notes

```
1. Feature calls: getItems()
   ↓
2. getItems() calls: read('Skriuw_notes')
   ↓
3. read() calls: getGenericStorage().read('Skriuw_notes')
   ↓
4. serverless-api adapter: GET /api/notes
   ↓
5. API route: db.select().from(notes)
   ↓
6. Database: SELECT * FROM notes
   ↓
7. Response: Array of notes flows back
```

## Storage Keys

Storage keys identify different data types:

- **`Skriuw_notes`** - Notes and folders
- **`Skriuw_settings`** - User settings
- **`Skriuw_shortcuts`** - Keyboard shortcuts

These keys are constants defined in the adapter and mapped to specific API endpoints.

## Benefits of This Architecture

1. **Separation of Concerns**
    - Business logic doesn't know about storage implementation
    - Easy to swap adapters (localStorage → database → API)

2. **Type Safety**
    - Full TypeScript support with generics
    - Type-safe CRUD operations

3. **Consistency**
    - Same API for all storage operations
    - Predictable error handling

4. **Testability**
    - Easy to mock adapters for testing
    - Can test business logic without real storage

5. **Flexibility**
    - Can add new adapters (IndexedDB, WebSQL, etc.)
    - Can support hybrid storage (local + remote sync)

## Future Adapters

The architecture supports adding new adapters:

```typescript
// Example: localStorage adapter
registerGenericStorageAdapter('localStorage', (config) => {
	return {
		create: (key, data) => {
			/* localStorage logic */
		},
		read: (key, options) => {
			/* localStorage logic */
		}
		// ... other methods
	}
})
```

## Error Handling

All CRUD functions wrap errors in descriptive messages:

```typescript
try {
	const note = await read('Skriuw_notes', { getById: 'invalid-id' })
} catch (error) {
	// Error: "Failed to read from Skriuw_notes: Entity not found"
}
```

## Event System

Adapters can emit storage events for real-time updates:

```typescript
storage.addEventListener((event) => {
	if (event.type === 'created' && event.storageKey === 'Skriuw_notes') {
		// Handle new note created
	}
})
```

## Configuration

Storage is configured in `app/storage/config.ts`:

```typescript
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
	adapter: 'serverless-api',
	options: {}
}
```

This configuration is used during app initialization in `app/storage/index.ts`.

## Summary

The CRUD layer provides a clean, type-safe abstraction over storage operations. By using the adapter pattern, the application can work with any storage backend while keeping business logic storage-agnostic. The current implementation uses a `serverless-api` adapter that makes HTTP requests to Next.js API routes, which then interact with PostgreSQL via Drizzle ORM.
