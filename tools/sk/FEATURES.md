# SK - Complete Features List

## Installation

### Local (Monorepo)
```bash
# Already included, just run:
bun run sk
# or
bun run cli
```

### Global Installation
```bash
# Using bun
bun add -g @skriuw/sk

# Using npm
npm install -g @skriuw/sk

# Using pnpm
pnpm add -g @skriuw/sk
```

After global install, use `sk` from anywhere:
```bash
sk dev          # Run dev server
sk              # Interactive menu
```

## Usage

### Interactive Menu Mode
```bash
sk
# or
bun run sk
```

Shows interactive menu with all options.

### Direct Dev Mode (Replaces `bun run dev`)
```bash
sk dev
# or
bun run dev  # if configured in package.json
```

Starts dev server directly with interactive hotkeys.

### Package.json Integration
```json
{
  "scripts": {
    "dev": "sk dev"
  }
}
```

## Complete Features

### 🚀 Development Features

#### Run Apps
- ✅ **Run Individual Apps** - Start any configured app
- ✅ **Run All Apps** - Start all apps simultaneously
- ✅ **Framework Auto-Detection** - Vite, Vinxi, Next.js
- ✅ **Port Auto-Detection** - Extracts from dev server output
- ✅ **Ready Detection** - Framework-specific patterns
- ✅ **Process Management** - Background, non-blocking
- ✅ **Output Filtering** - Clean, minimal output
- ✅ **Status Display** - Shows port, URL, path

#### Direct Dev Mode (`sk dev`)
- ✅ **Full Dev Output** - Shows all framework output
- ✅ **Interactive Status Bar** - Displays hotkeys
- ✅ **Hotkeys Work Anytime**:
  - **O** - Open in browser
  - **C** - Open in code editor
  - **R** - Restart app
  - **S** - Stop app
  - **G** - Open Git repository
  - **M** - Switch to menu mode

### 🔨 Build Features

- ✅ **Build Individual Apps** - Build one app at a time
- ✅ **Build All Apps** - Sequential builds with summary
- ✅ **Build Summaries** - Timing, success/failure counts
- ✅ **Framework-Specific** - Uses correct build commands
- ✅ **Progress Indicators** - Spinners and status updates

### 🚀 Deployment Features

- ✅ **Deploy to Staging** - Vercel preview deployment
- ✅ **Deploy to Production** - Vercel production deployment
- ✅ **Deployment Progress** - Shows deployment status

### ⌨️ Process Management

#### Hotkeys (Menu Mode)
- ✅ **O** - Open in browser
- ✅ **C** - Open in code editor
- ✅ **R** - Restart app
- ✅ **S** - Stop app
- ✅ **I** - Install package

#### Process Features
- ✅ **Background Execution** - Terminal stays responsive
- ✅ **Port Conflict Detection** - Warns before starting
- ✅ **Health Checks** - Monitor app status
- ✅ **Process Monitoring** - Track running apps
- ✅ **Graceful Shutdown** - Clean exit handling

### 📊 Advanced Features

#### Storage Configuration
- ✅ **Set Storage Path** - Default: `~/.config/sk`
- ✅ **Set Storage Type** - SQLite or JSON
- ✅ **Enable/Disable Storage** - Toggle storage
- ✅ **Open Storage Path** - Opens in editor

#### Logs Management
- ✅ **View Logs** - Formatted display in CLI
- ✅ **Fuzzy Search** - Search logs with Fuse.js
- ✅ **Press E to Edit** - Opens logs in editor
- ✅ **Set Log Directory** - Custom log location
- ✅ **Clear Logs** - With confirmation
- ✅ **Enable/Disable Logging** - Toggle logging
- ✅ **Human-Readable Format** - `[timestamp] [LEVEL] [app] message`

#### System Features
- ✅ **Health Check** - Check all apps status
- ✅ **Port Conflict Detection** - Identify conflicts
- ✅ **Reinstall SK** - Creates and runs reinstall script

### 🎯 Framework Support

#### Auto-Detection
- ✅ **Next.js** - Detects `next`, config files, `app/`/`pages/`
- ✅ **Vinxi** - Detects `vinxi`, `vinxi.config.ts`
- ✅ **Vite** - Detects `vite`, `vite.config.*`
- ✅ **Fallback** - Uses `package.json` scripts

