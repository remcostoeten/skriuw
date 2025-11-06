# SK - Skriuw Development CLI

A powerful, interactive CLI tool for managing development workflows. Works as a drop-in replacement for `bun run dev` with multi-framework support (Vite, Vinxi, Next.js) and advanced features.

## Installation

### Local Development (Monorepo)

Already included in the Skriuw monorepo. No installation needed!

```bash
# From project root
bun run sk
# or
bun run cli
```

### Global Installation

Install globally to use `sk` from anywhere:

```bash
# Using bun
bun add -g @skriuw/sk

# Using npm
npm install -g @skriuw/sk

# Using pnpm
pnpm add -g @skriuw/sk
```

After global installation, use `sk` from any directory:

```bash
sk dev          # Run dev server
sk              # Interactive menu
```

### From Source

```bash
cd tools/sk
bun install
bun run build
```

## Usage

### Quick Start

**Interactive Menu:**
```bash
sk
# or
bun run sk
```

**Direct Dev Mode (replaces `bun run dev`):**
```bash
sk dev
# or
bun run dev  # if configured in package.json
```

### Command-Line Options

```bash
sk              # Interactive menu
sk dev          # Direct dev mode (single app)
sk start        # Same as dev
```

### Package.json Integration

Replace `bun run dev` in your `package.json`:

```json
{
  "scripts": {
    "dev": "sk dev"
  }
}
```

Then run:
```bash
bun run dev
npm run dev
```

## Features

### 🚀 Development

**Run Apps:**
- Start individual apps or all apps simultaneously
- Auto-detect framework (Vite, Vinxi, Next.js)
- Auto-detect ports from dev server output
- Framework-specific ready detection
- Non-blocking process management

**Interactive Dev Mode:**
- Full dev server output (like `bun run dev`)
- Interactive status bar with hotkeys
- Press keys for quick actions:
  - **O** - Open in browser
  - **C** - Open in code editor
  - **R** - Restart app
  - **S** - Stop app
  - **G** - Open Git repository
  - **M** - Switch to menu mode

### 🔨 Build & Deploy

**Build:**
- Build individual apps or all at once
- Framework-specific build commands
- Detailed build summaries with timing
- Success/failure tracking

**Deploy:**
- Deploy to Vercel staging
- Deploy to Vercel production
- One-command deployment

### ⌨️ Process Management

**Hotkeys (Menu Mode):**
- **O** - Open in browser
- **C** - Open in code editor
- **R** - Restart app
- **S** - Stop app
- **I** - Install package

**Process Features:**
- Background process execution
- Port conflict detection
- Health checks
- Status monitoring
- Graceful shutdown

### 📊 Advanced Features

**Storage Configuration:**
- Set storage path (default: `~/.config/sk`)
- Set storage type (SQLite or JSON)
- Enable/disable storage
- Open storage path in editor

**Logs Management:**
- View logs with fuzzy search
- Press **E** to open logs in editor
- Set custom log directory
- Clear logs
- Enable/disable logging
- Human-readable log format

**System:**
- Health check for all apps
- Port conflict detection
- Reinstall SK (creates script)

### 🎯 Framework Support

**Auto-Detection:**
- **Next.js** - Detects `next` dependency, config files, `app/`/`pages/` directories
- **Vinxi** - Detects `vinxi` dependency or `vinxi.config.ts`
- **Vite** - Detects `vite` dependency or `vite.config.*` files

**Port Detection:**
- Extracts ports from dev server output
- Framework-specific port patterns
- Dynamic port updates

**Ready Detection:**
- Framework-specific ready patterns
- Knows when apps are ready
- Shows status immediately

### 🏗️ Project Support

**Monorepo Mode:**
- Auto-detects apps in `apps/` directory
- Detects framework for each app
- Manages multiple apps simultaneously

**Single-App Mode:**
- Works in any project directory
- Auto-detects framework
- Zero configuration needed

## Complete Feature List

### Core Features
- ✅ Interactive menu with ASCII logo
- ✅ Arrow-key navigation
- ✅ Colorized output (no emojis)
- ✅ Framework auto-detection (Vite, Vinxi, Next.js)
- ✅ Port auto-detection
- ✅ Ready state detection

