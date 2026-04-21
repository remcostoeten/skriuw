# Skriuw

## Mobile

Run the Expo app from the repo root:

```bash
bun run dev:mobile
```

Useful mobile commands:

```bash
bun run dev:mobile:tunnel
bun run dev:mobile:lan
bun run dev:mobile:web
bun run dev:mobile:ios
bun run dev:mobile:android
bun run mobile:ios
bun run mobile:android
bun run mobile:typecheck
bun run mobile:doctor
```

`dev:mobile:*` starts Expo with the relevant target or connection mode.
`mobile:ios` and `mobile:android` run the native Expo build commands.

Set up local Expo env vars if you want cloud-ready mobile config:

```bash
bun run mobile:env:setup
```

That copies the root `.env.local` into `apps/mobile/.env.local`.

Mobile auth code accepts either:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The legacy `EXPO_PUBLIC_SUPABASE_ANON_KEY` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` names are still supported as fallbacks.

So copying the root env file is enough for local setup if web is already
configured.

A keyboard-first note-taking application built with Next.js, React, and
TypeScript.

## Features

- **Markdown and Rich Text Editing**: Switch between markdown and rich text modes
- **File Management**: Create, organize, and manage notes with folders
- **Keyboard-First**: Optimized for keyboard navigation and shortcuts
- **Responsive Design**: Works on desktop and mobile
- **Cloud Workspace**: Notes, folders, journal entries, and tags are loaded from Supabase

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Custom components with Radix UI primitives
- **State Management**: Zustand
- **Editor**: Blocknote for rich text editing
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, or bun

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd skriuw

# Install dependencies
npm install
# or
yarn install
# or
bun install

# Start development server
npm run dev
# or
yarn dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Supabase Setup

This app uses Supabase for all persistent backend storage.

Copy the env template first:

```bash
cp .env.example .env.local
```

Set these client-safe env vars in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Supabase project notes:

- Enable Email/Password, Google, and GitHub providers if you want all auth options in the drawer.
- Disable email confirmation if you want email sign-up to create an immediate session with no verification step.
- Add your local and production callback URLs in Supabase Auth settings for OAuth redirects.
- For Expo mobile OAuth, also allow `skriuw://auth/callback` as a redirect URL in Supabase Auth.
- The connected Supabase schema expects public tables named `notes`, `folders`, `journal_entries`, and `tags`, each scoped by `user_id` with RLS enabled.
- Mobile now supports email/password plus Google and GitHub OAuth via Expo deep links.

### Build

```bash
npm run build
npm run start
```

## Project Structure

```
src/
├── app/          # Route entry points and top-level composition
├── features/     # Product features: notes, journal, settings, layout, tags
├── platform/     # Auth and platform/runtime integrations
├── shared/       # Reusable UI primitives and generic helpers
├── core/         # Persistence adapters and repository layer
├── providers/    # App-level providers and bootstrapping
└── types/        # Shared TypeScript types still used across older layers
```

## Usage

### Creating Notes

1. Click "New File" in the sidebar or press `Ctrl+N`
2. Choose between Markdown or Rich Text mode
3. Start typing

### Organizing Notes

- Create folders to organize your notes
- Drag and drop files to move them between folders
- Use the search feature to find notes quickly

### Keyboard Shortcuts

- `Ctrl+N`: Create new note
- `Ctrl+S`: Save note (auto-saves by default)
- `Ctrl+/`: Toggle sidebar
- `Ctrl+Shift+P`: Command palette

## Development

### Adding New Components

1. Put feature-specific UI and state under `src/features/<feature>/`
2. Put shared UI primitives in `src/shared/ui/`
3. Keep route files in `src/app/` thin and focused on composition
4. Put auth and runtime integrations in `src/platform/`

### State Management

The app uses colocated Zustand stores inside the owning feature where possible:

- `features/notes/store.ts`: note and folder state
- `features/settings/store.ts`: local UI/preferences state
- `features/layout/store.ts`: shell UI state
- `features/tags/store.ts`: tag data

### Styling

- Uses Tailwind CSS for styling
- Custom theme defined in `tailwind.config.ts`
- Dark mode support via CSS variables

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
