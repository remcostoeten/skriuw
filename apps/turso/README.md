# Turso Notes - Local-First Note-Taking App

A desktop and web note-taking application built with Tauri 2.0, React, Turso (LibSQL), and Drizzle ORM.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Desktop:** Tauri 2.0
- **Database:** Turso (LibSQL) with embedded replicas
- **ORM:** Drizzle ORM
- **Styling:** Tailwind CSS + shadcn/ui (dark monochrome theme)
- **UI Components:** Radix UI primitives

## Features

- ✅ Create, read, update, and delete notes
- ✅ Markdown content support
- ✅ Task lists within notes (checkboxes)
- ✅ Local-first with automatic cloud sync
- ✅ Works offline with embedded SQLite replicas
- ✅ Cross-platform desktop app (Windows, macOS, Linux)
- ✅ Web deployment support (Vercel)
- ✅ Dark monochrome UI

## Project Structure

```
apps/turso/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   └── note-editor.tsx  # Main note editor component
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts    # Drizzle schema definition
│   │   │   └── client.ts    # Database client setup
│   │   └── utils.ts         # Utility functions
│   ├── modules/
│   │   ├── notes/
│   │   │   └── api/
│   │   │       ├── queries/     # Note queries
│   │   │       └── mutations/   # Note mutations
│   │   └── tasks/
│   │       └── api/
│   │           ├── queries/     # Task queries
│   │           └── mutations/   # Task mutations
│   ├── views/
│   │   └── notes-view.tsx   # Main notes view
│   └── App.tsx
├── src-tauri/               # Tauri configuration
└── drizzle.config.ts        # Drizzle configuration
```

## Setup

### Prerequisites

- Node.js 18+
- pnpm
- Rust (for Tauri)
- Turso CLI
- Python 3 (for database setup script)

### 1. Install Dependencies

```bash
cd apps/turso
pnpm install
```

### 2. Create Turso Database

Run the provided Python script from the project root:

```bash
python3 scripts/generate-turso-db.py
```

This will:
- Create a new Turso database
- Output the database URL and auth token
- Copy credentials to clipboard (if available)

### 3. Configure Environment

Create a `.env` file in `apps/turso/`:

```env
VITE_TURSO_DATABASE_URL=libsql://your-database.turso.io
VITE_TURSO_AUTH_TOKEN=your-auth-token-here
```

### 4. Push Database Schema

```bash
pnpm drizzle-kit push
```

## Development

### Web Development

```bash
pnpm dev
```

Opens the app at `http://localhost:5173`

### Desktop Development

```bash
pnpm tauri:dev
```

Launches the Tauri desktop app with hot reload.

## Building

### Web Build

```bash
pnpm build
```

Outputs to `dist/` - ready for deployment to Vercel or any static host.

### Desktop Build

```bash
pnpm tauri:build
```

Creates platform-specific installers in `src-tauri/target/release/bundle/`

## Architecture

### Database Schema

**Notes Table:**
- `id` (text, primary key)
- `title` (text)
- `content` (text, markdown)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

**Tasks Table:**
- `id` (text, primary key)
- `noteId` (text, foreign key → notes.id)
- `content` (text)
- `completed` (boolean)
- `position` (integer)
- `createdAt` (timestamp)

### CRUD Pattern

Following a modular architecture:

1. **Schema Definition** (`lib/db/schema.ts`)
2. **Client Setup** (`lib/db/client.ts`)
3. **Query Hooks** (`modules/*/api/queries/`)
4. **Mutation Hooks** (`modules/*/api/mutations/`)
5. **View Components** (`views/`)

Example usage:

```tsx
// In a component
import { useNotes } from '@/modules/notes/api/queries/get-notes';
import { useCreateNote } from '@/modules/notes/api/mutations/create-note';

function MyComponent() {
  const { data: notes, refetch } = useNotes();
  const { createNote } = useCreateNote();

  const handleCreate = async () => {
    await createNote({ title: 'New Note', content: '' });
    refetch();
  };

  return (/* ... */);
}
```

## Deployment

### Web (Vercel)

1. Push to GitHub
2. Import project to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Desktop

Distribute the built installers from `src-tauri/target/release/bundle/`

## Sync Behavior

- **Embedded Replicas:** Local SQLite database syncs with Turso cloud every 60 seconds
- **Offline Support:** Full read/write capabilities offline
- **Automatic Sync:** Changes sync automatically when connection is restored
- **Cross-Platform:** Desktop and web share the same Turso database

## Troubleshooting

### Database connection errors

Ensure your `.env` file has correct credentials from Turso CLI:

```bash
turso db show your-database --url
turso db tokens create your-database
```

### Build errors

Make sure all prerequisites are installed:

```bash
# Check Rust
rustc --version

# Check Tauri CLI
pnpm tauri --version
```

## License

MIT
