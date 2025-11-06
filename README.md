# Skriuw

A local-first, near-instant sync note-taking application built with Tauri 2.0, Next.js, and InstantDB.

## About

I've wanted to build a desktop app for years but always quit — Electron's DX was painful, and Tauri felt daunting.
Rust was intimidating, sync engines messy, and rich text editors a nightmare. My perfectionism over design didn't help either.

Then I discovered a Svelte note app that nailed the exact UI I wanted. I lost it after reinstalling my OS. Seemed unmaintained and permissively licensed, I rebuilt it — this time with **Tauri 2.0**, **Next.js**, and **InstantDB**.

Some visuals stay true to the original, but I'm gradually adding my own flavor and broader features.
Much love to that forgotten minimalist app — it finally pushed me to finish the one I kept abandoning.

## Project Structure

```
skriuw/
├── apps/
│   ├── instantdb/    # Main Tauri + Next.js app
│   └── docs/         # Documentation site (Fumadocs)
├── tools/
│   ├── cli-manager/  # Interactive CLI tool for managing the monorepo
│   └── seeder/       # Database seeding utilities
└── plans/            # Project planning and documentation
```

## Quick Start

### Using the CLI Manager (Recommended)

The easiest way to manage this monorepo is with the interactive CLI:

```bash
# From project root
bun run cli

# Or use the short alias
bun run sk

# Or use the shell script
./sk
```

This launches an interactive menu where you can:
- Start/stop individual apps or all apps
- Build apps with detailed summaries
- Deploy to Vercel (staging/production)
- Manage running processes with hotkeys
- Install packages without stopping apps
- Open repository in browser

### Manual Development

```bash
# Install dependencies
bun install

# Run the main app
cd apps/instantdb
bun run dev

# Run docs
cd apps/docs
bun run dev
```

## CLI Manager Features

The CLI manager provides a powerful, interactive interface for development:

- **Interactive Menu** - Beautiful ASCII art and arrow-key navigation
- **Process Management** - Run multiple apps without blocking
- **Hotkey Controls** - Quick actions (O=open, C=code, R=restart, S=stop, I=install)
- **Build Automation** - Build individual apps or all at once
- **Deployment** - Direct Vercel deployment from CLI
- **Live Monitoring** - Real-time status of running apps

See [tools/cli-manager/README.md](tools/cli-manager/README.md) for detailed documentation.

## Tech Stack

### Main App (apps/instantdb)
- **Tauri 2.0** - Desktop application framework
- **Next.js** - React framework with TypeScript
- **InstantDB** - Real-time database with offline support
- **Tailwind CSS** - Utility-first CSS framework
- **TipTap** - Rich text editor

### Docs (apps/docs)
- **Fumadocs** - Documentation framework
- **Next.js** - Static site generation

## Development

### Prerequisites
- Bun 1.1.0+
- Node.js 18+ (for some tools)
- Git

### Scripts

From the project root:

```bash
bun run cli          # Launch CLI manager
bun run sk           # Short alias for CLI
bun run dev          # Run main app directly
bun run build        # Build main app
bun run format       # Format code with Prettier
```

### Building for Production

Using the CLI:
```bash
bun run cli
# Select "Build All Apps" from menu
```

Manual build:
```bash
cd apps/instantdb
bun run build
bun run tauri:build
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Test using the CLI manager
4. Commit and push
5. Create a pull request

## Documentation

- [CLI Manager Documentation](tools/cli-manager/README.md)
- [Seeding Guide](SEEDING.md)
- [Shortcuts Reference](SHORTCUTS.md)

## License

MIT
