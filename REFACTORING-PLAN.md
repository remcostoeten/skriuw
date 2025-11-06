# Refactoring Plan - Skriuw App

> **Status:** Documentation phase complete. Ready for implementation.
> 
> **Created:** 2025-01-06
> 
> **Last Updated:** 2025-01-06

## Overview

This document outlines identified patterns that need refactoring to improve consistency, reduce duplication, and strengthen the architectural foundations of the Skriuw application.

**Good News:** The core architecture is solid. Issues are primarily:
- Consistency (naming conventions, export patterns)
- Duplication (timestamps, query transformations, relation management)
- Missing abstractions (could reduce boilerplate by ~30%)

---

## 🔴 Critical Issues (Phase 1)

### 1. Inconsistent Type Naming

**Problem:** Multiple naming patterns used across modules:
```typescript
// Found in codebase:
type props = { ... }                    // Lowercase (notes, tasks, folders)
type Props = { ... }                    // Capitalized (settings)
interface UpdateNoteInput { ... }       // Descriptive interface
type CreateTaskInput = { ... }          // Descriptive type
```

**Impact:** Confusing for developers, harder to search codebase

**Solution:** Standardize to descriptive type names:
```typescript
// ✅ Pattern to enforce:
type CreateNoteInput = { ... }
type UpdateTaskInput = { ... }
type DuplicateNoteInput = { ... }
```

**Files to Update:**
- `apps/instantdb/src/modules/notes/api/mutations/create.ts` - `props` → `CreateNoteInput`
- `apps/instantdb/src/modules/notes/api/mutations/update.ts` - Keep `UpdateNoteInput` ✓
- `apps/instantdb/src/modules/tasks/api/mutations/create.ts` - Keep `CreateTaskInput` ✓
- `apps/instantdb/src/modules/tasks/api/mutations/update.ts` - `props` → `UpdateTaskInput`
- `apps/instantdb/src/modules/tasks/api/mutations/add-comment.ts` - `props` → `AddCommentInput`
- `apps/instantdb/src/modules/folders/api/mutations/create.ts` - Add type name
- `apps/instantdb/src/modules/projects/api/mutations/create.ts` - `props` → `CreateProjectInput`
- `apps/instantdb/src/modules/projects/api/mutations/update.ts` - `props` → `UpdateProjectInput`
- `apps/instantdb/src/modules/settings/api/mutations/update-user-setting.ts` - `Props` → `UpdateSettingInput`

**Effort:** ~30 minutes

---

### 2. Default Exports in Pages/Views

**Problem:** 13 files use `export default` instead of named exports:

**Files:**
```
apps/instantdb/src/views/_development/demo-view.tsx
apps/instantdb/src/views/notes-view.tsx
apps/instantdb/src/views/tasks-view.tsx
apps/instantdb/src/shared/utilities/platform.ts
apps/instantdb/src/modules/tasks/components/task-list.tsx
apps/instantdb/src/components/sidebar/toolbar.tsx
apps/instantdb/src/components/editor/mention-list.tsx
apps/instantdb/src/app/tasks/page.tsx
apps/instantdb/src/app/page.tsx
apps/instantdb/src/app/layout.tsx
apps/instantdb/src/app/not-found.tsx
apps/instantdb/src/app/test/page.tsx
apps/instantdb/src/app/(_dev)/platform-demo/page.tsx
```

**Solution:** Convert all to named exports:
```typescript
// ❌ Current
export default function NotesView() { ... }

// ✅ Should be
export function NotesView() { ... }
```

**Note:** Next.js pages (app router) can keep default exports if needed for framework compatibility. Focus on views/components/utilities.

**Effort:** ~1 hour

---

### 3. Manual Timestamp Management

**Problem:** Every mutation manually adds timestamps:
```typescript
// ❌ Repeated 15+ times across modules
const now = Date.now();
await create(id, { ...input, createdAt: now, updatedAt: now });
```

**Solution:** Create timestamp utility:

