# Tauri Local-First Monorepo

A monorepo exploring two approaches for building a local-first note-taking application with tasks.

## Structure

```
tauri-local/
├── apps/
│   ├── turso/          # Tauri + React + Turso + Drizzle
│   └── instantdb/      # Tauri + Next.js + InstantDB
└── scripts/
    └── generate-turso-db.py
```

## Apps

### 1. Turso MVP (`apps/turso`)

**Stack:**
- Tauri 2.0
- React + TypeScript
- Turso (LibSQL) with embedded replicas
- Drizzle ORM

**Setup:**
```bash
# Generate Turso database
python3 scripts/generate-turso-db.py

# Create .env file with output
cd apps/turso
# Add TURSO_URL and TURSO_AUTH_TOKEN to .env

# Install and run
pnpm install
pnpm dev        # Web dev server
pnpm tauri dev  # Desktop app
```

### 2. InstantDB MVP (`apps/instantdb`)

**Stack:**
- Tauri 2.0
- Next.js + TypeScript + Tailwind CSS
- InstantDB with TypeScript-first schema
- Offline support & optimistic updates

**Setup:**
```bash
cd apps/instantdb

# Create .env.local with InstantDB credentials
# Add NEXT_PUBLIC_INSTANT_APP_ID

# Install and run
pnpm install
pnpm dev        # Web dev server
pnpm tauri dev  # Desktop app
```

## Requirements

- Node.js 18+
- pnpm
- Rust (for Tauri)
- Python 3 (for Turso setup script)
- Turso CLI (for Turso app)

## Development

```bash
# Install all dependencies
pnpm install

# Run Turso app
pnpm dev:turso
pnpm tauri:turso

# Run InstantDB app
pnpm dev:instantdb
pnpm tauri:instantdb
```

## Features

Both apps implement the same note-taking application with:
- Create, read, update, delete notes (markdown support)
- Tasks within notes (checkbox lists)
- Local-first architecture
- Cross-platform (desktop via Tauri, web via Vercel)
- Automatic sync between desktop and web

## Deployment

- **Turso app**: Deploy to Vercel (React SPA)
- **InstantDB app**: Deploy to Vercel (Next.js)

