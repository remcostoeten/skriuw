#!/bin/bash
# Cleanup script to remove old dependencies and regenerate lockfile

set -e

echo "🧹 Cleaning up old dependencies..."

# Remove old lockfiles
echo "🗑️  Removing old lockfiles..."
rm -f bun.lock yarn.lock package-lock.json

# Remove node_modules
echo "🗑️  Removing node_modules..."
rm -rf node_modules

# Remove old drizzle configs if they exist
echo "🗑️  Cleaning up old config files..."
rm -f drizzle.config.libsql.ts drizzle.config.sqlite.ts

# Install fresh dependencies
echo "📦 Installing fresh dependencies..."
if command -v pnpm &> /dev/null; then
    pnpm install
    echo "✅ Dependencies installed with pnpm"
elif command -v npm &> /dev/null; then
    npm install
    echo "✅ Dependencies installed with npm"
else
    echo "❌ No package manager found. Please install pnpm or npm."
    exit 1
fi

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Old libraries removed:"
echo "  - @libsql/client"
echo "  - @tauri-apps/plugin-sql"
echo ""
echo "New library added:"
echo "  - postgres"
echo ""
echo "Next steps:"
echo "  1. Set DATABASE_URL in .env"
echo "  2. Run: ./scripts/setup-postgres.sh"
echo ""

