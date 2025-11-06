# SK - Interactive CLI Tool

SK is a powerful, interactive command-line tool designed to streamline development, building, and deployment workflows for Node.js monorepos and single-package projects.

## Features

- **Interactive Menu** - Beautiful ASCII art and arrow-key navigation
- **Process Management** - Run multiple apps without blocking the terminal
- **Hotkey Controls** - Quick actions with single keypresses (O, C, R, S, I)
- **Build Automation** - Build individual apps or all at once with detailed summaries
- **Deployment Integration** - Direct Vercel deployment from the CLI
- **Live Monitoring** - Real-time status of running applications
- **Framework Detection** - Auto-detects Vite, Vinxi, and Next.js projects
- **Port Conflict Detection** - Warns about port conflicts before starting apps
- **Logging System** - Comprehensive logging with rotation and search
- **Extensible** - Easy to add custom tools and workflows via configuration

## Installation

```bash
npm install -g @skriuw/sk
```

Or using bun:

```bash
bun add -g @skriuw/sk
```

## Quick Start

From your project root:

```bash
# Launch interactive menu
sk

# Or run dev mode directly
sk dev
```

## Configuration

SK uses a simple configuration file at `tools/sk/src/config.ts` (or your configured path). You can customize:

- **Apps** - Development applications with their paths, commands, and ports
- **Tools** - Custom utilities and scripts
- **Deploy URLs** - Quick access to deployed applications
- **Editor** - Default code editor
- **Deploy Commands** - Custom deployment scripts

See the [documentation](https://docs-skriuw.vercel.app/docs/cli) for detailed configuration options.

## Usage

### Interactive Menu Mode

Run `sk` without arguments to launch the interactive menu:

- **Development** - Start individual apps or all apps
- **Build** - Build apps with timing and success tracking
- **Deploy** - Deploy to staging or production
- **Tools** - Run custom tools configured in your project
- **Advanced** - Logs, storage configuration, health checks

### Direct Dev Mode

Run `sk dev` to start development mode directly (like `bun run dev` but with interactive controls):

- Full dev server output
- Interactive hotkeys (O=open, C=code, R=restart, S=stop, G=git, M=menu)
- Non-intrusive status bar

### Hotkeys

When apps are running, use these hotkeys:

- **O** - Open app in browser
- **C** - Open app in code editor
- **R** - Restart app
- **S** - Stop app
- **I** - Install packages
- **M** - Return to menu
- **G** - Open repository (direct mode)

## Framework Support

SK automatically detects and supports:

- **Next.js** - Detects `next.config.js`, `app/`, or `pages/` directories
- **Vite** - Detects `vite.config.*` files
- **Vinxi** - Detects `vinxi.config.*` files
- **Generic** - Falls back to package.json scripts

## Requirements

- Node.js 18+ or Bun
- Linux or macOS (Windows not supported)

## Documentation

Full documentation is available at: https://docs-skriuw.vercel.app/docs/cli

## License

MIT