### Development Features
- ✅ Run individual apps
- ✅ Run all apps simultaneously
- ✅ Direct dev mode (`sk dev`)
- ✅ Interactive hotkeys in dev mode
- ✅ Process management
- ✅ Output filtering
- ✅ Status display

### Build Features
- ✅ Build individual apps
- ✅ Build all apps
- ✅ Build summaries with timing
- ✅ Success/failure tracking
- ✅ Framework-specific build commands

### Deployment Features
- ✅ Deploy to staging (Vercel)
- ✅ Deploy to production (Vercel)
- ✅ Deployment progress tracking

### Process Management
- ✅ Background processes
- ✅ Port conflict detection
- ✅ Health checks
- ✅ Process monitoring
- ✅ Graceful shutdown

### Hotkeys
- ✅ **O** - Open in browser
- ✅ **C** - Open in code editor
- ✅ **R** - Restart app
- ✅ **S** - Stop app
- ✅ **I** - Install package
- ✅ **G** - Open Git repository (dev mode)
- ✅ **M** - Switch to menu mode (dev mode)
- ✅ **E** - Open logs in editor (log viewer)

### Storage & Logs
- ✅ Storage path configuration
- ✅ Storage type (SQLite/JSON)
- ✅ Enable/disable storage
- ✅ Log directory configuration
- ✅ View logs with fuzzy search
- ✅ Clear logs
- ✅ Enable/disable logging
- ✅ Human-readable log format

### Utilities
- ✅ Open repository in browser
- ✅ Package installation
- ✅ Health checks
- ✅ Reinstall SK

### Framework Support
- ✅ Next.js detection and support
- ✅ Vinxi detection and support
- ✅ Vite detection and support
- ✅ Fallback to package.json scripts
- ✅ Custom framework patterns

### Project Modes
- ✅ Monorepo support
- ✅ Single-app support
- ✅ Auto-detection
- ✅ Zero configuration

## Configuration

### Config File

Edit `tools/sk/src/config.ts` to customize:

```typescript
export const config: Config = {
  apps: [
    {
      name: 'my-app',
      displayName: 'My App',
      path: './apps/my-app',
      dev: 'bun run dev',      // Override auto-detection
      build: 'bun run build',  // Override auto-detection
      port: 4000,              // Override auto-detection
      color: '#3b82f6'
    }
  ],
  editor: 'cursor',            // Your preferred editor
  deploy: {
    staging: 'vercel deploy',
    production: 'vercel deploy --prod'
  }
}
```

### Storage Configuration

Default storage location: `~/.config/sk`

- Config file: `~/.config/sk/config.json`
- Logs: `~/.config/sk/logs/cli.log`

Configure via Advanced menu or edit config directly.

## Examples

### Vite Project

```bash
cd my-vite-app
sk dev

# Output:
Starting App...
VITE v5.x.x ready in 500 ms
➜  Local:   http://localhost:5173/

────────────────────────────────────────────────────────────────────────────────
[App] Running on http://localhost:5173 | [O]pen [C]ode [R]estart [S]top [G]it [M]enu
────────────────────────────────────────────────────────────────────────────────

# Press O → Opens browser
# Press R → Restarts server
```

### Next.js Project

```bash
cd my-nextjs-app
sk dev

# Auto-detects Next.js
# Runs "next dev"
# Shows ready status
# Interactive hotkeys available
```

### Monorepo

```bash
cd my-monorepo
sk

# Shows menu with all detected apps
# Each app has its framework auto-detected
# Run individually or all at once
```

## Requirements

- **Bun 1.1.0+** (recommended) or Node.js 18+
- **Git** (for repository features)
- **Vercel CLI** (optional, for deployment)

## Troubleshooting

### Port Already in Use

The CLI will detect port conflicts and ask if you want to proceed.

### Framework Not Detected

If framework isn't detected, the CLI falls back to `package.json` scripts. You can also configure manually in `config.ts`.

### Hotkeys Not Working

Ensure your terminal supports TTY raw mode. Try a different terminal emulator if issues persist.

## Documentation

Full documentation available at:
- [Getting Started](/docs/cli/getting-started)
- [Configuration](/docs/cli/configuration)
- [Features](/docs/cli/features)
- [Usage Guide](/docs/cli/usage)
- [Troubleshooting](/docs/cli/troubleshooting)

## License

Part of the Skriuw monorepo project.
