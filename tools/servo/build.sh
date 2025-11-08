#!/bin/bash

echo "\033[0;32m🔨 Building Servo...\033[0m"

cd "$(dirname "$0")"

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "\033[0;31m❌ Error: Go is not installed.\033[0m"
    echo "Install Go from: https://go.dev/dl/"
    exit 1
fi

go mod init servo 2>/dev/null || true

go mod tidy

# Build with optimizations (smaller binary)
go build -ldflags="-s -w" -o servo

echo "\033[0;32m✅ Build complete! Run with: ./servo\033[0m"
