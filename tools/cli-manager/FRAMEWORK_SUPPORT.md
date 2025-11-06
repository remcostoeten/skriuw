# CLI Manager - Framework Support

## Multi-Framework Support

The CLI Manager now supports **Vite**, **Vinxi**, and **Next.js** with automatic framework detection, making it a viable replacement for `bun run dev`.

## Features

### ✅ Automatic Framework Detection

The CLI automatically detects:
- **Next.js** - Detects `next` dependency, `next.config.*`, or `app/`/`pages/` directories
- **Vinxi** - Detects `vinxi` dependency or `vinxi.config.ts`
- **Vite** - Detects `vite` dependency or `vite.config.*` files

### ✅ Port Auto-Detection

- Extracts ports from dev server output
- Updates port information dynamically
- Works with framework-specific port patterns

### ✅ Framework-Specific Ready Detection

Each framework has optimized ready patterns:
- **Next.js**: `ready`, `started server`, `Local: http`, `compiled successfully`
- **Vinxi**: `ready`, `VITE ready`, `Local: http`, `compiled`
- **Vite**: `VITE ready`, `Local: http`, `ready in`

### ✅ Single-App & Monorepo Support

**Monorepo Mode:**
- Auto-detects apps in `apps/` directory
- Detects framework for each app independently
- Manages multiple apps simultaneously

**Single-App Mode:**
- Works in any project directory
- Auto-detects framework from `package.json` and config files
- No configuration needed

## Usage as `bun run dev` Replacement

### Option 1: Direct Replacement

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
# or
npm run dev
```

**Behavior:**
- Single app: Starts dev server directly (like `bun run dev`)
- Multiple apps: Shows interactive menu

### Option 2: Interactive Mode

Run without arguments for full menu:
```bash
sk
# or
bun run cli
```

### Option 3: Command-Line Arguments

```bash
sk dev          # Direct dev mode (replaces bun run dev)
sk start        # Same as dev
sk              # Interactive menu
```

## Framework Detection Priority

1. **Next.js** (highest priority)
   - Checks for `next` in dependencies
   - Looks for `next.config.ts/js/mjs`
   - Checks for `app/` or `pages/` directories

2. **Vinxi**
   - Checks for `vinxi` in dependencies
   - Looks for `vinxi.config.ts`

3. **Vite**
   - Checks for `vite` in dependencies
   - Looks for `vite.config.ts/js`

4. **Fallback**
   - Uses `package.json` scripts
   - Extracts port from dev script if available
   - Uses generic ready patterns

## Port Detection

Ports are detected from:
1. Framework defaults:
   - Next.js: `3000`
   - Vite: `5173`
   - Vinxi: `3000`

2. Dev server output:
   - Parses `Local: http://localhost:XXXX`
   - Extracts from framework-specific patterns
   - Updates dynamically when detected

3. Config file:
   - Uses port from `config.ts` if specified
   - Can override auto-detection

## Example Workflows

### Vite Project

```bash
cd my-vite-app
sk dev
# Detects Vite, runs "vite" command
# Auto-detects port 5173
# Shows ready status
```

### Next.js Project

```bash
cd my-nextjs-app
sk dev
# Detects Next.js, runs "next dev"
# Auto-detects port 3000
# Shows ready status
```

### Vinxi Project

```bash
cd my-vinxi-app
sk dev
# Detects Vinxi, runs "vinxi dev"
# Auto-detects port 3000
# Shows ready status
```

### Monorepo

```bash
cd my-monorepo
sk
# Shows menu with all detected apps
# Each app has its framework auto-detected
# Can run individually or all at once
```

## Configuration Override

You can still use `config.ts` to override auto-detection:

```typescript
apps: [
  {
    name: 'my-app',
    displayName: 'My App',
    path: './apps/my-app',
    dev: 'bun run dev',      // Override detected command
    build: 'bun run build',  // Override detected command
    port: 4000,              // Override detected port
    color: '#3b82f6'
  }
]
```

## Benefits Over `bun run dev`

1. **Multi-Framework** - Works with Vite, Vinxi, Next.js
2. **Port Detection** - Auto-detects and displays ports
3. **Process Management** - Better control and monitoring
4. **Multi-App** - Run multiple apps simultaneously
5. **Logging** - Built-in logging system
6. **Health Checks** - Monitor app status
7. **Hotkeys** - Quick actions (open, restart, etc.)

## Migration Guide

### From `bun run dev` to CLI Manager

1. **Install CLI Manager** (if not already installed)
2. **Update package.json**:
   ```json
   {
     "scripts": {
       "dev": "sk dev"
     }
   }
   ```
3. **Run as usual**:
   ```bash
   bun run dev
   ```

The CLI will:
- Auto-detect your framework
- Use the correct dev command
- Show the same output (with better formatting)
- Work exactly like `bun run dev` for single apps

### For Monorepos

Keep using the interactive menu:
```bash
sk
# Select apps from menu
```

Or configure in `config.ts` for custom setup.

## Technical Details

### Framework Detection Logic

```typescript
// Checks in order:
1. package.json dependencies
2. Config file existence (next.config.*, vite.config.*, etc.)
3. Directory structure (app/, pages/)
4. package.json scripts
```

### Port Extraction

```typescript
// Patterns used:
- /Local:\s+http:\/\/localhost:(\d+)/i
- /VITE.*http:\/\/localhost:(\d+)/i
- /ready on http:\/\/localhost:(\d+)/i
- Framework-specific patterns
```

### Ready Detection

```typescript
// Framework-specific patterns:
Next.js: /ready/i, /started server/i, /compiled successfully/i
Vinxi:   /ready/i, /VITE.*ready/i, /compiled/i
Vite:    /VITE.*ready/i, /ready in/i
```

## Compatibility

✅ **Vite** - Full support  
✅ **Vinxi** - Full support  
✅ **Next.js** - Full support  
✅ **Single-app projects** - Works out of the box  
✅ **Monorepos** - Auto-detects all apps  
✅ **Custom frameworks** - Falls back to package.json scripts  

## Next Steps

- Use `sk dev` as a drop-in replacement for `bun run dev`
- Enjoy framework auto-detection
- Leverage multi-app management
- Use advanced features (logs, health checks, etc.)

