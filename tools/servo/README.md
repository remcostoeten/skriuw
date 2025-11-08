# Servo - Development Launcher

Terminal-based dev launcher with intelligent project detection. Built with Go and Bubble Tea.

## Quick Start

**No Go Required!** Servo is distributed as a pre-compiled binary.

```bash
# Install (uses pre-built binary if available)
./install.sh

# Or install globally
./install.sh --global

# Run
./servo
```

## Distribution Strategy

### For Users (No Go Required)

1. **Pre-built binaries** are provided in `bin/` directory
2. **Install script** automatically detects and uses the correct binary
3. **Fallback** to building from source if Go is installed
4. **Error** if neither binary nor Go is available

### For Developers (Go Required)

If you want to modify Servo or build binaries:

```bash
# Build for current platform
./build.sh

# Build for all platforms
./build-all.sh
```

## Binary Distribution

Binaries are named: `servo-{OS}-{ARCH}`

- **Linux**: `servo-linux-amd64`, `servo-linux-arm64`
- **macOS**: `servo-darwin-amd64`, `servo-darwin-arm64`
- **Windows**: `servo-windows-amd64.exe`, `servo-windows-arm64.exe`

For Linux, a simple `servo` binary is also provided in the root.

## Building Binaries

### Single Platform

```bash
./build.sh
# Creates: ./servo
```

### All Platforms

```bash
./build-all.sh
# Creates binaries in bin/ directory
```

### Manual Build

```bash
# Current platform
go build -ldflags="-s -w" -o servo .

# Cross-compile
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/servo-linux-amd64 .
GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o bin/servo-darwin-arm64 .
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o bin/servo-windows-amd64.exe .
```

## Installation Script Behavior

The `install.sh` script:

1. Detects your platform (OS + architecture)
2. Looks for pre-built binary in `bin/` directory
3. Uses binary if found (no Go needed!)
4. Falls back to building if Go is installed
5. Shows helpful error if neither available

## Adding Binaries to Repository

When building binaries for distribution:

1. Run `./build-all.sh` to create all platform binaries
2. Commit binaries to `bin/` directory (or use GitHub Releases)
3. Users can then use `./install.sh` without Go

**Note:** Binaries are large (~4-5MB each). Consider:
- Using GitHub Releases for binaries
- Or committing only the most common platforms (Linux amd64)

## Development

### Requirements

- Go 1.21+
- Terminal with true color support

### Running from Source

```bash
go run .
```

### Testing

```bash
# Test build
./build.sh
./servo

# Test cross-compilation
./build-all.sh
```

## Documentation

Full documentation available at: `/docs/servo`

