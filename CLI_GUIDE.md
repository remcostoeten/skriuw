# 🎮 Interactive CLI Guide

Beautiful terminal interface for managing your Tauri apps with ease!

## Quick Start

```bash
./start
```

That's it! The interactive menu will guide you through everything.

## Navigation

### Arrow Keys
Use ↑ and ↓ to navigate through options, then press Enter to select.

### Number Shortcuts
Type the number shown next to any option:
- `1` - Turso App
- `2` - InstantDB App
- `3` - Start all apps
- `4` - Build all apps

### Fuzzy Search
Just start typing to filter options! No need to use arrow keys if you know what you want.

## Main Menu

```
╔════════════════════════════════════════════╗
║  🚀 Tauri Local-First Monorepo Manager  ║
╚════════════════════════════════════════════╝

  Navigate with arrow keys, type numbers, or search

? What would you like to do?
❯ 1️⃣  Turso App (Updated: Jan 29, 2025)
  2️⃣  InstantDB App (Updated: Jan 29, 2025)
  ─────────────
  🚀 Start all apps
  📦 Build all apps
  ─────────────
  📚 Help
  👋 Exit
```

## App Submenu

After selecting an app (Turso or InstantDB):

```
? What would you like to do?
❯ ▶️  Start web dev server
  🖥️  Start Tauri desktop app
  ─────────────
  📦 Build web app
  📦 Build Tauri app
  ─────────────
  ← Back to main menu
```

## Running App Controls

When an app is running, you get these options:

```
? Turso Web is running. What would you like to do?
❯ 🌐 Open in browser
  📊 View live logs (streaming above)
  🔄 Restart
  ⏹️  Stop
  ─────────────
  ← Back to main menu
```

### Live Logs
Logs stream automatically above the menu. You can:
- Watch them in real-time
- Select "View live logs" to pause and read
- Continue with other operations while logs stream

### Quick Actions
- **Open in browser** - Automatically opens http://localhost:5173 or :3000
- **Restart** - Stops and restarts the process
- **Stop** - Gracefully stops the process

## Features

### ✨ Smart Process Management
- Tracks all running processes
- Prevents duplicate starts
- Graceful shutdown on Ctrl+C
- Automatic cleanup on exit

### 🎨 Beautiful Output
- Color-coded status messages
- Spinners for loading states
- Clean, organized logs
- Visual separators

### ⚡ Quick Operations
- Start all apps at once
- Build all apps sequentially
- Individual app control
- Process isolation (web vs desktop)

## Tips

### Starting Multiple Apps
1. Use "🚀 Start all apps" to launch both web servers
2. They'll run on different ports:
   - Turso: http://localhost:5173
   - InstantDB: http://localhost:3000

### Building for Production
1. Select "📦 Build all apps" for complete build
2. Or build individually through app submenus
3. Watch build progress in real-time

### Managing Running Apps
- Apps run in the background
- You can navigate menus while apps run
- Logs stream continuously
- Safe to stop/restart anytime

### Keyboard Shortcuts
- `Ctrl+C` - Stop all processes and exit
- `Enter` - Confirm selection
- `↑/↓` - Navigate options
- Type to search/filter

## Troubleshooting

### Port Already in Use
If you see "address already in use":
1. Use the CLI to stop all processes
2. Or manually kill: `lsof -ti:5173 | xargs kill -9`

### Process Won't Stop
The CLI uses process groups for clean termination. If a process hangs:
1. Try restart option first
2. Use Ctrl+C to force quit all
3. Manually check: `ps aux | grep node`

### Can't Find Node
Ensure Node.js 18+ is installed:
```bash
node --version
```

## Examples

### Daily Workflow
```bash
# Morning: Start everything
./start
→ Select "🚀 Start all apps"
→ Both servers start

# Work on Turso app
./start
→ Select "1️⃣  Turso App"
→ Select "🖥️  Start Tauri desktop app"
→ Watch logs, make changes
→ Select "🔄 Restart" when needed

# End of day: Stop all
→ Press Ctrl+C
```

### Testing Builds
```bash
./start
→ Select "📦 Build all apps"
→ Watch both apps build
→ Done!
```

### Quick Launch
```bash
./start
# Type "1" quickly → type "1" → starts Turso web
# Or type "2" → type "2" → starts InstantDB web
```

## Advanced

### Running Without CLI
If you prefer manual control:
```bash
# Turso
pnpm dev:turso
pnpm tauri:turso

# InstantDB
pnpm dev:instantdb
pnpm tauri:instantdb
```

### Debugging
The CLI shows all output from child processes. If something breaks:
1. Check the logs streaming above menu
2. Use "📊 View live logs" to see full history
3. Restart the specific process

### Process IDs
The CLI tracks process IDs internally. If you need to inspect:
```bash
ps aux | grep "vite\|next\|tauri"
```

## Getting Help

In the CLI:
- Select "📚 Help" from main menu
- View ports, commands, and app structure

Need more help?
- Check app-specific READMEs in `apps/turso/` and `apps/instantdb/`
- Read `COMPARISON.md` for architecture details

---

**Enjoy your productive coding! 🚀**

