# Skriuw

Say goodbye to clutter in your head and organize yourself on any platform, fully accessible without any loading times and completely private data storage on your own machine with opt-in cloud-sync storage ... something local ai or cloud....


A feature rich _me_ multiplatform app 
A local-first, near-instant sync note-taking application built with Tauri 2.0, Next.js, and Skriuw.

## About

I've wanted to build a desktop app for years but always quit — Electron's DX was painful, and Tauri felt daunting.
Rust was intimidating, sync engines messy, and rich text editors a nightmare. My perfectionism over design didn't help either.

Then I discovered a Svelte note app that nailed the exact UI I wanted. I lost it after reinstalling my OS. Seemed unmaintained and permissively licensed, I rebuilt it — this time with **Tauri 2.0**, **Next.js**, and **Skriuw**.

Some visuals stay true to the original, but I'm gradually adding my own flavor and broader features.
Much love to that forgotten minimalist app — it finally pushed me to finish the one I kept abandoning.

## Project Structure

```
skriuw/
├── apps/
│   ├── instantdb/    # Main Tauri + Next.js app
│   └── docs/         # Documentation site (Fumadocs)
├── tools/
│   ├── sk/            # Interactive CLI tool (SK)
│   └── seeder/       # Database seeding utilities
└── plans/            # Project planning and documentation
```

## Quick Start

### Start Development Server

The easiest way to get started:

```bash
# Install dependencies
bun install

# Start dev server (automatically uses Servo if available)
bun run dev
```

This will:
- **Use Servo** if it's installed (better dev experience with interactive menu)
- **Fall back** to regular `bun run dev` if Servo isn't available
- Show a helpful message if Servo isn't found

### Using Servo (Optional but Recommended)

Servo provides an interactive menu for managing the monorepo:

```bash
# Install Servo (one-time setup)
cd tools/servo
./install.sh

# Now `bun run dev` will use Servo automatically
cd ../..
bun run dev
```

Or run Servo directly:

```bash
cd tools/servo
./servo
```

This launches an interactive menu where you can:
- Start/stop individual apps or all apps
- Build apps with detailed summaries
- Deploy to Vercel (staging/production)
- Manage running processes with hotkeys
- Install packages without stopping apps
- Open repository in browser

### Manual Development (Without Servo)

If you prefer not to use Servo:

```bash
# Install dependencies
bun install

# Run the main app directly
bun run dev:direct

# Or manually
cd apps/web
bun run dev

# Run docs
cd apps/docs
bun run dev
```

## SK Features

SK provides a powerful, interactive interface for development:

- **Interactive Menu** - Beautiful ASCII art and arrow-key navigation
- **Process Management** - Run multiple apps without blocking
- **Hotkey Controls** - Quick actions (O=open, C=code, R=restart, S=stop, I=install)
- **Build Automation** - Build individual apps or all at once
- **Deployment** - Direct Vercel deployment from CLI
- **Live Monitoring** - Real-time status of running apps

Full documentation is available in the [SK docs](http://localhost:3000/docs/cli) (start the docs app first).

## Tech Stack

### Main App (apps/web)
- **Tauri 2.0** - Desktop application framework
- **Next.js** - React framework with TypeScript
- **Skriuw** - Real-time database with offline support
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
bun run dev          # Start dev server (uses Servo if available, falls back to regular dev)
bun run dev:direct   # Run dev server directly (bypasses Servo)
bun run build        # Build main app
bun run format       # Format code with Prettier
```

### Using Servo

If Servo is installed, `bun run dev` will automatically use it. Otherwise, it falls back to regular dev commands.

To install Servo:
```bash
cd tools/servo
./install.sh
```

### Building for Production

Using SK:
```bash
sk
# Select "Build All Apps" from menu
```

Manual build:
```bash
cd apps/web
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

- [SK Documentation](http://localhost:3000/docs/cli) - Complete guide for the interactive CLI tool
- [Seeding Guide](SEEDING.md) - Database seeding utilities
- [Shortcuts Reference](SHORTCUTS.md) - Keyboard shortcuts reference

For the full documentation site, run `bun run cli` and select "Run Docs App", then visit `http://localhost:3000`.

## License

MIT
