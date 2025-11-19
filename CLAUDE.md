# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a note-taking application called "Quantum Works" with a hybrid architecture supporting both local and cloud storage. It features a React frontend with a Node.js/Hono backend and uses Drizzle ORM with Turso (SQLite) for data persistence.

## Development Commands

```bash
# Development
pnpm dev              # Start development server on port 42069

# Building
pnpm build            # Build both client and server
pnpm build:client     # Build client SPA
pnpm build:server     # Build server for production

# Testing
pnpm test             # Run tests with Vitest
pnpm test:run         # Single test run

# Code Quality
pnpm typecheck        # TypeScript type checking
pnpm format.fix       # Format code with Prettier

# Production
pnpm start            # Start production server
```

## Database Operations

```bash
# Drizzle Kit commands
drizzle-kit generate  # Create migrations
drizzle-kit migrate   # Run migrations
drizzle-kit studio    # Database UI
drizzle-kit push      # Push schema changes
```

## Technology Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with Rolldown (experimental)
- **Routing**: React Router DOM v6
- **UI**: Radix UI primitives + shadcn/ui components
- **Styling**: Tailwind CSS v4
- **State Management**: React hooks + custom patterns
- **Editor**: BlockNote for rich text editing

### Backend
- **Runtime**: Node.js 22
- **Framework**: Hono (lightweight web framework)
- **Database**: Drizzle ORM with Turso (SQLite)
- **Deployment**: Supports Netlify Functions via `api/index.ts`

### Development
- **Package Manager**: pnpm (v10.14.0)
- **Testing**: Vitest
- **Language**: TypeScript (strict mode)

## Architecture

### Directory Structure
```
client/                 # React frontend
├── features/           # Feature-based modules
│   ├── editor/        # Rich text editor functionality
│   └── notes/         # Note management
├── shared/            # Shared frontend code
│   ├── storage/       # Storage abstraction layer
│   ├── ui/           # Reusable UI components
│   └── data/         # Data management utilities
├── app/              # App-level setup
└── components/       # Page-specific components

server/                # Node.js backend
├── db/               # Database setup and queries
├── routes/           # API route handlers
└── index.ts          # Server configuration

api/                  # Deployment entry point
└── index.ts         # Netlify Functions handler
```

### Key Patterns

#### Storage Abstraction
The app uses a pluggable storage system defined in `client/shared/storage/types/index.ts:3`:
- **StorageAdapter interface** defines standard CRUD operations
- **Multiple backends**: localStorage, cloud (Turso), file system, InstantDB, PGLite
- **Hybrid mode**: Local storage with cloud sync capabilities

#### Feature Organization
- Features are self-contained modules with their own components, hooks, and services
- Shared utilities live in `client/shared/`
- UI components are separated from business logic

#### Data Flow
- Server provides REST API via Hono at `/api/notes`
- Client uses storage adapters that can work with different backends
- Real-time updates through storage event listeners

## Configuration

### Environment Variables
- `DATABASE_URL`: Turso database connection
- `TURSO_AUTH_TOKEN`: Turso authentication token

### Path Aliases
- `@/`: Points to `client/`
- `@shared/`: Points to `shared/` (for cross-client sharing)
- `@ui/`: Points to `client/shared/ui/`

## Development Guidelines

### Code Style (from .builder/rules)
- **No code comments**: Code should be self-documenting through descriptive names
- **Small components**: Break down complex UI into smaller, maintainable pieces
- **Type over interface**: Use `type` unless polymorphism is needed
- **Simple logic**: Avoid nested ternary operators and complex expressions

### File Organization
- Keep components focused and small
- Create auxiliary files for complex pages
- Follow the feature-based structure for new functionality
- Use shared directories for cross-cutting concerns

### Storage Implementation
When working with storage:
- Use the StorageAdapter interface for new storage backends
- Implement proper error handling with StorageError
- Support both online and offline operations where applicable
- Use batch operations for better performance

## Build System

The project uses a dual-build setup:
- **Client build**: Vite SPA build to `dist/spa/`
- **Server build**: Separate Vite config to `dist/server/` for Node.js deployment
- **Development**: Hono server integrated as Vite middleware for API routes

## Testing

- Unit tests with Vitest
- Test files should be `.spec.ts` or `.test.ts`
- Run tests before building