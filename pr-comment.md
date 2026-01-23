## ✅ Addressed Sourcery AI Review Comments

All 4 critical issues from @sourcery-ai have been resolved:

### 1. ✅ Task Type Mismatch (Bug Risk)

- **Fixed**: Replaced duplicate local `Task` type with import from `@skriuw/db`
- **Added**: `TaskWithNote` type for API responses that include computed `noteName` field
- **Updated**: All query hooks to return `TaskWithNote` where appropriate
- **Files**: `features/tasks/types.ts`, `features/tasks/hooks/use-tasks-query.ts`, `components/sidebar/tasks-sidebar-content.tsx`

### 2. ✅ Note Visibility Mutation (Bug Risk)

- **Fixed**: Changed to call `/api/notes` PUT endpoint directly instead of generic CRUD update
- **Preserves**: Server logic for `publicId` generation and cloud storage validation
- **File**: `features/notes/hooks/use-notes-query.ts` (lines 330-348)

### 3. ✅ Account Unlink Optimistic Update (Bug Risk)

- **Fixed**: Filter now uses both `providerId` AND `accountId` to remove only the specific account
- **Prevents**: Accidentally removing all accounts for a provider when user has multiple
- **File**: `features/account/hooks/use-account-query.ts` (lines 61-70)

### 4. ✅ Move Mutation Performance (Performance)

- **Added**: Optimistic update with `onMutate` handler for instant UI feedback
- **Includes**: Proper error rollback via `onError`
- **File**: `features/notes/hooks/use-notes-query.ts` (lines 242-279)

---

## ✅ Addressed CodeRabbit Suggestions

### 1. ✅ Use Shared `generateId` Function

- **Fixed**: Replaced local `generateId` with `@skriuw/shared` utility
- **Benefit**: More robust ID generation with timestamp for better uniqueness
- **File**: `features/notes/hooks/use-notes-query.ts`

### 2. ✅ Fix Import Ordering

- **Fixed**: Moved TanStack Query imports to top of file
- **Complies**: With coding conventions requiring imports before code
- **File**: `app/providers.tsx`

### 3. ✅ Fix Race Condition in Task Detail Page

- **Fixed**: Added `isDirty` flag to track user edits
- **Prevents**: Fresh task data from overwriting in-progress user edits
- **Implementation**: `useEffect` only syncs when `!isDirty`, cleared after save
- **File**: `app/(app)/tasks/[taskId]/page.tsx`

### 4. ✅ Fix Build Error (Critical)

- **Fixed**: `Property 'description' does not exist on type 'Task'`
- **Cause**: Stale local `Task` definition in `get-tasks.ts` missing new fields
- **Resolution**: Removed local type, now imports centralized definition
- **File**: `features/tasks/api/queries/get-tasks.ts`

### 5. ✅ Activity Query Key Collision (Major)

- **Fixed**: Query key now includes full options object (`{ limit, startDate, endDate }`)
- **Prevents**: Cache collisions when same limit used with different date ranges
- **File**: `features/activity/hooks/use-activity-query.ts`

### 6. ✅ Days Parameter Type Consistency

- **Fixed**: Changed `calendar` key param from `string` to `number`
- **Removed**: Unnecessary `String(days)` conversion
- **File**: `features/activity/hooks/use-activity-query.ts`

### 7. ✅ BaseEntity Duplication (Major)

- **Fixed**: Removed local `BaseEntity` from shortcuts types
- **Now imports**: From `features/tasks/types.ts`
- **File**: `features/shortcuts/types.ts`

### 8. ✅ Sync Error Handling

- **Fixed**: Added `onError` handler to `useSyncTasksMutation`
- **Now logs**: Errors instead of silently failing
- **File**: `features/tasks/hooks/use-tasks-query.ts`

---

## 📋 Remaining Suggestions (Follow-up PR)

@coderabbitai suggested these additional improvements:

1.  **Use `@skriuw/crud`** (Refactor): Consider replacing local `request()` wrapper with standard CRUD package for tasks.
2.  **Optimistic Updates** (Nice-to-have): Add to create/pin/favorite mutations.a
3.  **Simplify Boolean Transformation** (Nice-to-have): Minor cleanup in sidebar `moveItem`.

---

## ✅ Verification

TypeScript compilation passes with no errors:

```bash
npx tsc --noEmit
# ✓ No errors
```

---

@sourcery-ai @coderabbitai All critical and major feedback has been addressed. Please re-review!
