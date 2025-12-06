import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'

export const architectureOverviewSeed = {
	name: 'Architecture Overview',
	contentMarkdown: `# Architecture Overview

This document describes the current architecture of Skriuw, a Next.js-based note-taking application.

## Technology Stack

### Frontend Framework
- **Next.js 15.1.0** with App Router
- **React 18.3.1** with Server Components for maximum SSR/SEO benefits
- **TypeScript** for type safety

### Database & ORM
- **PostgreSQL** hosted on **Neon** (serverless PostgreSQL)
- **Drizzle ORM** for type-safe database queries
- Auto-detects Neon from \`DATABASE_URL\` or uses standard PostgreSQL

### UI Components
- **BlockNote** - Rich text editor with block-based content
- **Radix UI** - Accessible component primitives
- **Tailwind CSS** - Utility-first styling
- **Framer Motion** - Animations

## Architecture Pattern

### Data Flow

\`\`\`text
Frontend Components
  ↓
React Hooks (useNotes, etc.)
  ↓
Storage Adapter (serverless-api)
  ↓
Next.js API Routes (/api/notes, etc.)
  ↓
Drizzle ORM (getDatabase())
  ↓
PostgreSQL on Neon
\`\`\`

## API Routes Structure

All CRUD operations go through Next.js API routes:

- **\`/api/notes\`** - GET, POST, PUT, DELETE for notes and folders
- **\`/api/settings\`** - GET, POST, DELETE for user settings
- **\`/api/shortcuts\`** - Keyboard shortcut management
- **\`/api/tasks\`** - Task/checkbox management
- **\`/api/health\`** - Health check endpoint

## Database Schema

The database uses the following tables (defined in \`lib/db/schema.ts\`):

- **\`notes\`** - Note content, metadata, hierarchy
- **\`folders\`** - Folder structure and hierarchy
- **\`settings\`** - User preferences and configuration
- **\`tasks\`** - Task/checkbox items linked to notes
- **\`shortcuts\`** - Custom keyboard shortcuts

## Storage Abstraction Layer

The application uses a generic storage adapter pattern:

- **Location**: \`lib/storage/\`
- **Adapter**: \`serverless-api\` - Makes HTTP requests to Next.js API routes
- **Benefits**: 
  - Separation of concerns
  - Easy to swap storage backends
  - Consistent API across different storage types

## Key Design Principles

1. **Maximum SSR**: Server Components by default for SEO and performance
2. **Separation of Concerns**: Clear boundaries between UI, business logic, and data access
3. **Type Safety**: Full TypeScript coverage with Drizzle ORM schema types
4. **Serverless Ready**: Designed for Vercel deployment with Neon database

## File Structure

\`\`\`text
app/
  ├── api/              # API route handlers
  ├── page.tsx          # Home page
  └── layout.tsx        # Root layout

features/
  └── notes/
      ├── api/          # Frontend API calls (mutations/queries)
      ├── components/   # Note-related UI components
      └── hooks/        # React hooks for notes

lib/
  ├── db/               # Database configuration and schema
  └── storage/          # Storage abstraction layer
\`\`\`

## Deployment

- **Platform**: Vercel
- **Database**: Neon (serverless PostgreSQL)
- **Build**: Uses Bun for package management
- **Environment**: Configured via \`DATABASE_URL\` environment variable

## Development Commands

\`\`\`bash
# Database
bun run db:push      # Push schema to database
bun run db:generate  # Generate migrations
bun run db:studio    # Open Drizzle Studio
bun run db:seed      # Seed database with initial data

# Development
bun run dev          # Start development server
bun run build        # Build for production
bun run start        # Start production server
\`\`\`

## Notes

- The app supports both Tauri (desktop) and web deployments
- Tauri-specific code is conditionally loaded and doesn't break web builds
- All database operations are server-side only (via API routes)
- The storage layer provides a clean abstraction for future storage backends`,
} satisfies DefaultNote
