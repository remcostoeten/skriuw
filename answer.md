# Frequently Asked Questions

## Project Overview

**Q: What is this project?**
A: This appears to be a Next.js application with authentication features, using Better Auth for user management. The project includes command execution functionality and has recently undergone refactoring to consolidate packages and improve RSC compatibility.

**Q: What technology stack is being used?**
A:
- **Frontend**: Next.js 16, React, TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Better Auth
- **UI Components**: Custom components with Radix UI primitives
- **State Management**: React hooks and context
- **Package Manager**: Bun

## Development Commands

**Q: How do I start the development server?**
A: Run `bun run dev` to start the development server.

**Q: How do I build for production?**
A: Run `bun run build` to create a production build.

**Q: How do I install dependencies?**
A: Use `bun install` to install all project dependencies.

## Recent Changes

**Q: What was the recent refactoring about?**
A: The project recently consolidated packages and fixed RSC (React Server Components) compatibility issues. This involved:
- Removing the command palette feature (deleted files in `components/command-palette/`)
- Removing command definitions and execution system
- Removing keybinding management features
- Updating authentication components and providers

**Q: What files were recently modified?**
A:
- `apps/web/app/layout.tsx` - Main layout updated
- `apps/web/app/providers.tsx` - Provider configuration changed
- Authentication components updated for Better Auth integration
- Landing page components modified
- Shortcut functionality updated

## Authentication

**Q: How does authentication work in this app?**
A: The application uses Better Auth for authentication with:
- Auth modal system for sign-in/sign-up
- Floating paths animation component for auth pages
- Global shortcut provider for keyboard interactions
- Session management through providers

**Q: Where are the authentication components located?**
A: Authentication components are in:
- `apps/web/components/auth/` - Auth modal and provider
- `apps/web/features/authentication/` - Auth-specific features and components

## Shortcuts Feature

**Q: What is the shortcuts feature?**
A: The shortcuts feature allows users to create and manage keyboard shortcuts for quick access to actions or commands.

**Q: Where is shortcut-related code located?**
A:
- API queries: `apps/web/features/shortcuts/api/queries/`
- Global provider: `apps/web/features/shortcuts/global-shortcut-provider.tsx`
- Definitions: `apps/web/features/shortcuts/shortcut-definitions.ts`

## Common Development Tasks

**Q: How do I add a new page?**
A: Create a new route in the `apps/web/app/` directory following Next.js App Router conventions.

**Q: How do I add a new component?**
A: Create components in appropriate directories:
- Reusable components: `apps/web/components/`
- Feature-specific components: `apps/web/features/[feature-name]/components/`

**Q: How do I modify the authentication flow?**
A: Update components in `apps/web/components/auth/` and `apps/web/features/authentication/`. The auth configuration is likely in the providers and layout files.

## Troubleshooting

**Q: I'm having issues with the command palette.**
A: The command palette feature has been removed in the recent refactoring. If you need similar functionality, you'll need to implement it using the new command executor system or create a custom solution.

**Q: Where did the keybinding features go?**
A: Keybinding management has been removed. Keyboard shortcuts are now handled through the shortcuts feature in `apps/web/features/shortcuts/`.

## File Structure

**Q: What's the overall project structure?**
A:
```
apps/web/
├── app/                    # Next.js App Router pages
├── components/             # Reusable UI components
├── features/               # Feature-specific modules
│   ├── authentication/     # Auth features
│   └── shortcuts/          # Shortcut management
└── lib/                    # Utilities and configurations
```

## Getting Started

**Q: How do I set up the project for the first time?**
A:
1. Clone the repository
2. Run `bun install` to install dependencies
3. Set up environment variables (check for `.env.example`)
4. Run `bun run dev` to start the development server

**Q: Are there any environment variables I need to configure?**
A: Yes, you'll likely need to configure:
- Authentication secrets (for Better Auth)
- Database connection strings (if applicable)
- OAuth provider credentials (if using social login)

Check for a `.env.example` file in the project root for specific variables needed.

---

## Technical Implementation Details

### SESSION
**anonymous**: yes/no
- Anonymous authentication is supported via Better Auth's anonymous plugin
- Users can be created as anonymous (`isAnonymous: true` in database)

**storage**: localStorage | cookie | DB
- **Primary**: Database (PostgreSQL via Drizzle ORM)
- **Session tokens**: Stored in HTTP-only cookies (Better Auth default)
- **Client-side**: Session state managed via Better Auth's nanostores

**cookie/token names**: ...
- Better Auth handles cookie naming automatically
- Session table has `token` field for session identification
- Cookie names are managed internally by Better Auth

**frontend read**: ...
- Uses `useSession()` hook from Better Auth's React client
- Session state is reactive via nanostores
- Components receive instant updates without page reloads

### ANON
**exists**: yes/no
- Yes, anonymous authentication is implemented
- Uses Better Auth's anonymous plugin

**storage**: ...
- Database storage with `isAnonymous: true` flag in user table
- Sessions are created and stored in database like regular users
- No special localStorage for anonymous users

**fields**: id, createdAt...
```typescript
User table fields:
- id: text (primary key)
- name: text
- email: text (unique)
- emailVerified: boolean
- image: text
- createdAt: timestamp
- updatedAt: timestamp
- isAnonymous: boolean (for anonymous users)

Session table fields:
- id: text (primary key)
- expiresAt: timestamp
- token: text (unique)
- createdAt: timestamp
- updatedAt: timestamp
- ipAddress: text
- userAgent: text
- userId: text (references user.id)
```

**detect if anon exists**: ...
- Check session user data for `isAnonymous` property
- Database query: `SELECT * FROM "user" WHERE "isAnonymous" = true`

### CRUD
**actions type**: server actions | fetch routes
- **Primary**: Server actions (`'use server'`)
- Authentication: `requireAuth()` server action helper
- API routes: Use `requireAuth` from `@/lib/api-auth`

**db used**: ...
- **PostgreSQL** via Drizzle ORM
- Connection: `@skriuw/db` package
- Tables: notes, folders, settings, tasks, shortcuts, storage_connectors
- User context: `@skriuw/crud/context` for user-scoped operations

### GLOBAL STATE
**auth modal**: provider or local state
- **Provider**: `AuthModalProvider` (global context)
- Uses React Context API for state management
- Disabled by default in providers (`<AuthModalProvider disabled>`)

**errors**: thrown | returned
- **Server actions**: Errors are thrown (`throw new Error('Authentication required')`)
- **Client**: Error handling via try/catch and custom error states
- **Auth modal**: Opens automatically on 401 errors via custom events

### Additional Implementation Details

**Authentication Flow**:
1. Better Auth handles session creation and storage
2. Session tokens stored in HTTP-only cookies
3. Client reads session via `useSession()` hook
4. Server actions validate via `requireAuth()` helper
5. Anonymous users supported via Better Auth plugin

**State Management**:
- Auth: Better Auth client with nanostores
- App state: React Context providers (SettingsProvider, NotesProvider, etc.)
- User context: CRUD operations scoped via `setUserContext()`

**Error Handling**:
- Auth errors trigger custom `skriuw:auth-required` events
- Server actions throw errors for authentication failures
- Auth modal auto-opens on 401 responses