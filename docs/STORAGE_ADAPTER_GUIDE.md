# Storage Adapter Architecture Guide

## Current Architecture

The storage system uses a **clean abstraction layer** that makes it relatively easy to swap adapters, but there are a few improvements needed for full flexibility.

## ✅ What's Already Good

1. **Generic Storage Interface** - All CRUD operations go through `GenericStorageAdapter` interface
2. **Factory Pattern** - Adapters are registered via `registerGenericStorageAdapter()`
3. **No Direct Dependencies** - All app data CRUD goes through the generic interface
4. **Type-Safe** - TypeScript ensures adapters implement the full interface

## ⚠️ Current Limitations

1. **Hardcoded Adapter Type** - `StorageAdapterName` only allows `'localStorage'`
2. **Hardcoded Config** - `DEFAULT_STORAGE_CONFIG` always uses `'localStorage'`
3. **Direct localStorage Usage** - Some UI state uses localStorage directly (not through adapter)

## 🔧 How to Add a New Adapter

### Step 1: Update Types

```typescript
// src/api/storage/generic-types.ts
export type StorageAdapterName = 'localStorage' | 'cloudApi' | 'indexedDb' // Add your adapter
```

### Step 2: Create Adapter Implementation

```typescript
// src/api/storage/adapters/generic-cloud-api.ts
import type { GenericStorageAdapter, BaseEntity, ReadOptions, ... } from "../generic-types"

export function createGenericCloudApiAdapter(
  options: { apiUrl: string; authToken: string }
): GenericStorageAdapter {
  // Implement all required methods:
  // - initialize()
  // - destroy()
  // - create()
  // - read()
  // - update()
  // - delete()
  // - list()
  // - move()
  // - addEventListener()
  // - removeEventListener()
  // - isHealthy()
  // - getStorageInfo()
}
```

### Step 3: Register Adapter

```typescript
// src/api/storage/generic-storage-factory.ts
import { createGenericCloudApiAdapter } from "./adapters/generic-cloud-api"

adapters.set("cloudApi", (options) => createGenericCloudApiAdapter(options as any))
```

### Step 4: Update Config

```typescript
// src/app/storage/config.ts
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  adapter: "cloudApi", // or make it configurable
  options: { apiUrl: "...", authToken: "..." }
}
```

## 📝 Notes on Direct localStorage Usage

Some components use localStorage directly for **UI state** (not app data):
- Panel position/opacity
- Expanded folders
- Editor tabs state

These are fine to keep as-is since they're UI preferences, not app data. If you want them to go through the adapter too, you'd need to:
1. Create storage keys for them
2. Use the generic CRUD operations instead

## 🎯 Recommendation

To make the system **fully swappable**, you should:

1. **Make adapter type extensible** - Use a union type or string literal
2. **Make config dynamic** - Allow environment-based or user-selected adapter
3. **Keep UI state separate** - Current direct localStorage usage for UI is fine

The CRUD operations themselves are already fully abstracted and will work with any adapter that implements the interface!

