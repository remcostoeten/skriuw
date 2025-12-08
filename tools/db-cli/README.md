# Skriuw Database CLI

A beautiful, keyboard-driven terminal UI for managing your Skriuw database.

Built with [Bubble Tea](https://github.com/charmbracelet/bubbletea) for a smooth, aesthetic experience.

## Features

- 📊 **Status Check** - View database connection status and Docker container state
- 🔄 **Provider Switching** - Toggle between Local Docker and Neon Cloud with one keystroke
- 🐳 **Docker Management** - Start, stop, restart, view logs, remove, and recreate containers
- 📋 **Schema Management** - Generate migrations, push schema, check sync status
- 📋 **Copy DB URL** - Copy your DATABASE_URL to clipboard

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` or `j` / `k` | Navigate menu |
| `Enter` or `Space` | Select item |
| `Esc` or `Backspace` | Go back |
| `q` or `Ctrl+C` | Quit |

## Building

### Prerequisites

- Go 1.22+ installed

### Build

```bash
# From the tools/db-cli directory
./build.sh

# Or using Make
make build

# Build for all platforms
make build-all
```

### Install Globally

```bash
make install
# or
sudo cp ../../bin/db-cli /usr/local/bin/
```

## Usage

```bash
# Run from project root
./bin/db-cli

# Or if installed globally
db-cli
```

## Screenshots

```
  🐳 LOCAL DOCKER

  🗄️  Skriuw Database Manager

  📊 Status          Check database connection and Docker status
  🔄 Switch Provider Toggle between Local Docker and Neon Cloud
  🐳 Docker          Manage Docker PostgreSQL container
  📋 Schema          Generate/push database schema
  📋 Copy DB URL     Copy DATABASE_URL to clipboard

  esc: back • q: quit • enter/space: select
```
