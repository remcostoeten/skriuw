# API Architecture Documentation

## Overview

This document describes the storage and CRUD architecture used across all features. The system provides an **agnostic storage layer** that abstracts the underlying storage implementation (currently localStorage, but can be swapped to any storage backend).

## Architecture Principles

1. **Storage Agnostic**: All storage operations go through the CRUD layer
2. **DRY**: No duplicate storage code across features
3. **Type Safe**: Generic TypeScript types for all operations
4. **Consistent**: All features follow the same pattern

## Storage Layer Structure

```
api/storage/
├── generic-types.ts              # Generic storage interfaces
├── generic-storage-factory.ts    # Generic adapter factory
├── adapters/
│   ├── generic-local-storage.ts  # Generic localStorage adapter
│   └── local-storage.ts          # Domain-specific adapter (Notes)
├── crud/
│   ├── create.ts                 # Generic create function
│   ├── read.ts                   # Generic read function
│   ├── update.ts                 # Generic update function
│   └── destroy.ts                # Generic destroy function
└── storage-factory.ts            # Domain-specific adapter factory
```

## CRUD Layer

The CRUD layer (`api/storage/crud/`) provides unified functions for all storage operations:

### Functions

- `create<T>(storageKey, data)` - Create a new entity
- `read<T>(storageKey, options?)` - Read entities (single or list)
- `update<T>(storageKey, id, data)` - Update an entity
- `destroy(storageKey, id)` - Delete an entity

### Smart Routing

The CRUD layer automatically routes to the appropriate adapter:

- **Notes** (`storageKey === "Skriuw_notes"`): Routes to domain-specific adapter
- **All other features**: Routes to generic adapter

This provides backward compatibility while enabling new features to use the generic adapter.

## Feature Pattern

All features follow this pattern:

### 1. Define Entity Type

```typescript
// features/shortcuts/api/types.ts
import type { BaseEntity } from "@/api/storage/generic-types";

export interface CustomShortcut extends BaseEntity {
  id: string;
  keys: string[];
  customizedAt: string;
}
```

### 2. Create Queries

```typescript
// features/shortcuts/api/queries/get-shortcuts.ts
import { read } from "@/api/storage/crud";
import type { CustomShortcut } from "../types";

const STORAGE_KEY = "quantum-works:shortcuts:custom";

export async function getShortcuts(): Promise<Record<string, string[]>> {
  const shortcuts = await read<CustomShortcut>(STORAGE_KEY);
  // Transform and return
}
```

### 3. Create Mutations

```typescript
// features/shortcuts/api/mutations/save-shortcut.ts
import { create, update, read } from "@/api/storage/crud";
import type { CustomShortcut } from "../types";

const STORAGE_KEY = "quantum-works:shortcuts:custom";

export async function saveShortcut(id: string, keys: string[]): Promise<CustomShortcut> {
  const existing = await read<CustomShortcut>(STORAGE_KEY, { getById: id });
  
  if (existing) {
    return await update<CustomShortcut>(STORAGE_KEY, id, { keys });
  } else {
    return await create<CustomShortcut>(STORAGE_KEY, { id, keys, customizedAt: new Date().toISOString() });
  }
}
```

## Storage Adapters

### Generic Storage Adapter

**Location**: `api/storage/adapters/generic-local-storage.ts`

**Purpose**: Works with any entity type

**Methods**:
- `create<T>(storageKey, data)` - Create entity
- `read<T>(storageKey, options?)` - Read entities
- `update<T>(storageKey, id, data)` - Update entity
- `delete(storageKey, id)` - Delete entity
- `list<T>(storageKey)` - List all entities

**Used by**: Shortcuts feature and all new features

### Domain-Specific Storage Adapter

**Location**: `api/storage/adapters/local-storage.ts`

**Purpose**: Handles Notes/Folders with nested structures

**Methods**:
- `createNote(data)`, `createFolder(data)`
- `findNote(id)`, `findItemById(id)`
- `updateNote(id, data)`, `renameItem(id, name)`
- `deleteItem(id)`, `moveItem(itemId, targetFolderId)`

**Used by**: Notes feature (for backward compatibility)

## Migration Guide

### Adding a New Feature

1. **Define your entity type** extending `BaseEntity`:
   ```typescript
   export interface MyEntity extends BaseEntity {
     id: string;
     // your fields
   }
   ```

2. **Create queries** using `read()`:
   ```typescript
   const STORAGE_KEY = "my-feature:entities";
   const entities = await read<MyEntity>(STORAGE_KEY);
   ```

3. **Create mutations** using `create()`, `update()`, `destroy()`:
   ```typescript
   const entity = await create<MyEntity>(STORAGE_KEY, data);
   ```

4. **No direct localStorage access** - always use CRUD layer

### Migrating Existing Feature

If you have a feature with direct localStorage access:

1. Define entity type extending `BaseEntity`
2. Replace `localStorage.getItem()` with `read()`
3. Replace `localStorage.setItem()` with `create()` or `update()`
4. Replace `localStorage.removeItem()` with `destroy()`
5. Remove duplicate helper functions

## Benefits

✅ **DRY**: No duplicate storage code  
✅ **Storage Agnostic**: Easy to swap storage backends  
✅ **Type Safe**: Full TypeScript support  
✅ **Consistent**: All features follow same pattern  
✅ **Testable**: Easy to mock storage layer  
✅ **Maintainable**: Single source of truth for storage operations

## Future Enhancements

- [ ] Migrate Notes feature to generic adapter (when nested structures fully supported)
- [ ] Add database adapter (Turso, PostgreSQL, etc.)
- [ ] Add sync capabilities
- [ ] Add offline support with conflict resolution