**New File:** `apps/instantdb/src/shared/utilities/timestamps.ts`
```typescript
export type Timestamps = {
  createdAt: number;
  updatedAt: number;
};

/**
 * Adds timestamps to data object
 * @param data - The data to add timestamps to
 * @param isCreate - If true, adds createdAt. Always adds updatedAt.
 */
export function withTimestamps<T extends Record<string, any>>(
  data: T,
  isCreate = false
): T & Partial<Timestamps> {
  const now = Date.now();
  return {
    ...data,
    ...(isCreate && { createdAt: now }),
    updatedAt: now,
  };
}

/**
 * Creates a new timestamp for createdAt
 */
export function createTimestamp(): number {
  return Date.now();
}
```

**Usage:**
```typescript
// Create operation
await create(id, withTimestamps(input, true));

// Update operation
await update(id, withTimestamps(partialData));
```

**Files to Update:**
- All `create.ts` mutation files (notes, tasks, folders, projects, shortcuts)
- All `update.ts` mutation files
- `duplicate.ts` in notes module
- `defaults.ts` in shortcuts module

**Effort:** ~1.5 hours

---

## 🟠 High Impact Issues (Phase 2)

### 4. Core CRUD Hooks Don't Use `useMutation`

**Problem:** `useCreate`, `useUpdate`, `useDestroy` manually manage loading/error states instead of using the central `useMutation` hook. This means:
- No error toast notifications
- Inconsistent error handling
- Duplicate loading state management
- No `onSuccess`/`onError` callback support

**Current Implementation:**
```typescript
// apps/instantdb/src/hooks/core/use-create.ts
export function useCreate<T>(entityName: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const create = async (id: string, data: T) => {
    try {
      setIsLoading(true);
      setError(null);
      await transact([tx[entityName][id].update(data)]);
      return { id, ...data };
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  return { create, isLoading, error };
}
```

**Refactored Implementation:**
```typescript
// apps/instantdb/src/hooks/core/use-create.ts
import { transact, tx } from '@/api/db/client';
import { useMutation } from './use-mutation';

export function useCreate<T extends Record<string, any>>(
  entityName: string,
  options?: {
    showErrorToast?: boolean;
    onSuccess?: (result: { id: string } & T) => void;
    onError?: (error: Error) => void;
  }
) {
  const { mutate, isLoading, error, reset } = useMutation(
    async ({ id, data }: { id: string; data: T }) => {
      await transact([tx[entityName as keyof typeof tx][id].update(data)]);
      return { id, ...data };
    },
    {
      errorContext: `Creating ${entityName}`,
      showErrorToast: options?.showErrorToast ?? true,
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    }
  );

  // Maintain same API for backwards compatibility
  const create = async (id: string, data: T) => {
    return mutate({ id, data });
  };

  return { create, isLoading, error, reset };
}
```

**Same pattern for:**
- `useUpdate` - apps/instantdb/src/hooks/core/use-update.ts
- `useDestroy` - apps/instantdb/src/hooks/core/use-destroy.ts

**Benefits:**
- ✅ Automatic error toasts
- ✅ Consistent error handling
- ✅ Support for callbacks
- ✅ Cleaner code (removes ~15 lines per hook)

**Effort:** ~2 hours

---

### 5. Multiple Sequential `transact` Calls

**Problem:** Some mutations make 3-4 separate transact calls instead of batching operations:

**Example - `useUpdateFolder`:**
```typescript
// ❌ Current: 3 separate transactions
await transact([tx.folders[id].update(updates)]);  // Transaction 1

if (effectiveCurrentParentId && effectiveCurrentParentId !== data.parentId) {
  await transact([tx.folders[id].unlink({ parent: effectiveCurrentParentId })]);  // Transaction 2
}

if (data.parentId) {
  await transact([tx.folders[id].link({ parent: data.parentId })]);  // Transaction 3
}
```

**Issues:**
- Not atomic (could fail midway)
- Slower (3 round trips instead of 1)
- Multiple UI updates instead of one

