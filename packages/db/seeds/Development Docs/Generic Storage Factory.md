# Generic Storage Factory

The Generic Storage Factory (`lib/storage/generic-storage-factory.ts`) is the central registry and lifecycle manager for storage adapters. It provides a unified way to create, initialize, and manage different storage backends.

## Purpose

The factory pattern allows the application to:
- **Register** different storage adapters
- **Create** adapter instances based on configuration
- **Manage** adapter lifecycle (initialize, destroy)
- **Access** the current adapter instance globally

## Architecture

```
Adapter Registry (Map)
  ↓
createGenericStorageAdapter(config)
  ↓
Adapter Factory Function
  ↓
GenericStorageAdapter Instance
```

## Core Functions

### `createGenericStorageAdapter(config)`

Creates a new adapter instance based on the configuration:

```typescript
export async function createGenericStorageAdapter(
  config: StorageConfig
): Promise<GenericStorageAdapter>
```

**Process:**
1. Looks up the adapter factory from the registry
2. Calls the factory function with config options
3. Returns the adapter instance

**Example:**
```typescript
const adapter = await createGenericStorageAdapter({
  adapter: 'serverless-api',
  options: { apiBaseUrl: 'https://api.example.com' }
})
```

### `initializeGenericStorage(config)`

Initializes and sets the global storage adapter:

```typescript
export async function initializeGenericStorage(
  config: StorageConfig
): Promise<GenericStorageAdapter>
```

**Process:**
1. Destroys existing adapter if one exists
2. Creates new adapter from config
3. Calls `adapter.initialize()` to set it up
4. Stores it as the current adapter
5. Returns the initialized adapter

**Lifecycle:**
```
Existing Adapter? → destroy() → create() → initialize() → store globally
```

### `getGenericStorage()`

Retrieves the currently initialized adapter:

```typescript
export function getGenericStorage(): GenericStorageAdapter
```

**Usage:**
- Called by CRUD functions to get the current adapter
- Throws error if storage not initialized
- Ensures single source of truth for storage access

**Example:**
```typescript
const storage = getGenericStorage()
const notes = await storage.read('Skriuw_notes')
```

### `destroyGenericStorage()`

Cleans up the current adapter:

```typescript
export async function destroyGenericStorage(): Promise<void>
```

**Process:**
1. Calls `adapter.destroy()` for cleanup
2. Sets current adapter to `null`
3. Used during app shutdown or adapter switching

## Adapter Registry

The factory maintains a registry of available adapters:

```typescript
const adapters = new Map<StorageConfig['adapter'], AdapterFactory>()
```

### Registering Adapters

Adapters are registered using `adapters.set()`:

```typescript
adapters.set('serverless-api', (config) =>
  createServerlessApiAdapter(config?.apiBaseUrl as string | undefined)
)
```

### Public Registration API

`registerGenericStorageAdapter()` allows runtime registration:

```typescript
export function registerGenericStorageAdapter(
  name: StorageConfig['adapter'],
  factory: AdapterFactory
): void
```

**Use Cases:**
- Adding custom adapters
- Plugin system
- Testing with mock adapters

**Example:**
```typescript
registerGenericStorageAdapter('localStorage', (config) => {
  return createLocalStorageAdapter(config)
})
```

### Listing Available Adapters

`getAvailableGenericAdapters()` returns all registered adapter names:

```typescript
export function getAvailableGenericAdapters(): StorageConfig['adapter'][]
```

**Use Cases:**
- Debugging
- UI for adapter selection
- Validation

## Adapter Factory Type

```typescript
type AdapterFactory = (
  config?: StorageConfig['options']
) => GenericStorageAdapter | Promise<GenericStorageAdapter>
```

**Characteristics:**
- Takes optional config options
- Returns adapter instance (sync or async)
- Must implement `GenericStorageAdapter` interface

## Global State Management

The factory maintains a single global adapter instance:

```typescript
let currentGenericStorage: GenericStorageAdapter | null = null
```

**Benefits:**
- Single source of truth
- Prevents multiple adapter instances
- Easy access throughout the app

**Initialization Flow:**
```
App Startup
  ↓
initializeGenericStorage(config)
  ↓
currentGenericStorage = adapter
  ↓
getGenericStorage() returns adapter
```

## Error Handling

### Adapter Not Found

```typescript
if (!factory) {
  throw new Error(
    `Storage adapter '${config.adapter}' not found. Available: ...`
  )
}
```

### Storage Not Initialized

```typescript
if (!currentGenericStorage) {
  throw new Error('Generic storage not initialized. Call initializeGenericStorage first.')
}
```

## Integration with App

### Initialization

Storage is initialized in `app/storage/index.ts`:

```typescript
export async function initializeAppStorage(): Promise<void> {
  const storage = await initializeGenericStorage(DEFAULT_STORAGE_CONFIG)
  await storage.getStorageInfo()
  // ... other initialization
}
```

### Configuration

Storage config is defined in `app/storage/config.ts`:

```typescript
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  adapter: "serverless-api",
  options: {}
}
```

## Benefits

1. **Separation of Concerns**
   - Factory handles adapter management
   - Business logic doesn't know about adapter creation

2. **Extensibility**
   - Easy to add new adapters
   - Runtime registration support

3. **Type Safety**
   - Full TypeScript support
   - Compile-time adapter validation

4. **Lifecycle Management**
   - Proper initialization/cleanup
   - Prevents resource leaks

5. **Singleton Pattern**
   - Single adapter instance
   - Consistent state across app

## Example: Adding a New Adapter

```typescript
// 1. Create adapter implementation
function createIndexedDBAdapter(config?: StorageConfig['options']): GenericStorageAdapter {
  return {
    name: 'indexeddb',
    type: 'local',
    // ... implement interface
  }
}

// 2. Register adapter
registerGenericStorageAdapter('indexeddb', createIndexedDBAdapter)

// 3. Use in config
const config: StorageConfig = {
  adapter: 'indexeddb',
  options: { dbName: 'skriuw-db' }
}

// 4. Initialize
await initializeGenericStorage(config)
```

## Summary

The Generic Storage Factory provides a clean, extensible way to manage storage adapters. It handles adapter creation, lifecycle, and global access, allowing the application to work with any storage backend through a unified interface.
