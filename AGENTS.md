# AGENTS.md

> **Context for AI Agents**: This file is the single source of truth for all coding rules, architectural constraints, and development patterns in this repository. Read this file before planning or changing code.

## 1. Core Principles

### Security Before Convenience

- **User-owned data must never be accessed without explicit auth and user scoping.**
- API routes are private by default; open/public access must be intentional and documented.
- Admin/dev actions (seed/reset/list-users) require explicit admin authorization.

### Hybrid Data Model

- Guest/offline behavior can use local adapter paths (via `@skriuw/crud`).
- Authenticated behavior must use server-backed data flows (Postgres).
- Do not force one storage mode onto all features.

### Typed Contracts

- Database shapes come from `@skriuw/db`.
- Cross-feature/domain types go in `packages/shared` or feature `types/`.
- Minimize duplicate type declarations across app and packages.

### Verify, Then Ship

- Validate behavior changes via `bun run check-types`, tests, and targeted runtime checks.
- Keep agent docs/rules synchronized with real commands and current folder layout.

---

## 2. Architecture & Tech Stack

### Monorepo Structure

- **`apps/web`**: Next.js 16 app (App Router) and primary runtime.
- **`apps/web/src-tauri`**: Tauri desktop wrapper for the same app.
- **`packages/db`**: Drizzle schema + migrations.
- **`packages/crud`**: Client data abstraction and adapter interface.
- **`packages/shared` / `packages/ui`**: Shared utilities and components.

### Feature Colocation

Prefer colocating feature code under `apps/web/features/<feature-name>`:

```
apps/web/features/<feature-name>/
├── api/
├── components/
├── hooks/
├── utils/
├── types/
└── index.ts (optional)
```

- Cross-feature app infrastructure belongs in `apps/web/lib`, `apps/web/components`, or `apps/web/modules`.
- Shared package-level concerns belong in `packages/*`.

### Imports

- Prefer `@/features/<feature-name>` for feature internals.
- Prefer package imports for shared contracts (`@skriuw/shared`, `@skriuw/db`, `@skriuw/ui`).
- Avoid deep cross-feature relative imports when a feature public API exists.

---

## 3. Data Flow & Storage

### Typical Flow

1. **UI component** triggers action.
2. **Feature hook** coordinates query/mutation state.
3. **Feature API function** (or route client) performs operation.
4. **Server route/helper** applies auth + tenant scoping.
5. **DB/storage adapter** executes the scoped operation.

### Rules

1. **API Route Authorization Is Mandatory**:
    - Private reads: `requireAuth()` (or stronger).
    - Mutations: `requireMutation()` unless endpoint is intentionally public.
    - Guest-readable routes must explicitly use `allowReadAccess()` and still scope by returned user id.

2. **Tenant Scoping Is Mandatory**:
    - When querying `notes`, `folders`, `tasks`, `settings`, `shortcuts`, `storage_connectors`, include `userId` filtering.
    - Do not run unscoped `select/update/delete` on user-owned tables in API routes.

3. **Data Layer Choice**:
    - Client-side feature operations: prefer `@skriuw/crud`.
    - Server-side operations: prefer `lib/server/crud-helpers` or `lib/storage/adapters/server-db`.
    - Use raw `getDatabase()` in routes only when helper layers are insufficient.

4. **Fetching Strategy**:
    - Default to **TanStack Query** for reusable async state.
    - `useEffect` fetches are acceptable only for narrow bootstrap/dev tasks.
    - Keep optimistic updates and query invalidation consistent with mutation side effects.

---

## 4. API Security Rules

- **Authorization by Default**: Assume all API routes are private. Use shared auth helpers (`requireAuth`).
- **Tenant Scoping**: For user-owned tables, every query/mutation must include user scoping.
- **Admin/Dev Endpoints**: Seed/reset/maintenance endpoints must require explicit admin authorization. `NODE_ENV === 'development'` is not enough.
- **Public Endpoints**: If an endpoint is public, document why and constrain returned fields.

---

## 5. Feature Mutation Rules

### Responsibilities

Each mutation should:

1. Validate/normalize input.
2. Execute data operation through the intended layer (`@skriuw/crud`, route client, or server helper).
3. Keep cache/state coherent (invalidate or optimistic update rollback).
4. Apply cross-cutting concerns (activity tracking, analytics).
5. Return predictable typed output or throw actionable errors.

### Cross-Cutting Concerns

- Use `trackActivity` where the feature expects activity records.
- Fire-and-forget side effects are acceptable if business-critical mutation success doesn't depend on them.
- Swallowing errors is allowed only for non-critical side effects and must be intentional.

### Anti-Patterns

- Unscoped mutations against user-owned tables.
- Mutation functions that skip cache reconciliation for user-visible state.
- Silent failure on primary data writes.

---

## 6. Design System & Aesthetics

### Existing System First

- Reuse `@skriuw/ui` components before creating one-off primitives.
- Follow existing tokens and CSS variables in `apps/web/styles/globals.css`.
- Keep the current app visual language consistent.

### Tailwind v4 Rules

1. Prefer utility-first styling and existing semantic classes.
2. Use CSS-driven Tailwind v4 (`@theme`, CSS vars), not a required `tailwind.config.ts`.
3. Avoid arbitrary values unless there is no tokenized alternative.
4. Ensure both light and dark themes render correctly.

### UX Expectations

- Async actions should expose pending/success/error feedback.
- Maintain accessible interactions: focus visibility, keyboard navigation, labels.

---

## 7. Canonical Commands

### Root

- **Dev**: `bun run dev`
- **Build**: `bun run build`
- **Start**: `bun run start`
- **Lint**: `bun run lint`
- **Type Check**: `bun run check-types`
- **Test**: `bun run test`
- **Validate**: `bun run validate`

### Database

- **Generate**: `bun run gen`
- **Migrate**: `bun run migrate`
- **Push**: `bun run dbpush`
- **Studio**: `bun run studio`

### App-Local (`apps/web`)

- **Dev**: `bun run dev`
- **Build**: `bun run build` (Note: `next build` may be unstable on some Bun versions; use `node node_modules/.bin/next build` if needed).

---

## 8. Build & Validation Notes

- **TypeScript in Build**: `apps/web/next.config.ts` sets `typescript.ignoreBuildErrors = true`. You **MUST** always run `bun run check-types` separately to verify type safety.
- **Testing**:
    - For API changes: add/adjust tests for auth and user-scoping behavior.
    - For feature mutations: verify cache invalidation + optimistic behavior.
