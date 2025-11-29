# Storage Adapter Migration Example

## Current State: localStorage Adapter

The localStorage adapter stores data as nested JSON arrays with folder hierarchies:

```typescript
// localStorage stores:
[
  {
    id: "folder-1",
    name: "My Folder",
    type: "folder",
    children: [
      { id: "note-1", name: "Note 1", type: "note", parentFolderId: "folder-1" }
    ],
    parentFolderId: undefined
  }
]
```

## Migrating to Cloud API Adapter

A cloud API adapter can store the same data **flat** and build hierarchies on read:

```typescript
// Cloud API stores (flat):
[
  { id: "folder-1", name: "My Folder", type: "folder", parentFolderId: null },
  { id: "note-1", name: "Note 1", type: "note", parentFolderId: "folder-1" }
]

// But implements the same interface:
export function createGenericCloudApiAdapter(options: CloudOptions): GenericStorageAdapter {
  return {
    async read<T extends BaseEntity>(storageKey: string, options?: ReadOptions): Promise<T[] | T | undefined> {
      // Fetch flat data from API
      const flatData = await fetchFromAPI(storageKey)
      
      // Build nested structure if needed (for compatibility)
      if (options?.getAll) {
        return buildNestedStructure(flatData) // Convert flat to nested
      }
      
      return flatData
    },
    
    async create<T extends BaseEntity>(storageKey: string, data: any): Promise<T> {
      // Send flat data to API
      const created = await api.post(storageKey, {
        ...data,
        parentFolderId: data.parentFolderId || null
      })
      return created
    },
    
    // ... other methods
  }
}
```

## Key Points

1. **Interface is agnostic** - Doesn't care about storage format
2. **Domain concepts stay the same** - Still need `parentFolderId`, `move`, etc.
3. **Implementation can differ** - Flat vs nested, local vs remote
4. **Application code unchanged** - All CRUD operations work the same

## Migration Steps

1. Create new adapter implementing `GenericStorageAdapter`
2. Register it: `registerGenericStorageAdapter('cloudApi', createGenericCloudApiAdapter)`
3. Update config: `adapter: 'cloudApi'`
4. Done! No changes to application code needed.