**Solution:**
```typescript
// ✅ Single atomic transaction
const operations = [tx.folders[id].update(updates)];

if (effectiveCurrentParentId && effectiveCurrentParentId !== data.parentId) {
  operations.push(tx.folders[id].unlink({ parent: effectiveCurrentParentId }));
}

if (data.parentId) {
  operations.push(tx.folders[id].link({ parent: data.parentId }));
}

await transact(operations);  // Single transaction
```

**Files to Update:**
- `apps/instantdb/src/modules/folders/api/mutations/update.ts` - Combine 3 transacts
- `apps/instantdb/src/modules/tasks/api/mutations/update.ts` - Combine 3 transacts
- Check other update mutations for this pattern

**Effort:** ~1 hour

---

### 6. Query Result Transformation Duplication

**Problem:** Similar select/transform logic repeated across all queries:
```typescript
// ❌ Repeated 10+ times
const useNotesQuery = createQueryHook(
  () => ({ notes: { ... } }),
  {
    select: (raw) => (raw?.notes as Note[]) ?? [],
    initialData: [] as Note[],
  }
);
```

**Solution:** Create query helper utilities:

**New File:** `apps/instantdb/src/shared/utilities/query-helpers.ts`
```typescript
/**
 * Selects an array of entities from query result
 */
export function selectArray<T>(entityName: string) {
  return (raw: any): T[] => (raw?.[entityName] as T[]) ?? [];
}

/**
 * Selects a single entity from query result
 */
export function selectSingle<T>(entityName: string) {
  return (raw: any): T | null => (raw?.[entityName]?.[0] as T) ?? null;
}

/**
 * Selects first entity or undefined
 */
export function selectFirst<T>(entityName: string) {
  return (raw: any): T | undefined => raw?.[entityName]?.[0] as T | undefined;
}

/**
 * Creates standard options for array queries
 */
export function arrayQueryOptions<T>(entityName: string) {
  return {
    select: selectArray<T>(entityName),
    initialData: [] as T[],
  };
}

/**
 * Creates standard options for single entity queries
 */
export function singleQueryOptions<T>(entityName: string) {
  return {
    select: selectSingle<T>(entityName),
    initialData: null as T | null,
  };
}
```

**Usage:**
```typescript
// Before
const useNotesQuery = createQueryHook(
  () => ({ notes: { ... } }),
  {
    select: (raw) => (raw?.notes as Note[]) ?? [],
    initialData: [] as Note[],
  }
);

// After
const useNotesQuery = createQueryHook(
  () => ({ notes: { ... } }),
  arrayQueryOptions<Note>('notes')
);
```

**Files to Update:**
- All query files in `apps/instantdb/src/modules/*/api/queries/`

**Effort:** ~2 hours

---

## 🟡 Medium Priority Issues (Phase 3)

### 7. Link/Unlink Pattern Not Abstracted

**Problem:** Repetitive code for managing relationships:
```typescript
// ❌ Repeated pattern in multiple files
await transact([
  tx.tasks[id].unlink({ parent: null as any }),
  ...(input.parentId ? [tx.tasks[id].link({ parent: input.parentId })] : []),
]);
```

**Solution:** Create relation helper:

**New File:** `apps/instantdb/src/shared/utilities/relations.ts`
```typescript
import { tx } from '@/api/db/client';

/**
 * Updates a one-to-one or many-to-one relationship
 * @param entityName - The entity type (e.g., 'tasks', 'notes')
 * @param entityId - The entity ID
 * @param relationName - The relation field name
 * @param newId - New relation ID (null to unlink)
 * @returns Array of transaction operations
 */
export function updateRelation(
  entityName: string,
  entityId: string,
  relationName: string,
  newId: string | null
): any[] {
  const operations = [];
  
  // Unlink existing
  operations.push(
    tx[entityName as keyof typeof tx][entityId].unlink({
      [relationName]: null as any,
    })
  );
  
  // Link new if provided
  if (newId) {
    operations.push(
      tx[entityName as keyof typeof tx][entityId].link({
        [relationName]: newId,
      })
    );
  }
  
  return operations;
}

/**
 * Updates a many-to-many relationship
 * @param entityName - The entity type
 * @param entityId - The entity ID
 * @param relationName - The relation field name
 * @param newIds - Array of new relation IDs
 * @returns Array of transaction operations
 */
export function updateManyRelation(
  entityName: string,
  entityId: string,
  relationName: string,
  newIds: string[]
): any[] {
  const operations = [];
  
  // Unlink all existing
  operations.push(
    tx[entityName as keyof typeof tx][entityId].unlink({
      [relationName]: null as any,
    })
  );
  
  // Link new ones
  newIds.forEach(id => {
    operations.push(
      tx[entityName as keyof typeof tx][entityId].link({
        [relationName]: id,
      })
    );
  });
  
  return operations;
}
```

