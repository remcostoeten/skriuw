# Architecture Guidelines

> **Last Updated:** 2025-01-06
> **Status:** Active

This document outlines the architectural patterns, conventions, and best practices for the Skriuw InstantDB application.

## Table of Contents

- [Module Structure](#module-structure)
- [Mutation Patterns](#mutation-patterns)
- [Query Patterns](#query-patterns)
- [Error Handling](#error-handling)
- [Type Conventions](#type-conventions)
- [Import Guidelines](#import-guidelines)

---

## Module Structure

Each domain module follows this consistent structure:

```
src/modules/{domain}/
├── api/
│   ├── mutations/
│   │   ├── create.ts
│   │   ├── update.ts
│   │   ├── destroy.ts
│   │   └── ...
│   └── queries/
│       └── get-{domain}.ts
├── components/
├── types.ts (optional)
└── index.ts (optional)
```

### Key Principles

- **Separation of Concerns**: API logic (mutations/queries) is separated from UI components
- **Consistency**: All modules follow the same structure
- **Single Responsibility**: Each mutation/query file handles one operation

---

## Mutation Patterns

### Standard Mutation Hook Pattern

✅ **Correct Pattern:**

```typescript
import { useMutation } from '@/hooks/core';
import { transact, tx } from '@/api/db/client';
import { withTimestamps } from '@/shared/utilities/timestamps';
import { updateRelation } from '@/shared/utilities/relations';

type UpdateEntityInput = {
  field1?: string;
  field2?: number;
  relationId?: string | null;
};

export function useUpdateEntity() {
  const { mutate, isLoading, error } = useMutation(
    async ({ id, input }: { id: string; input: UpdateEntityInput }) => {
      const operations = [];
      
      // Build scalar updates
      const updates: any = {};
      if (input.field1 !== undefined) updates.field1 = input.field1;
      if (input.field2 !== undefined) updates.field2 = input.field2;
      
      // Add update with timestamps
      operations.push(tx.entities[id].update(withTimestamps(updates)));
      
      // Handle relationships
      if (input.relationId !== undefined) {
        operations.push(...updateRelation('entities', id, 'relation', input.relationId));
      }
      
      // Execute atomically
      await transact(operations);
      return { id };
    }
  );

  const updateEntity = (id: string, input: UpdateEntityInput) => mutate({ id, input });
  return { updateEntity, isLoading, error };
}
```

### Key Rules

1. **Always use `useMutation`** - Provides consistent error handling and loading states
2. **Use timestamp utilities** - `withTimestamps()` for updates, `withTimestamps(..., true)` for creates
3. **Batch operations** - Collect all operations and call `transact()` once
4. **Use relation helpers** - `updateRelation()` and `updateManyRelation()` for relationships
5. **Type safety** - Define input types with descriptive names (e.g., `CreateNoteInput`, `UpdateTaskInput`)

### Timestamp Management

```typescript
// Create operation
await transact([
  tx.entities[id].update(withTimestamps({ name, value }, true))
]);

// Update operation
await transact([
  tx.entities[id].update(withTimestamps({ name }))
]);
```

### Relationship Management

```typescript
// One-to-one or many-to-one
operations.push(...updateRelation('tasks', taskId, 'parent', parentId));

// Many-to-many
operations.push(...updateManyRelation('tasks', taskId, 'dependsOn', dependsOnIds));
```

---

## Query Patterns

### Standard Query Hook Pattern

✅ **Correct Pattern:**

```typescript
import { createQueryHook } from '@/hooks/core';
import type { Entity } from '@/api/db/schema';
import { arrayQueryOptions, singleQueryOptions } from '@/shared/utilities/query-helpers';

// Array query
const useEntitiesQuery = createQueryHook(
  () => ({
    entities: {
      $: { order: { createdAt: 'desc' } },
      relation: {},
    },
  }),
  arrayQueryOptions<Entity>('entities')
);

// Single entity query
const useEntityQuery = createQueryHook(
  (id: string | null) => ({
    entities: {
      $: { where: { id } },
      relation: {},
    },
  }),
  {
    ...singleQueryOptions<Entity>('entities'),
    enabled: (id) => !!id,
  }
);
```

### Query Helpers

- **`arrayQueryOptions<T>(entityName)`** - For queries returning arrays
- **`singleQueryOptions<T>(entityName)`** - For queries returning single entities
- **`selectArray<T>(entityName)`** - Manual selector for arrays
- **`selectSingle<T>(entityName)`** - Manual selector for single entities

### Custom Transformations

When you need custom logic, use the selector functions:

```typescript
import { selectArray } from '@/shared/utilities/query-helpers';

const useEntitiesQuery = createQueryHook(
  () => ({ entities: {} }),
  {
    select: (raw) => {
      const entities = selectArray<Entity>('entities')(raw);
      // Custom sorting/filtering
      return entities.sort((a, b) => a.position - b.position);
    },
    initialData: [] as Entity[],
  }
);
```

---

## Error Handling

### Automatic Error Handling

All mutations using `useMutation` get automatic error handling:

```typescript
const { mutate, isLoading, error } = useMutation(
  async (input) => {
    // ... mutation logic
  },
  {
    errorContext: 'Creating note', // Optional: context for error messages
    showErrorToast: true, // Default: true
    onError: (error) => {
      // Optional: custom error handling
    },
  }
);
```

### Optimistic Updates

For better UX, use `useOptimisticMutation`:

```typescript
import { useOptimisticMutation } from '@/hooks/core';

const { mutate } = useOptimisticMutation({
  mutationFn: async ({ id, completed }) => {
    await updateTask(id, { completed });
  },
  onOptimistic: ({ id, completed }) => {
    // Update UI immediately
    updateTaskInCache(id, { completed });
  },
  onRollback: ({ id }) => {
    // Revert on error
    revertTaskInCache(id);
  },
});
```

---

## Type Conventions

### Naming

✅ **Correct:**
```typescript
type CreateNoteInput = { ... };
type UpdateNoteInput = { ... };
type DuplicateNoteInput = { ... };
```

❌ **Incorrect:**
```typescript
type props = { ... };
type Props = { ... };
type input = { ... };
```

### Export Pattern

✅ **Use named exports:**
```typescript
export function useCreateNote() { ... }
export function NotesView() { ... }
export function noteUtils() { ... }
```

❌ **Avoid default exports** (except Next.js pages):
```typescript
export default function NotesView() { ... }
```

---

## Import Guidelines

### Direct Database Access

✅ **Acceptable** - Direct imports when using `useMutation`:
```typescript
import { transact, tx } from '@/api/db/client';
import { useMutation } from '@/hooks/core';

export function useComplexOperation() {
  const { mutate } = useMutation(async (input) => {
    // Complex multi-step operation
    await transact([...]);
  });
  return { complexOperation: mutate };
}
```

❌ **Not acceptable** - Direct imports without error handling:
```typescript
export function useComplexOperation() {
  const complexOperation = async (input) => {
    await transact([...]); // No error handling!
  };
  return { complexOperation };
}
```

### Utility Imports

Always use shared utilities:

```typescript
// Timestamps
import { withTimestamps, createTimestamp } from '@/shared/utilities/timestamps';

// Relations
import { updateRelation, updateManyRelation } from '@/shared/utilities/relations';

// Queries
import { 
  arrayQueryOptions, 
  singleQueryOptions,
  selectArray,
  selectSingle 
} from '@/shared/utilities/query-helpers';
```

---

## Best Practices Summary

### ✅ Do

- Use `useMutation` for all mutations
- Use timestamp utilities consistently
- Batch all operations into single `transact()` calls
- Use relation helpers for managing relationships
- Use query helpers for standard transformations
- Define descriptive input types
- Use named exports
- Add error contexts to mutations

### ❌ Don't

- Create manual loading/error states when `useMutation` exists
- Make multiple sequential `transact()` calls
- Manually manage `createdAt`/`updatedAt` timestamps
- Use `props` or `Props` as type names
- Use default exports (except Next.js pages)
- Skip error handling

---

## Migration Guide

### Updating Existing Code

1. **Mutations**: Ensure they use `useMutation`, `withTimestamps`, and batch operations
2. **Queries**: Replace manual selectors with query helpers
3. **Types**: Rename generic types to descriptive names
4. **Exports**: Convert default exports to named exports (except pages)

### Example Migration

**Before:**
```typescript
export function useUpdateNote() {
  const [isLoading, setIsLoading] = useState(false);
  const updateNote = async (id: string, input: any) => {
    setIsLoading(true);
    await transact([tx.notes[id].update({ ...input, updatedAt: Date.now() })]);
    setIsLoading(false);
  };
  return { updateNote, isLoading };
}
```

**After:**
```typescript
import { useMutation } from '@/hooks/core';
import { withTimestamps } from '@/shared/utilities/timestamps';

type UpdateNoteInput = {
  title?: string;
  content?: string;
};

export function useUpdateNote() {
  const { mutate, isLoading, error } = useMutation(
    async ({ id, input }: { id: string; input: UpdateNoteInput }) => {
      await transact([tx.notes[id].update(withTimestamps(input))]);
      return { id };
    }
  );
  const updateNote = (id: string, input: UpdateNoteInput) => mutate({ id, input });
  return { updateNote, isLoading, error };
}
```

---

## Questions or Improvements?

If you have questions about these patterns or suggestions for improvements, please:
1. Check the examples in this document
2. Look at existing implementations in `src/modules/`
3. Update this document with clarifications or new patterns

---

**See Also:**
- [Development Guide](../apps/docs/content/docs/app/development.mdx)
- [API Reference](../apps/docs/content/docs/app/api-reference.mdx)

