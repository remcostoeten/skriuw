# InstantDB Notes - Real-Time Local-First Note-Taking App

A desktop and web note-taking application built with Tauri 2.0, Next.js, and InstantDB for real-time sync and offline support.

## Tech Stack

- **Frontend:** Next.js 15 + React 18 + TypeScript
- **Desktop:** Tauri 2.0
- **Database:** InstantDB (graph-based, real-time)
- **Styling:** Tailwind CSS 4 + shadcn/ui (dark monochrome theme)
- **UI Components:** Radix UI primitives

## Features

- ✅ Create, read, update, and delete notes
- ✅ Markdown content support
- ✅ Task lists within notes (checkboxes)
- ✅ **Real-time sync** across all devices
- ✅ **Optimistic updates** for instant UI feedback
- ✅ **Offline-first** with local caching
- ✅ **No backend required** - InstantDB handles everything
- ✅ Cross-platform desktop app (Windows, macOS, Linux)
- ✅ Web deployment support (Vercel)
- ✅ Dark monochrome UI

## Project Structure

```
apps/instantdb/
├── app/
│   ├── globals.css          # Global styles + theme
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home page
├── components/
│   ├── ui/                  # shadcn/ui components
│   └── note-editor.tsx      # Main note editor
├── hooks/
│   └── core/                # Core CRUD hooks
│       ├── use-create.ts
│       ├── use-read.ts
│       ├── use-update.ts
│       └── use-destroy.ts
├── lib/
│   ├── db/
│   │   ├── schema.ts        # InstantDB schema
│   │   └── client.ts        # InstantDB client
│   └── utils.ts             # Utility functions
├── modules/
│   ├── notes/
│   │   └── api/
│   │       ├── queries/     # Note queries
│   │       └── mutations/   # Note mutations
│   └── tasks/
│       └── api/
│           ├── queries/     # Task queries
│           └── mutations/   # Task mutations
├── views/
│   └── notes-view.tsx       # Main notes view
└── src-tauri/               # Tauri configuration
```

## Setup

### Prerequisites

- Node.js 18+
- pnpm
- Rust (for Tauri)
- InstantDB account (free at [instantdb.com](https://instantdb.com))

### 1. Install Dependencies

```bash
cd apps/instantdb
pnpm install
```

### 2. Create InstantDB App

1. Go to [instantdb.com/dash](https://www.instantdb.com/dash)
2. Create a new app
3. Copy your App ID

### 3. Configure Environment

Create a `.env.local` file:

```env
NEXT_PUBLIC_INSTANT_APP_ID=your-app-id-here
```

### 4. Initialize Schema (Optional)

The schema is automatically applied when you first run the app. You can also manually push it via the InstantDB dashboard.

## Development

### Web Development

```bash
pnpm dev
```

Opens the app at `http://localhost:3000`

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

Outputs to `.next/` - ready for deployment to Vercel.

### Desktop Build

```bash
pnpm tauri:build
```

Creates platform-specific installers in `src-tauri/target/release/bundle/`

## Architecture

### Database Schema

InstantDB uses a graph-based schema defined in TypeScript:

```typescript
const schema = i.graph(
  {
    notes: i.entity({
      title: i.string(),
      content: i.string(),
      createdAt: i.number(),
      updatedAt: i.number(),
    }),
    tasks: i.entity({
      content: i.string(),
      completed: i.boolean(),
      position: i.number(),
      createdAt: i.number(),
    }),
  },
  {
    // Graph relations
    noteTasks: {
      forward: { on: 'tasks', has: 'one', label: 'note' },
      reverse: { on: 'notes', has: 'many', label: 'tasks' },
    },
  }
);
```

### CRUD Pattern

Following the spec's modular architecture with core hooks:

**Core Hooks** (`hooks/core/`):
- `useCreate` - Generic create operation
- `useRead` - Generic read operation with InstantDB queries
- `useUpdate` - Generic update operation
- `useDestroy` - Generic delete operation

**Domain-Specific API** (`modules/*/api/`):
- Uses core hooks
- Adds domain logic
- Type-safe interfaces

Example usage:

```tsx
// In a component
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import { useCreateNote } from '@/modules/notes/api/mutations/create';

function MyComponent() {
  const { notes } = useGetNotes();
  const { createNote } = useCreateNote();

  const handleCreate = async () => {
    await createNote({ title: 'New Note', content: '' });
    // No refetch needed - InstantDB updates in real-time!
  };

  return (/* ... */);
}
```

### InstantDB Transactions

InstantDB uses `transact` for mutations with automatic optimistic updates:

```typescript
import { transact, tx } from '@/lib/db/client';

await transact([
  tx.notes[id].update({ title: 'Updated' }),
  tx.tasks[taskId].link({ note: id }),
]);
```

## Deployment

### Web (Vercel)

1. Push to GitHub
2. Import project to Vercel
3. Add `NEXT_PUBLIC_INSTANT_APP_ID` in Vercel dashboard
4. Deploy

### Desktop

Distribute the built installers from `src-tauri/target/release/bundle/`

## Sync Behavior

### Real-Time Sync
- Changes appear **instantly** across all connected clients
- **No manual refresh required** - updates are pushed automatically
- Works in both web and desktop apps

### Offline Support
- Full read/write capabilities offline
- Changes queue locally
- Automatically sync when connection is restored

### Optimistic Updates
- UI updates immediately before server confirmation
- Automatic rollback on errors
- No loading states needed for mutations

## InstantDB vs Traditional Databases

| Feature | InstantDB | Traditional (Turso/Postgres) |
|---------|-----------|------------------------------|
| Sync | Real-time, automatic | Manual or polling |
| Offline | Built-in | Requires custom setup |
| Schema | TypeScript-first | SQL migrations |
| Backend | None required | API server needed |
| Queries | Graph queries | SQL |
| Optimistic Updates | Built-in | Manual implementation |

## Troubleshooting

### App ID not found

Ensure your `.env.local` file has the correct App ID from InstantDB dashboard.

### Sync not working

Check browser console for connection errors. InstantDB requires WebSocket support.

### Build errors

Make sure all prerequisites are installed:

```bash
# Check versions
node --version  # Should be 18+
pnpm --version
rustc --version
```

## License

MIT
