#!/bin/bash

echo "\033[0;32m🔨 Building Servo...\033[0m"

cd "$(dirname "$0")"

go mod init servo 2>/dev/null || true

go mod tidy

go build -o servo

echo "\033[0;32m✅ Build complete! Run with: ./servo\033[0m"