#### Port Detection
- ✅ **Extract from Output** - Parses dev server messages
- ✅ **Framework Patterns** - Framework-specific regex
- ✅ **Dynamic Updates** - Updates when detected

#### Ready Detection
- ✅ **Next.js Patterns** - `ready`, `started server`, `compiled`
- ✅ **Vinxi Patterns** - `ready`, `VITE ready`, `compiled`
- ✅ **Vite Patterns** - `VITE ready`, `ready in`

### 🏗️ Project Support

#### Monorepo Mode
- ✅ **Auto-Detect Apps** - Scans `apps/` directory
- ✅ **Framework Per App** - Detects individually
- ✅ **Multi-App Management** - Run simultaneously

#### Single-App Mode
- ✅ **Works Anywhere** - Any project directory
- ✅ **Auto-Detect Framework** - From `package.json`
- ✅ **Zero Configuration** - Works out of the box

### 🛠️ Utilities

- ✅ **Open Repository** - Opens GitHub/GitLab in browser
- ✅ **Package Installation** - Install without stopping
- ✅ **Git Integration** - Parse remotes automatically

### 🎨 User Interface

- ✅ **ASCII Logo** - Customizable startup logo
- ✅ **Colorized Output** - Blue, green, yellow, red
- ✅ **No Emojis** - Clean, professional
- ✅ **Structured Layout** - Box-drawing characters
- ✅ **Arrow-Key Navigation** - Intuitive menus
- ✅ **Status Bars** - Clear information display

### 📝 Configuration

- ✅ **Single Config File** - `tools/sk/src/config.ts`
- ✅ **Per-App Settings** - Name, path, commands, port, color
- ✅ **Global Settings** - Editor, deployment, logo
- ✅ **Easy Customization** - Simple TypeScript config

### 🔍 Detection & Intelligence

- ✅ **Framework Detection** - Automatic
- ✅ **Port Detection** - From output
- ✅ **Ready Detection** - Framework-specific
- ✅ **Project Type** - Monorepo vs single-app
- ✅ **App Discovery** - Auto-find apps

## Feature Count Summary

- **Development**: 8 features
- **Build**: 5 features
- **Deployment**: 2 features
- **Process Management**: 10 features
- **Advanced**: 13 features
- **Framework Support**: 9 features
- **Project Support**: 6 features
- **Utilities**: 3 features
- **UI/UX**: 6 features
- **Configuration**: 4 features
- **Detection**: 5 features

**Total: 71+ features**

## Quick Reference

### Commands
```bash
sk              # Interactive menu
sk dev          # Direct dev mode
sk start        # Same as dev
```

### Hotkeys (Dev Mode)
- **O** - Open browser
- **C** - Open editor
- **R** - Restart
- **S** - Stop
- **G** - Git repo
- **M** - Menu

### Hotkeys (Menu Mode)
- **O** - Open browser
- **C** - Open editor
- **R** - Restart
- **S** - Stop
- **I** - Install package

### Storage
- Default: `~/.config/sk`
- Config: `~/.config/sk/config.json`
- Logs: `~/.config/sk/logs/cli.log`

### Frameworks Supported
- ✅ Next.js
- ✅ Vinxi
- ✅ Vite
- ✅ Custom (via package.json)

## Use Cases

### Daily Development
```bash
sk dev          # Start with hotkeys
# Press O → Open browser
# Press C → Open editor
# Press R → Restart when needed
```

### Monorepo Management
```bash
sk              # Show menu
# Run all apps
# Build all apps
# Deploy
```

### Debugging
```bash
sk              # Advanced → View Logs
# Search logs
# Press E → Open in editor
```

### Configuration
```bash
sk              # Advanced → Storage Configuration
# Set paths
# Configure logging
```

## Next Steps

1. **Install**: `bun add -g @skriuw/sk` (or use locally)
2. **Use**: `sk dev` or `sk` for menu
3. **Customize**: Edit `tools/sk/src/config.ts`
4. **Explore**: Try all hotkeys and features

