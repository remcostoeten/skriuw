#!/usr/bin/env bash
# Build script for db-cli
# This script installs Go if needed and builds the CLI

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/bin"
BINARY_NAME="db-cli"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🗄️  Skriuw Database CLI Builder${NC}"
echo ""

# Check for Go
if ! command -v go &> /dev/null; then
    echo -e "${RED}❌ Go is not installed.${NC}"
    echo ""
    echo "Please install Go first:"
    echo "  - Visit: https://go.dev/dl/"
    echo "  - Or on Ubuntu/Debian: sudo apt install golang-go"
    echo "  - Or on macOS: brew install go"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Go found: $(go version)${NC}"

# Create build directory
mkdir -p "$BUILD_DIR"

# Build
cd "$SCRIPT_DIR"
echo -e "${BLUE}📦 Installing dependencies...${NC}"
go mod tidy

echo -e "${BLUE}📦 Building $BINARY_NAME...${NC}"
go build -o "$BUILD_DIR/$BINARY_NAME" .

echo ""
echo -e "${GREEN}✅ Build complete!${NC}"
echo ""
echo "Binary location: $BUILD_DIR/$BINARY_NAME"
echo ""
echo "To run:"
echo "  $BUILD_DIR/$BINARY_NAME"
echo ""
echo "To install globally:"
echo "  sudo cp $BUILD_DIR/$BINARY_NAME /usr/local/bin/"
