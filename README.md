# Haptic - Notes

A minimal, keyboard-first note-taking application built with Next.js, React, and TypeScript.

## Features

- **Markdown and Rich Text Editing**: Switch between markdown and rich text modes
- **File Management**: Create, organize, and manage notes with folders
- **Keyboard-First**: Optimized for keyboard navigation and shortcuts
- **Dark/Light Theme**: Built-in theme support
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Local-First Storage**: All notes save locally first, with optional Supabase backup/sync
- **Privacy Mode**: Continue without an account when you want local-only notes

## Tech Stack

- **Framework**: Next.js 15 with App Router
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
cd skriuwv2

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

### Optional Supabase Auth + Sync

Cloud backup/sync is optional. Privacy mode still works without any auth setup.

```bash
cp .env.example .env.local
```

Set these client-safe env vars in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Supabase project notes:

- Enable Email/Password, Google, and GitHub providers if you want all auth options in the drawer.
- Disable email confirmation if you want email sign-up to create an immediate session with no verification step.
- Add your local and production callback URLs in Supabase Auth settings for OAuth redirects.

### Build

```bash
npm run build
npm run start
```

## Project Structure

```
src/
├── app/                    # Next.js app router pages
├── components/
│   ├── haptic/            # Core application components
│   └── ui/                # Reusable UI components
├── hooks/                 # Custom React hooks
├── lib/                   # Utility functions
├── modules/               # Feature modules (settings, auth)
├── providers/             # React context providers
├── store/                 # Zustand stores
└── types/                 # TypeScript type definitions
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

1. Create component in `src/components/haptic/` for app-specific components
2. Create component in `src/components/ui/` for reusable UI components
3. Follow existing naming conventions and TypeScript patterns

### State Management

The app uses Zustand for state management:

- `notesStore`: File and folder management
- `settingsStore`: User preferences and settings

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
