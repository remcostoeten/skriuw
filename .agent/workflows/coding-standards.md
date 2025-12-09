---
description: Coding standards and architectural patterns for the Skriuw project
---

# Skriuw Coding Standards

## 1. Storage & Caching
- **Centralized Keys**: NEVER hardcode storage keys (e.g., `'Skriuw_notes'`). Always import from `@/lib/storage-keys`.
  ```typescript
  import { STORAGE_KEYS } from '@/lib/storage-keys'
  // Usage: STORAGE_KEYS.NOTES, STORAGE_KEYS.SETTINGS
  ```
- **Cache Layers**: Use the `@skriuw/crud` package's built-in caching where possible. Avoid creating ad-hoc local `Map` caches unless strictly necessary for specific UI behavior (like hover prefetching).

## 2. Shared Utilities
- **Tree/Recursive Operations**: Do NOT duplicate recursive find/filter logic. Use `features/notes/utils/tree-helpers.ts` (to be created).
  - `findItemById(items, id)`
  - `findFolder(items, id)`
  - `isDescendant(parentId, childId)`

## 3. File Organization
- **Feature-based**: Keep code collocated with the feature it belongs to (`features/notes`, `features/settings`).
- **API Routes**: API handlers should be thin wrappers around shared logic or `crud` operations.
- **Naming**:
  - Hooks: `use-feature-name.ts` (kebab-case)
  - Components: `FeatureName.tsx` (PascalCase)
  - Utilities: `utility-name.ts` (kebab-case)

## 4. Imports
- Use path aliases (`@/features/...`, `@/lib/...`) instead of relative paths (`../../../`).
- Barrel files (`index.ts`) should be used sparingly and only for public APIs of a feature.

## 5. State Management
- Prefer URL state or Server state (via React Query/Suspense) over global client state (Zustand/Context) where possible.
- For complex local state, use `useReducer` or specialized hooks.
