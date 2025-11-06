# Skriuw CLI Manager

A powerful, interactive CLI tool for managing the Skriuw monorepo. Features include process management, live development servers, build automation, deployment, and hotkey-based controls.

## Features

- **Interactive Menu** - Beautiful ASCII art and arrow-key navigation
- **Process Management** - Run, stop, restart apps without blocking the terminal
- **Hotkey Controls** - Quick actions with single keypresses
- **Build & Deploy** - Automated build pipelines and Vercel deployment
- **Repository Management** - Quick access to your Git repository
- **Live Monitoring** - Real-time status of running apps
- **Package Installation** - Install dependencies without stopping apps

## Installation

From the project root:

```bash
cd tools/cli-manager
bun install
```

## Usage

### Development Mode

Run directly with tsx (no build required):

```bash
bun run dev
```

### Production Mode

Build and run:

```bash
bun run build
bun run start
```

### Quick Access

From the project root, you can run:

```bash
# Using bun
bun run --filter @skriuw/cli-manager dev

# Or create an alias in your shell config (~/.bashrc, ~/.zshrc, etc.)
alias sk="cd /path/to/skriuw && bun run --filter @skriuw/cli-manager dev"
```

## Menu Options

### Development
- **Run Individual Apps** - Start a single app (Tauri, Docs, etc.)
- **Run All Apps** - Start all configured apps simultaneously
- **Manage Running Apps** - View and control active processes

### Build
- **Build Individual Apps** - Build a single app
- **Build All Apps** - Build all apps with summary report

### Deploy
- **Deploy to Staging** - Deploy to Vercel preview
- **Deploy to Production** - Deploy to Vercel production

### Utilities
- **Open Repository** - Open GitHub repo in browser
- **Manage Running Apps** - Interactive process management

## Hotkeys

When apps are running, use these hotkeys:

- `O` - Open in browser
- `C` - Open in code editor (Cursor by default)
- `R` - Restart app
- `S` - Stop app
- `I` - Install package interactively
- `M` - Return to main menu

## Configuration

Edit `src/config.ts` to customize:

### Add/Remove Apps

```typescript
apps: [
  {
    name: 'my-app',
    displayName: 'My App',
    path: './apps/my-app',
    dev: 'bun run dev',
    build: 'bun run build',
    port: 3000,
    color: '#3b82f6'
  }
]
```

### Change Editor

```typescript
editor: 'cursor', // or 'code', 'vim', etc.
```

### Configure Deployment

```typescript
deploy: {
  staging: 'vercel deploy',
  production: 'vercel deploy --prod'
}
```

### Customize Logo

```typescript
logo: [
  '╔═══════════════════════╗',
  '║   Your Logo Here      ║',
  '╚═══════════════════════╝'
]
```

## Project Structure

```
tools/cli-manager/
├── src/
│   ├── index.ts       # Main CLI implementation
│   └── config.ts      # Configuration file
├── dist/              # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

1. **Process Spawning** - Uses Node.js `child_process` to spawn dev servers
2. **Output Filtering** - Intercepts stdout/stderr and provides clean, minimal output
3. **Interactive Prompts** - Uses Inquirer.js for beautiful menus
4. **Hotkey Detection** - Listens for keypresses in raw TTY mode
5. **Graceful Shutdown** - Properly terminates all child processes on exit

## Requirements

- **Node.js** 18+ or Bun
- **Git** (for repository features)
- **Vercel CLI** (optional, for deployments)

## Troubleshooting

### Apps not starting
- Check that the `path` in config matches your app directory
- Ensure `dev` commands are correct for each app
- Verify ports are not already in use

### Hotkeys not working
- Ensure your terminal supports TTY raw mode
- Try running without tmux/screen
- Check if stdin is properly configured

### Build failures
- Verify build commands in `config.ts`
- Check that dependencies are installed
- Look at the error output for specific issues

## Contributing

To add new features:

1. Edit `src/index.ts` for CLI logic
2. Update `src/config.ts` for configuration options
3. Rebuild with `bun run build`
4. Test with `bun run dev`

## License

Part of the Skriuw monorepo project.

