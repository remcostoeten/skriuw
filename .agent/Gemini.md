# Gemini / Antigravity Agent Instructions

> **CRITICAL**: Read this file before planning or executing any tasks. These rules supersede generic defaults.

## 1. Core Architecture Pattern

All feature implementations MUST follow this layered flow:

1. **Database**: Defined in `@skriuw/db` (`schema.ts`).
2. **Base Query**: Generic abstraction (e.g., `lib/server/crud-helpers.ts` for server, `@skriuw/crud` for client).
3. **Domain Query**:
    - **Server**: Server Actions in `features/*/api/queries/get-*.ts`.
    - **Client**: Logic wrapping the generic package.
4. **Domain Hook**: React Query Hooks (`features/*/hooks/use-*.ts`) wrapping the Domain Query.
5. **View**: React Components consuming ONLY the Domain Hooks.

## 2. Data Fetching Standards

- ❌ **NEVER** fetch data inside `useEffect`.
- ✅ **ALWAYS** use `@tanstack/react-query` (Hooks) for data fetching and mutations.
- **Server State**: Managed via Server Actions + React Query.
- **Client State**: Managed via `@skriuw/crud` + React Query (offline-first notes).

## 3. CRUD & Abstraction

- **Boilerplate**: Do NOT write manual DB queries or Auth checks in every file.
    - Use `requireAuth()` and generic helpers like `readOwned(table)` or `destroyOwned(table, id)`.
- **Client vs Server**:
    - `@skriuw/crud` is for **Client/Offline** data (Notes).
    - `lib/server/crud-helpers` is for **Server/Postgres** data (Media, User).
    - **DO NOT** mix them.

## 4. Terminology

- ❌ **Delete**: Do not use this term for actions/functions.
- ✅ **Destroy**: Use "Destroy" for removal operations (e.g., `destroyFile`, `useDestroyFileMutation`).

## 5. Application Context

- **Hybrid Architecture**: The application is **NOT** purely Local-First.
    - **Notes**: Local-First/Offline-capable.
    - **Media/User**: Server-First (Postgres/S3).
- Do not force server features into client-side offline patterns.

## 6. Code Style

- **No Comments**: Code must be self-explanatory.
- **Structure**: Keep `api`, `hooks`, `components`, `server` directories consistent within features.
