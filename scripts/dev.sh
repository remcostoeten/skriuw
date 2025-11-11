#!/bin/bash

# dev.sh - Cross-platform wrapper that uses Servo on Linux/macOS, falls back to direct dev on Windows

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
esac

# Check if running in interactive terminal
is_interactive() {
    [ -t 0 ] && [ -t 1 ]
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to find Servo binary
find_servo() {
    # Check if servo is in PATH
    if command_exists servo; then
        echo "servo"
        return 0
    fi
    
    # Linux: check for local binary first
    if [ "$OS" = "linux" ] && [ -f "tools/servo/servo" ]; then
        echo "tools/servo/servo"
        return 0
    fi
    
    # Check for platform-specific binary in bin/ directory
    if [ "$OS" = "linux" ]; then
        BINARY_NAME="servo-linux-${ARCH}"
    elif [ "$OS" = "darwin" ]; then
        BINARY_NAME="servo-darwin-${ARCH}"
    else
        # Windows or other - not supported
        return 1
    fi
    
    if [ -f "tools/servo/bin/${BINARY_NAME}" ]; then
        echo "tools/servo/bin/${BINARY_NAME}"
        return 0
    fi
    
    return 1
}

# Windows: fall back to direct dev immediately
if [ "$OS" = "windows" ] || [ "$OS" = "msys" ] || [ "$OS" = "cygwin" ]; then
    echo -e "${GREEN}Starting development server...${NC}"
    echo ""
    exec bun run dev:direct "$@"
fi

# Try to find Servo
SERVO_PATH=$(find_servo 2>/dev/null || echo "")

if [ -n "$SERVO_PATH" ] && is_interactive; then
    # Servo found and we're in an interactive terminal - use it
    echo -e "${GREEN}Using Servo development launcher${NC}"
    echo ""
    exec "$SERVO_PATH" "$@"
else
    # Servo not found or non-interactive - fall back to regular dev
    if [ -n "$SERVO_PATH" ] && ! is_interactive; then
        echo -e "${YELLOW}Servo requires an interactive terminal - falling back to regular dev${NC}"
    else
        echo -e "${YELLOW}Servo not found - falling back to regular dev commands${NC}"
        echo ""
        echo -e "${BLUE}Tip: Install Servo for a better dev experience:${NC}"
        echo "   cd tools/servo && ./install.sh"
        echo ""
    fi
    echo ""
    echo -e "${GREEN}Starting development server...${NC}"
    echo ""
    
    # Fall back to regular bun dev command (use dev:direct to avoid recursion)
    exec bun run dev:direct "$@"
fi