**Usage:**
```typescript
// Before
await transact([
  tx.tasks[id].unlink({ parent: null as any }),
  ...(input.parentId ? [tx.tasks[id].link({ parent: input.parentId })] : []),
]);

// After
await transact(updateRelation('tasks', id, 'parent', input.parentId));
```

**Files to Update:**
- `apps/instantdb/src/modules/tasks/api/mutations/update.ts`
- `apps/instantdb/src/modules/folders/api/mutations/update.ts`
- `apps/instantdb/src/modules/notes/api/mutations/move.ts`

**Effort:** ~2 hours

---

### 8. Optimistic Update Support

**Problem:** InstantDB supports optimistic updates, but no abstraction exists for it.

**Solution:** Create optimistic mutation wrapper:

**New File:** `apps/instantdb/src/hooks/core/use-optimistic-mutation.ts`
```typescript
import { useState, useCallback } from 'react';
import { useErrorHandler } from '../use-error-handler';

type OptimisticConfig<TData, TVariables> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onOptimistic?: (variables: TVariables) => void;
  onRollback?: (variables: TVariables) => void;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
  showErrorToast?: boolean;
  errorContext?: string;
};

/**
 * Mutation hook with optimistic update support
 */
export function useOptimisticMutation<TData, TVariables>(
  config: OptimisticConfig<TData, TVariables>
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { handleError } = useErrorHandler({
    showToast: config.showErrorToast !== false,
  });

  const mutate = useCallback(
    async (variables: TVariables) => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Apply optimistic update
        config.onOptimistic?.(variables);
        
        // Perform actual mutation
        const result = await config.mutationFn(variables);
        
        // Success callback
        await config.onSuccess?.(result, variables);
        
        return result;
      } catch (err) {
        const e = err as Error;
        setError(e);
        
        // Rollback optimistic update
        config.onRollback?.(variables);
        
        // Handle error
        if (config.showErrorToast !== false) {
          handleError(e, config.errorContext);
        }
        
        await config.onError?.(e, variables);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [config, handleError]
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  return { mutate, isLoading, error, reset };
}
```

**Usage:**
```typescript
export function useToggleTaskComplete() {
  const { mutate } = useOptimisticMutation({
    mutationFn: async ({ id, completed }) => {
      await update(id, { completed, updatedAt: Date.now() });
    },
    onOptimistic: ({ id, completed }) => {
      // Update UI immediately
      updateTaskInCache(id, { completed });
    },
    onRollback: ({ id }) => {
      // Revert UI on error
      revertTaskInCache(id);
    },
  });
  
  return { toggleComplete: mutate };
}
```

**Effort:** ~3 hours (including testing)

---

### 9. Enforce Consistent Import Paths

**Problem:** Some files import `transact, tx, db` directly, others use abstractions.

**Decision Needed:** 
- ✅ **Allow direct imports** for complex operations (folder hierarchy, settings upsert)?
- ❌ **Enforce abstractions** everywhere for consistency?

**Recommendation:** Allow direct imports in mutation files, but always wrap in `useMutation`. This gives flexibility while maintaining error handling consistency.

