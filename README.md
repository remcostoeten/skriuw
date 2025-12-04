**Skriuw** *(noun)*  
/skrɪu̯/ — *Frisian, “to write.”*  

A local-first desktop application for writing and organizing thoughts. Built with Tauri 2.0 and React, **Skriuw** blends note-taking and task management into a fast, private workspace with Markdown editing and offline access.  

---

## Monorepo Setup

This project uses a modern monorepo setup with Bun workspaces, optimized for Vercel deployment.

### Structure

```
skriuw/
├── apps/
│   └── web/                 # Next.js web application
├── packages/
│   ├── db/                  # Database schema and utilities
│   ├── ui/                  # Shared UI components
│   └── core-logic/          # Core business logic
├── turbo.json               # Turborepo configuration
├── vercel.json              # Vercel deployment configuration
└── package.json             # Root package.json with workspace scripts
```

### Development

Install dependencies:
```bash
bun install
```

Run development server:
```bash
bun run dev
```

Build for production:
```bash
bun run build
```

### Available Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run lint` - Run ESLint
- `bun run lint:fix` - Fix ESLint issues
- `bun run format` - Format code with Prettier
- `bun run typecheck` - Run TypeScript type checking
- `bun run db:push` - Push database schema changes
- `bun run db:generate` - Generate database migrations
- `bun run db:studio` - Open Drizzle Studio

### Deployment

This monorepo is configured for Vercel deployment with:

- Bun as the package manager
- Turborepo for efficient builds
- Next.js framework detection
- Proper workspace dependency resolution

The root `vercel.json` handles the monorepo configuration, so individual app configurations are not needed.
