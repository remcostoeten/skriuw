# API/Data Layer Architecture Audit

**Date:** 2024-11-01  
**Project:** Tauri Local (InstantDB-based)

---

## Executive Summary

Your API/data layer architecture is **well-structured** with a clean separation of concerns. The core abstraction layer built on top of InstantDB is solid and follows good patterns. However, there are several **inconsistencies** and **unused code** that should be addressed.

**Overall Grade: B+** (Good architecture with room for cleanup)

---

## Architecture Overview

### ✅ Strengths

1. **Clean Core Abstraction Layer**
   - `src/hooks/core/` provides excellent reusable hooks
   - `createQueryHook` and `createResource` are well-designed factory patterns
   - Consistent error handling with `useMutation`
   - Proper separation between queries and mutations

2. **Modular Structure**
   - Each module (tasks, notes, folders) follows the same pattern
   - Clear separation: `api/queries/` and `api/mutations/`
   - Type-safe with TypeScript throughout

3. **InstantDB Integration**
   - Centralized client configuration in `src/api/db/client.ts`
   - Well-defined schema with relationships
   - Proper use of transactions for complex operations

---

## Critical Issues

### 🔴 1. Schema vs TypeScript Type Mismatch

**Location:** `src/api/db/schema.ts`

**Problem:** The `Task` type includes a `status` field, but the InstantDB schema does NOT define it:

```typescript
// TypeScript type (lines 154-155)
export type Task = {
  status: 'todo' | 'in_progress' | 'blocked' | 'done';  // ❌ NOT in schema
  // ...
}

// InstantDB schema (lines 19-34)
tasks: i.entity({
  content: i.string(),
  completed: i.boolean(),
  // ... no status field defined
})
```

**Impact:**

- Any code trying to query or update `status` will fail at runtime
- The field won't be persisted to the database
- Type safety is misleading

**Found in:**

- `src/modules/tasks/api/mutations/update.ts` (line 8)
- `src/api/db/schema.ts` (line 154)

**Recommendation:** Either:

1. Add `status: i.string()` to the schema, OR
2. Remove `status` from the TypeScript type and use `completed` boolean instead

---

### 🟡 2. Invalid Query Field: `serverCreatedAt`

**Location:** `src/modules/notes/api/queries/get-notes.ts:8`

```typescript
notes: {
  $: {
    order: { serverCreatedAt: 'desc' },  // ❌ Field doesn't exist
  },
}
```

**Problem:** The schema defines `createdAt`, not `serverCreatedAt`

**Fix:** Change to `createdAt: 'desc'`

---

### 🟡 3. Schema Relationship Inconsistency

**Location:** `src/api/db/schema.ts:108-119`

**Problem:** The `taskComments` relationship is backwards:

```typescript
taskComments: {
  forward: {
    on: 'comments',    // ❌ Should be 'tasks'
    has: 'many',
    label: 'comments',
  },
  reverse: {
    on: 'tasks',       // ❌ Should be 'comments'
    has: 'one',
    label: 'task',
  },
}
```

**Expected:** A task has many comments, a comment belongs to one task.

**Correct structure:**
```typescript
taskComments: {
  forward: {
    on: 'tasks',
    has: 'many',
    label: 'comments',
  },
  reverse: {
    on: 'comments',
    has: 'one',
    label: 'task',
  },
}
```

**Same issue with `taskActivity` relationship (lines 120-131)**

---

## Code Quality Issues

### 🟠 4. Unused Core Hook: `createResource`

**Location:** `src/hooks/core/create-resource.ts`

**Status:** ❌ **NEVER USED**

This factory function is exported but has **zero usages** across the codebase. All modules use `useCreate`, `useUpdate`, `useDestroy` directly instead.

**Recommendation:**

- Remove this file if you don't plan to use it
- OR refactor modules to use it for consistency

---

### 🟠 5. Duplicate Utility Functions

**Problem:** You have TWO `cn()` functions:

1. `src/lib/utils.ts` - ❌ **UNUSED**
2. `src/shared/utilities/cn.ts` - ✅ **USED** (via `utils` alias)

**Recommendation:** Delete `src/lib/utils.ts`

---

### 🟠 6. Unused Search Utilities

**Location:** `src/lib/search-utils.ts`

**Status:** ❌ **NEVER IMPORTED**

