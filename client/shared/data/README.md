# Centralized Data Layer

A comprehensive, unified data management system with CRUD operations, optimistic updates, and user settings management.

## 🏗️ Architecture

```
shared/data/
├── crud/              # CRUD operations (create, read, update, delete)
├── settings/          # Settings and feature flags
├── queries/           # Query management and caching
├── types/             # TypeScript definitions
└── index.ts          # Unified exports
```

## 🚀 Quick Start

### Basic CRUD Usage

```typescript
import { useCRUD, createCRUDConfig } from "@/shared/data";

// Create a CRUD configuration for your entity
const notesCRUD = useCRUD(createCRUDConfig('notes', {
  create: (data) => api.createNote(data),
  read: (id) => api.getNote(id),
  update: (id, data) => api.updateNote(id, data),
  delete: (id) => api.deleteNote(id),
  list: (filters) => api.listNotes(filters),
}));

// Use the operations
const { create, update, deleteItem, isLoading } = notesCRUD;

// Create with optimistic updates
const handleCreate = () => {
  create({ title: 'New Note', content: '' }, {
    onSuccess: (data) => console.log('Created:', data),
    onError: (error) => console.error('Failed:', error),
  });
};
```

### Individual CRUD Operations

```typescript
import { useCreate, useUpdate, useDelete, useRead } from "@/shared/data";

// Create operations
const { create, isLoading: creating } = useCreate(config);

// Read operations
const { data: note, isLoading, error } = useRead('note-id', config);

// Update operations with optimistic updates
const { update, batchUpdate, isLoading: updating } = useUpdate(config);

// Delete operations with confirmation
const { deleteItem, deleteWithConfirmation } = useDelete(config);
```

## ⚡ Optimistic Updates

All CRUD operations support optimistic updates for instant UI feedback:

```typescript
const { create } = useCreate({
  ...config,
  optimistic: {
    enabled: true,
    maxAge: 5000, // 5 seconds rollback window
  }
});

// The operation will update the UI immediately
// and rollback if the server call fails
create(newNoteData);
```

## 🎛️ Settings Management

```typescript
import { useSettings } from "@/shared/data";

const {
  theme,
  autoSave,
  fontSize,
  setSetting,
  updateMultipleSettings,
  exportSettings,
  importSettings
} = useSettings();

// Update settings
setSetting('theme', 'dark');
setSetting('autoSave', true);

// Type-safe access
console.log(theme); // 'light' | 'dark' | 'auto'
console.log(autoSave); // boolean
```

### Typed Settings

```typescript
import { useTypedSettings } from "@/shared/data";

const { getSetting, setSetting } = useTypedSettings({
  theme: { type: 'string', defaultValue: 'dark' },
  autoSave: { type: 'boolean', defaultValue: true },
  fontSize: { type: 'number', defaultValue: 14 },
});

// Type-safe with validation
setSetting('theme', 'dark'); // ✅ Valid
setSetting('theme', 123);    // ❌ Throws error
```

## 🚩 Feature Flags

```typescript
import { useFeatureFlags, withFeatureFlag } from "@/shared/data";

const {
  hasAdvancedSearch,
  hasRealTimeCollaboration,
  isEnabled,
  enable,
  disable
} = useFeatureFlags();

// Conditional rendering
{hasAdvancedSearch && <AdvancedSearchComponent />}

// Check specific flag
{isEnabled('beta-feature') && <BetaFeature />}

// HOC for component gating
const EnhancedComponent = withFeatureFlag('premium-feature', MyComponent);
```

### Environment-Based Flags

```bash
# .env
VITE_FF_ADVANCED_SEARCH=true
VITE_FF_REAL_TIME_COLLABORATION=false
```

## 📊 Query Management

```typescript
import { createQueryKeys, createEntityQueries } from "@/shared/data";

// Query key factory
const noteKeys = createQueryKeys('notes');

// Entity-specific queries
const noteQueries = createEntityQueries('notes', {
  list: (filters) => api.listNotes(filters),
  read: (id) => api.getNote(id),
  search: (query) => api.searchNotes(query),
  count: (filters) => api.countNotes(filters),
});

// Use in components
const { data: notes } = useQuery(noteQueries.queries.list());
const { data: note } = useQuery(noteQueries.queries.detail('id'));
```

## 🔧 Advanced Usage

### Custom Validation

```typescript
const config = createCRUDConfig('notes', {
  storage: storageOperations,
  validation: {
    create: async (data) => {
      return data.title?.length > 0 && data.content?.length > 0;
    },
    update: async (data) => {
      if (data.title !== undefined && data.title.length === 0) {
        return false;
      }
      return true;
    },
  },
});
```

### Batch Operations

```typescript
const { batchUpdate, batchDelete } = useUpdate(config);

// Update multiple items
batchUpdate([
  { id: '1', data: { status: 'published' } },
  { id: '2', data: { status: 'published' } },
]);

// Delete multiple items
batchDelete(['1', '2', '3']);
```

### Custom Mutation Options

```typescript
const { create } = useCreate(config);

create(newData, {
  optimistic: true,
  onMutate: async (data) => {
    // Prepare optimistic update
    return { previousData };
  },
  onSuccess: (result, variables) => {
    // Show success toast
    toast.success('Item created successfully');
  },
  onError: (error, variables, context) => {
    // Show error toast
    toast.error('Failed to create item');
  },
  invalidateQueries: ['notes'], // Invalidate specific queries
});
```

## 🎯 Integration Examples

### Notes Feature Integration

```typescript
// features/notes/hooks/useNotesCRUD.ts
import { useCRUD, createCRUDConfig } from "@/shared/data";
import { getStorage } from "@/shared/storage";

export function useNotesCRUD() {
  return useCRUD(createCRUDConfig('notes', {
    create: async (data) => {
      const storage = getStorage();
      return await storage.createNote(data);
    },
    // ... other operations
  }));
}
```

### Settings Provider Setup

```tsx
// app/providers/index.tsx
import { SettingsProvider } from "@/shared/data/settings";

export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        {children}
      </SettingsProvider>
    </QueryClientProvider>
  );
}
```

## 🏃‍♂️ Performance Features

- **Optimistic Updates**: Instant UI feedback with automatic rollback
- **Query Caching**: Intelligent caching with TTL
- **Batch Operations**: Efficient bulk operations
- **Prefetching**: Predictive data loading
- **useTransition**: Non-blocking UI updates
- **Background Sync**: Offline-first operations

## 🔍 Error Handling

```typescript
const { create, error } = useCreate(config);

if (error) {
  // Error is automatically typed and handled
  console.error('Operation failed:', error);
}

// Custom error handling
create(data, {
  onError: (error) => {
    if (error.message.includes('network')) {
      // Handle network errors
    } else if (error.message.includes('validation')) {
      // Handle validation errors
    }
  },
});
```

## 🧪 Testing

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

test('should create item successfully', async () => {
  const { result } = renderHook(() => useCreate(config), { wrapper });

  await act(async () => {
    result.current.create(mockData);
  });

  await waitFor(() => {
    expect(result.current.data?.success).toBe(true);
  });
});
```

This centralized data layer provides a robust foundation for all data operations in your application!