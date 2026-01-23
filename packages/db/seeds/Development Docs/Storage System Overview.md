# Storage System Overview

This document explains how all the storage components work together: CRUD functions, Generic Storage Factory, and the Serverless API Adapter.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Business Logic (Features)                  │
│  (useNotes, createNote, updateNote, etc.)                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              CRUD Functions Layer                       │
│  (read.ts, create.ts, update.ts, destroy.ts, move.ts)   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Generic Storage Factory                         │
│  (generic-storage-factory.ts)                            │
│  - Adapter Registry                                     │
│  - Lifecycle Management                                 │
│  - Global Access                                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Storage Adapter (serverless-api)                │
│  (adapters/serverless-api.ts)                           │
│  - HTTP Request Handling                               │
│  - Storage Key Mapping                                  │
│  - Event Emission                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Next.js API Routes                              │
│  (app/api/notes, app/api/settings, etc.)                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Drizzle ORM                                     │
│  (lib/db/index.ts)                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         PostgreSQL on Neon                              │
└─────────────────────────────────────────────────────────┘
```

## Complete Data Flow

### Creating a Note

```
1. User Action
   ↓
2. createNote({ name: 'My Note' })
   (features/notes/api/mutations/create-note.ts)
   ↓
3. create('Skriuw_notes', { name: 'My Note', type: 'note' })
   (lib/storage/crud/create.ts)
   ↓
4. getGenericStorage()
   (lib/storage/generic-storage-factory.ts)
   ↓
5. storage.create('Skriuw_notes', data)
   (lib/storage/adapters/serverless-api.ts)
   ↓
6. POST /api/notes
   (HTTP Request)
   ↓
7. app/api/notes/route.ts → POST handler
   ↓
8. db.insert(notes).values({ name: 'My Note', ... })
   (Drizzle ORM)
   ↓
9. INSERT INTO notes ...
   (PostgreSQL)
   ↓
10. Response flows back up the chain
```

### Reading Notes

```
1. Component needs data
   ↓
2. getItems()
   (features/notes/api/queries/get-items.ts)
   ↓
3. read('Skriuw_notes')
   (lib/storage/crud/read.ts)
   ↓
4. getGenericStorage().read('Skriuw_notes')
   ↓
5. GET /api/notes
   (HTTP Request)
   ↓
6. app/api/notes/route.ts → GET handler
   ↓
7. db.select().from(notes)
   (Drizzle ORM)
   ↓
8. SELECT * FROM notes
   (PostgreSQL)
   ↓
9. Response: Array of notes
   ↓
10. Data flows back to component
```

## Component Responsibilities

### CRUD Functions (`lib/storage/crud/`)

**Purpose:** Provide a simple, type-safe API for storage operations

**Responsibilities:**

- Get current adapter from factory
- Call adapter methods
- Wrap errors with context
- Provide consistent API

**Example:**

```typescript
export async function read<T>(storageKey: string, options?: ReadOptions<T>) {
	const storage = getGenericStorage() // Get adapter
	return await storage.read<T>(storageKey, options) // Delegate to adapter
}
```

### Generic Storage Factory (`lib/storage/generic-storage-factory.ts`)

**Purpose:** Manage adapter lifecycle and provide global access

**Responsibilities:**

- Register adapter factories
- Create adapter instances
- Initialize/destroy adapters
- Provide singleton access

**Key Functions:**

- `createGenericStorageAdapter()` - Create adapter from config
- `initializeGenericStorage()` - Initialize and store globally
- `getGenericStorage()` - Get current adapter
- `registerGenericStorageAdapter()` - Add new adapters

### Serverless API Adapter (`lib/storage/adapters/serverless-api.ts`)

**Purpose:** Implement storage operations via HTTP requests

**Responsibilities:**

- Map storage keys to API endpoints
- Make HTTP requests
- Handle responses and errors
- Emit storage events
- Provide storage info

**Key Features:**

- Storage key → API endpoint mapping
- Error handling and parsing
- Event system for real-time updates
- Health checks

## Storage Key System

Storage keys identify different data types and map to API endpoints:

| Storage Key                      | API Endpoint     | Data Type          |
| -------------------------------- | ---------------- | ------------------ |
| `Skriuw_notes`                   | `/api/notes`     | Notes and folders  |
| `app:settings`                   | `/api/settings`  | User settings      |
| `quantum-works:shortcuts:custom` | `/api/shortcuts` | Keyboard shortcuts |

**Why Storage Keys?**

- Abstraction: Business logic doesn't know about API endpoints
- Flexibility: Easy to change endpoints without changing business logic
- Consistency: Same pattern for all data types

## Initialization Sequence

```
App Startup
  ↓
