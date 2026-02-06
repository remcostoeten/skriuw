# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Skriuw is a cross-platform note and task manager built with Next.js and Tauri. The web app runs on Next.js with a PostgreSQL backend; the desktop app uses Tauri as a shell around the same Next.js web interface.

## Commands

```bash
# Development
bun run dev              # Start Next.js dev server (apps/web)
bun run build            # Production build
bun run lint             # Run ESLint via packages/style
bun run format           # Run Prettier
bun run fix              # Run both lint and format fixes

# Testing
bun run test             # Run all tests via Turborepo
bun run test:verbose     # Run tests with verbose output
cd apps/web && bun test features/notes/utils/parser.test.ts  # Run single test file

# Database (from root)
bun run gen              # Generate Drizzle migrations
bun run migrate          # Run migrations
bun run dbpush           # Push schema directly (dev only)
bun run studio           # Open Drizzle Studio

# Type checking
bun run check-types      # TypeScript check via Turborepo
bun run validate         # Full validation: lint + types + test + build
```

## Core Philosophy: No DRY Violations

**Every repetitive concern must be abstracted.** Never manually define:

- Error handling (throw & let boundaries handle it)
- Loading states (wrapped in hooks/utilities)
- Validation logic (centralized in API layer)
- UI feedback patterns (use shared utilities)

Components should only define _intent_. Infrastructure (errors, loading, validation, feedback) is always handled by abstraction layers (hooks, utilities, API functions).

## Architecture

### Monorepo Structure (Bun workspaces + Turborepo)

```
apps/
  web/                   # Next.js 16 app (also Tauri frontend)
  desktop/               # Tauri desktop shell
  docs/                  # Documentation site

packages/
  db/                    # Drizzle schema, migrations (PostgreSQL/Neon)
  crud/                  # CRUD abstraction layer with caching
  shared/                # Shared types and utilities
  ui/                    # UI component library
  config/                # Shared configs (ESLint, TypeScript)
  style/                 # Linting/formatting commands
  env/                   # Environment validation (t3-oss/env)
```

### Feature-Based Architecture

All feature code lives in `apps/web/features/<feature-name>/`:

```
features/<feature>/
├── api/
│   ├── queries/         # get-*.ts files (data fetching)
│   └── mutations/       # create-*.ts, update-*.ts, delete-*.ts
├── components/          # Feature-specific UI
├── hooks/               # Custom React hooks
├── utils/               # Helper functions
└── types/               # Feature-specific types
```

**Import pattern**: Use `@/features/<feature-name>` for internal imports.

### Data Flow

1. UI component triggers action
2. Feature hook handles logic + abstracts errors/loading (`useCreateNote`)
3. Feature API mutation/query (`createNote`) - handles validation, error context
4. CRUD package (`@skriuw/crud`) executes operation - standardized errors
5. Storage layer (PostgreSQL via Drizzle)

**Key rule**: Never access storage directly in UI. Always use `@skriuw/crud` functions.

**Abstraction mandate**: Error handling and loading states must NOT leak into components. They're handled by custom hooks or utilities that return clean interfaces (`isPending`, `error`, `data`).

### CRUD Package (`@skriuw/crud`)

```typescript
import {
	create,
	readOne,
	readMany,
	update,
	destroy,
	setAdapter,
	setUserContext
} from '@skriuw/crud'

// Operations are user-scoped via setUserContext
await create<Note>(STORAGE_KEYS.NOTES, { name: 'My Note' })
await readOne<Note>(STORAGE_KEYS.NOTES, 'note-123')
await update<Note>(STORAGE_KEYS.NOTES, 'note-123', { name: 'Updated' })
await destroy(STORAGE_KEYS.NOTES, 'note-123')
```

### Mutation Pattern

Every mutation must:

1. Execute CRUD operation
2. Invalidate relevant caches
3. Track activity via `trackActivity` (fire-and-forget)
4. Return typed result

```typescript
import { create } from '@skriuw/crud'
import { trackActivity } from '@/features/activity'

export async function createNote(data: CreateNoteData): Promise<Note> {
    const result = await create<Note>(STORAGE_KEYS.NOTES, { ... })
    invalidateItemsCache()
    trackActivity({ entityType: 'note', entityId: result.data.id, action: 'created' })
    return result.data
}
```

### Database Schema (`packages/db`)

Main entities: `notes`, `folders`, `tasks`, `user`, `session`, `settings`, `shortcuts`, `storageConnectors`, `aiProviderConfig`

Types are exported from `@skriuw/db`: `Note`, `Folder`, `Task`, `User`, etc.

### State Management

- **TanStack Query**: Server state (notes, folders, settings) - handles loading/error/caching automatically
- **Zustand**: Client state (UI state, editor state) - for UI-only state
- **Optimistic UI**: All mutations update UI immediately before server confirms

**No manual state for async operations.** If you're writing `const [isLoading, setIsLoading] = useState()` in a component, you're doing it wrong. Use a hook or TanStack Query instead.

### Tech Stack

- **Runtime**: Bun 1.3.3
- **Framework**: Next.js 16 (App Router)
- **Desktop**: Tauri 2.0
- **Database**: PostgreSQL (Neon serverless or standard)
- **ORM**: Drizzle
- **Auth**: Better Auth
- **Editor**: BlockNote
- **Styling**: Tailwind CSS v4

### Environment Variables

Key env vars (see `turbo.json` for full list):

- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - Auth secret (min 32 chars)
- `BETTER_AUTH_URL` - Auth callback URL

### Testing

Tests use Bun's native test runner with JSDOM for DOM simulation. Test files are in `apps/web/__tests__/`.

```bash
# Run specific test
cd apps/web && bun test __tests__/notes/wikilink-parser.test.ts
```

## Documentation

For comprehensive documentation, see [`/docs/README.md`](docs/README.md).

### Key Documentation Files
- [Architecture Decisions](docs/ARCHITECTURAL_DECISIONS.md) - Core design principles (read this first!)
- [Documentation Index](docs/INDEX.md) - Complete map of all documentation
- [Feature Status](docs/STATUS.md) - What's shipped, planned, in progress
- [Organization Guide](docs/ORGANIZATION.md) - How documentation is structured

### Contributing to Documentation
See [docs/ORGANIZATION.md](docs/ORGANIZATION.md) for:
- Where to put new documentation
- File naming conventions
- Documentation standards
- Cross-linking guidelines
