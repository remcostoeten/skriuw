#!/bin/bash

# dev.sh - Wrapper script that uses Servo if available, otherwise falls back to regular dev

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
    
    # Check for local binary
    if [ -f "tools/servo/servo" ]; then
        echo "tools/servo/servo"
        return 0
    fi
    
    # Check for binary in bin/ directory
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64) ARCH="amd64" ;;
        aarch64|arm64) ARCH="arm64" ;;
    esac
    
    BINARY_NAME="servo-${OS}-${ARCH}"
    if [ "$OS" = "linux" ] && [ -f "tools/servo/bin/${BINARY_NAME}" ]; then
        echo "tools/servo/bin/${BINARY_NAME}"
        return 0
    fi
    
    if [ -f "tools/servo/bin/${BINARY_NAME}" ]; then
        echo "tools/servo/bin/${BINARY_NAME}"
        return 0
    fi
    
    return 1
}

# Try to find Servo
SERVO_PATH=$(find_servo 2>/dev/null || echo "")

if [ -n "$SERVO_PATH" ]; then
    # Servo found - use it
    echo -e "${GREEN}🎯 Using Servo development launcher${NC}"
    echo ""
    exec "$SERVO_PATH" "$@"
else
    # Servo not found - fall back to regular dev
    echo -e "${YELLOW}⚠️  Servo not found - falling back to regular dev commands${NC}"
    echo ""
    echo -e "${BLUE}💡 Tip: Install Servo for a better dev experience:${NC}"
    echo "   cd tools/servo && ./install.sh"
    echo ""
    echo -e "${BLUE}📖 Learn more: https://github.com/your-repo/docs/servo${NC}"
    echo ""
    echo -e "${GREEN}🚀 Starting development server...${NC}"
    echo ""
    
    # Fall back to regular bun dev command
    exec bun run dev "$@"
fi