app/providers.tsx → StorageInitializer
  ↓
initializeAppStorage()
  (app/storage/index.ts)
  ↓
initializeGenericStorage(DEFAULT_STORAGE_CONFIG)
  (generic-storage-factory.ts)
  ↓
createGenericStorageAdapter(config)
  ↓
createServerlessApiAdapter()
  (adapters/serverless-api.ts)
  ↓
adapter.initialize()
  (Tests API connection)
  ↓
Storage ready!
```

## Configuration Flow

```
app/storage/config.ts
  ↓
DEFAULT_STORAGE_CONFIG = {
  adapter: "serverless-api",
  options: {}
}
  ↓
app/storage/index.ts
  ↓
initializeGenericStorage(DEFAULT_STORAGE_CONFIG)
  ↓
Factory creates adapter with config
```

## Error Propagation

Errors flow up through the layers:

```
PostgreSQL Error
  ↓
Drizzle ORM wraps error
  ↓
API Route catches and formats
  ↓
HTTP Response with error
  ↓
Adapter parses error
  ↓
CRUD function wraps with context
  ↓
Business logic handles error
```

**Example:**

```typescript
// Database error
throw new Error('Connection failed')

// API route
return NextResponse.json({ error: 'Connection failed' }, { status: 500 })

// Adapter
throw new Error('API error: 500 - Connection failed')

// CRUD function
throw new Error('Failed to read from Skriuw_notes: API error: 500 - Connection failed')

// Business logic
catch (error) {
  console.error('Failed to load notes:', error.message)
}
```

## Event System

Events flow from adapter to listeners:

```
Adapter Operation (create/update/delete)
  ↓
emit({ type: 'created', storageKey: '...', entityId: '...', data: ... })
  ↓
All registered listeners called
  ↓
Components can react to changes
```

**Example:**

```typescript
// Register listener
adapter.addEventListener((event) => {
	if (event.type === 'created' && event.storageKey === 'Skriuw_notes') {
		// Refresh notes list
		refreshNotes()
	}
})

// Create note
await create('Skriuw_notes', { name: 'New Note' })
// → Event emitted
// → Listener called
// → Notes list refreshed
```

## Type Safety Flow

TypeScript types flow through all layers:

```
BaseEntity (generic-types.ts)
  ↓
Note extends BaseEntity (features/notes/types)
  ↓
read<Note>('Skriuw_notes')
  ↓
storage.read<Note>('Skriuw_notes')
  ↓
Promise<Note[] | Note | undefined>
```

**Benefits:**

- Compile-time type checking
- IntelliSense support
- Refactoring safety

## Adding a New Storage Type

To add a new storage type (e.g., tasks):

1. **Create API Route**

    ```typescript
    // app/api/tasks/route.ts
    export async function GET() { ... }
    export async function POST() { ... }
    ```

2. **Add Storage Key**

    ```typescript
    // adapters/serverless-api.ts
    const TASKS_STORAGE_KEY = 'Skriuw_tasks'
    ```

3. **Map in Adapter**

    ```typescript
    if (storageKey === TASKS_STORAGE_KEY) {
    	return await apiCall('/tasks', { method: 'GET' })
    }
    ```

4. **Use in Business Logic**
    ```typescript
    const tasks = await read<Task>('Skriuw_tasks')
    ```

## Benefits of This Architecture

1. **Separation of Concerns**
    - Each layer has a single responsibility
    - Easy to understand and maintain

2. **Testability**
    - Can mock adapters for testing
    - Can test each layer independently

3. **Flexibility**
    - Easy to swap adapters
    - Easy to add new storage types
    - Easy to change API endpoints

4. **Type Safety**
    - Full TypeScript support
    - Compile-time validation

5. **Consistency**
    - Same pattern for all operations
    - Predictable error handling

## Summary

The storage system is a layered architecture that provides a clean abstraction over storage operations. The CRUD functions provide a simple API, the factory manages adapters, and the serverless-api adapter implements HTTP-based storage. This design allows the application to work with any storage backend while keeping business logic storage-agnostic.