**Guideline to Document:**
```typescript
// ✅ Acceptable: Direct import in mutation, wrapped in useMutation
import { transact, tx } from '@/api/db/client';
import { useMutation } from '@/hooks/core';

export function useComplexOperation() {
  const { mutate, isLoading } = useMutation(async (input) => {
    // Complex multi-step operation with transact/tx
    await transact([...]);
  });
  
  return { complexOperation: mutate, isLoading };
}

// ❌ Not acceptable: Direct import without useMutation
export function useComplexOperation() {
  const complexOperation = async (input) => {
    await transact([...]);  // No error handling!
  };
  
  return { complexOperation };
}
```

**Effort:** ~30 minutes (documentation)

---

## 📊 Implementation Plan

### Phase 1: Quick Wins (4 hours)
1. ✅ Standardize type names
2. ✅ Remove default exports (where appropriate)
3. ✅ Create and apply timestamp utility

**Benefits:** Immediate consistency improvement, ~20% less boilerplate

### Phase 2: Core Improvements (5 hours)
4. ✅ Refactor core CRUD hooks to use useMutation
5. ✅ Batch sequential transact calls
6. ✅ Create and apply query helper utilities

**Benefits:** Better error handling, ~30% less duplication, atomic operations

### Phase 3: Advanced Abstractions (5 hours)
7. ✅ Create relation management utilities
8. ✅ Add optimistic update support
9. ✅ Document import path guidelines

**Benefits:** Cleaner code, better UX (optimistic updates), clear patterns

**Total Effort:** ~14 hours
**Expected Code Reduction:** ~25-30%
**Expected Consistency Improvement:** ~80% (from current ~50%)

---

## Testing Strategy

After each phase:

1. **Manual Testing:**
   - Create, read, update, delete operations for all entities
   - Test error scenarios (network failure, validation errors)
   - Verify optimistic updates work correctly

2. **Regression Checks:**
   - All existing features still work
   - No performance regressions
   - Error toasts appear correctly

3. **Code Review Checklist:**
   - All type names follow convention
   - No default exports in modules/utilities
   - All mutations use `useMutation`
   - Timestamp utility used consistently
   - Single transact per operation
   - Relations managed via helpers (Phase 3)

---

## Files to Create

### Phase 1
- ✅ `apps/instantdb/src/shared/utilities/timestamps.ts`

### Phase 2
- ✅ `apps/instantdb/src/shared/utilities/query-helpers.ts`

### Phase 3
- ✅ `apps/instantdb/src/shared/utilities/relations.ts`
- ✅ `apps/instantdb/src/hooks/core/use-optimistic-mutation.ts`

---

## Success Metrics

- ✅ 100% consistent type naming
- ✅ Zero default exports in modules/utilities
- ✅ All mutations use `useMutation` (error handling)
- ✅ All timestamps use utility
- ✅ All operations batched in single transact
- ✅ Query transformations use helpers
- ✅ Relations use abstractions (Phase 3)

---

## Notes for Implementation

### Breaking Changes
- None expected (all changes maintain backwards compatibility)
- Type renames are internal only

### Migration Path
- Can be done incrementally
- No need to update all files at once
- Start with new features, gradually update existing

### Documentation Updates Needed
- Update API reference with new utilities
- Add architectural decision record (ADR) for patterns
- Update development guide with new conventions

---

## Related Documentation

- Architecture: `apps/docs/content/docs/app/architecture.mdx`
- API Reference: `apps/docs/content/docs/app/api-reference.mdx`
- Development Guide: `apps/docs/content/docs/app/development.mdx`

---

## Questions for Discussion

1. **Optimistic Updates:** Should we prioritize this? Adds great UX but increases complexity.
2. **Import Enforcement:** Strict (always use abstractions) vs Flexible (allow direct in complex cases)?
3. **Testing:** When should we add automated tests? Before or after refactoring?
4. **Backwards Compatibility:** Any features we can deprecate/remove?

---

**Next Steps:**
1. ✅ Complete documentation (DONE)
2. ⏸️  Review this plan
3. ⏸️  Begin Phase 1 implementation
4. ⏸️  Update documentation as patterns change

