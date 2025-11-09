#!/bin/bash

# tools/servo/build-all.sh
# Cross-compile Servo for multiple platforms

set -e

echo "🔨 Building Servo for all platforms..."

cd "$(dirname "$0")"

# Ensure go.mod exists
go mod init servo 2>/dev/null || true
go mod tidy

# Detect current platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Create bin directory
mkdir -p bin

# Build for current platform
echo "📦 Building for ${OS}/${ARCH}..."
GOOS=${OS} GOARCH=${ARCH} go build -ldflags="-s -w" -o bin/servo-${OS}-${ARCH} ./cmd/servo
if [ "$OS" = "linux" ]; then
    cp bin/servo-${OS}-${ARCH} servo  # Keep local copy for Linux
fi

# Cross-compile for other platforms
echo "📦 Cross-compiling for other platforms..."

# Linux (amd64)
if [ "$OS" != "linux" ] || [ "$ARCH" != "x86_64" ]; then
    echo "  → Linux (amd64)..."
    GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/servo-linux-amd64 ./cmd/servo
fi

# Linux (arm64)
if [ "$OS" != "linux" ] || [ "$ARCH" != "aarch64" ]; then
    echo "  → Linux (arm64)..."
    GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o bin/servo-linux-arm64 ./cmd/servo
fi

# macOS (amd64)
if [ "$OS" != "darwin" ] || [ "$ARCH" != "x86_64" ]; then
    echo "  → macOS (amd64)..."
    GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o bin/servo-darwin-amd64 ./cmd/servo
fi

# macOS (arm64)
if [ "$OS" != "darwin" ] || [ "$ARCH" != "arm64" ]; then
    echo "  → macOS (arm64)..."
    GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o bin/servo-darwin-arm64 ./cmd/servo
fi

# Windows (amd64)
echo "  → Windows (amd64)..."
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o bin/servo-windows-amd64.exe ./cmd/servo

# Windows (arm64)
echo "  → Windows (arm64)..."
GOOS=windows GOARCH=arm64 go build -ldflags="-s -w" -o bin/servo-windows-arm64.exe ./cmd/servo

echo ""
echo "✅ Build complete! Binaries in bin/:"
ls -lh bin/