The functions `highlightText()` and `matchesSearch()` are defined but never used. The actual search implementation is in `src/modules/search/repositories/search-repository.ts`.

**Recommendation:** Delete `src/lib/search-utils.ts`

---

### 🟠 7. Incomplete Folder Deletion

**Location:** `src/modules/folders/api/mutations/destroy.ts`

```typescript
export function useDestroyFolder() {
  const { mutate, isLoading, error } = useMutation(async (id: string) => {
    await transact([tx.folders[id].update({ updatedAt: Date.now() })]);  // ❌ Only updates timestamp
    return { id };
  });
  return { destroyFolder: mutate, isLoading, error };
}
```

**Problem:** This doesn't actually delete the folder! It only updates the timestamp.

**Expected:** Should set `deletedAt` or call `.delete()`:

```typescript
await transact([
  tx.folders[id].update({ deletedAt: Date.now(), updatedAt: Date.now() })
]);
```

---

## Architectural Inconsistencies

### 🟡 8. Inconsistent Mutation Patterns

**Pattern A** (Notes, Folders):
```typescript
const { create } = useCreate('notes');
const { mutate, isLoading, error } = useMutation(async (input) => {
  await create(id, data);
});
```

**Pattern B** (Tasks):
```typescript
const { mutate, isLoading, error } = useMutation(async (input) => {
  await transact([tx.tasks[id].update(data)]);
});
```

**Recommendation:** Standardize on one pattern. Pattern A is cleaner and more reusable.

---

### 🟡 9. Type Casting Issues

Multiple files use `(tx.comments[id].link as any)` and `(tx.activity[activityId].link as any)`:

**Location:** `src/modules/tasks/api/mutations/add-comment.ts:17, 23`

This suggests the TypeScript types for InstantDB might need updating or the schema relationships need fixing (see issue #3).

---

## Dead Code / Unused Files

### Files to Consider Removing:

1. ✅ **Keep but unused:** `src/hooks/core/create-resource.ts`
   - Well-designed but never used
   - Decision: Keep for future use OR refactor to use it

2. ❌ **Delete:** `src/lib/utils.ts`
   - Duplicate of `src/shared/utilities/cn.ts`

3. ❌ **Delete:** `src/lib/search-utils.ts`
   - Unused, replaced by `src/modules/search/repositories/search-repository.ts`

---

## Best Practices Followed ✅

1. **Consistent file structure** across modules
2. **Type safety** throughout the codebase
3. **Error handling** with proper error states
4. **Loading states** tracked consistently
5. **Transaction usage** for complex operations
6. **Path aliases** properly configured (`@/`, `utils`, `schema`)
7. **Optimistic updates** via InstantDB's transact

---

## Recommendations Priority

### High Priority (Fix Now)

1. ✅ Fix schema/type mismatch for `Task.status`
2. ✅ Fix `taskComments` and `taskActivity` relationship directions
3. ✅ Fix `serverCreatedAt` → `createdAt` in notes query
4. ✅ Fix `useDestroyFolder` to actually delete/soft-delete

### Medium Priority

5. Remove unused files (`lib/utils.ts`, `lib/search-utils.ts`)
6. Decide on `createResource` - use it or remove it
7. Standardize mutation patterns across modules
8. Fix type casting issues in add-comment

### Low Priority (Nice to Have)

9. Add JSDoc comments to core hooks
10. Consider adding integration tests for mutations
11. Add validation layer before mutations

---

## Module-Specific Findings

### Tasks Module ✅

- **Well structured** with clear separation
- Has comments and activity tracking
- Supports subtasks, dependencies, recurrence
- **Issue:** Status field not in schema

### Notes Module ✅

- **Clean implementation**
- Complex move/reorder logic is well-handled
- **Issue:** Uses non-existent `serverCreatedAt` field

### Folders Module ⚠️

- **Mostly good**
- Soft-delete pattern with `deletedAt` is good
- **Issue:** `useDestroyFolder` doesn't actually delete

---

## Conclusion

Your architecture is **solid and well-thought-out**. The core abstraction layer is excellent, and the modular structure makes the codebase maintainable. The main issues are:

1. Schema inconsistencies (easy to fix)
2. Some dead code (easy to remove)
3. One broken mutation (`useDestroyFolder`)

After addressing the high-priority issues, you'll have a very clean and consistent API layer.

**Estimated fix time:** 1-2 hours for all high-priority issues.
