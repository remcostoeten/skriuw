#!/bin/bash
# Setup script for Postgres development environment

set -e

echo "🚀 Setting up Postgres for Quantum Work..."

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install Docker Compose."
    exit 1
fi

# Start Postgres
echo "📦 Starting Postgres container..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for Postgres to be ready
echo "⏳ Waiting for Postgres to be ready..."
sleep 5

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Created .env file. Please review and update if needed."
    else
        echo "⚠️  .env.example not found. Creating basic .env..."
        cat > .env << EOF
DATABASE_URL=postgresql://quantum:quantum123@localhost:5432/quantum_work
VITE_DATABASE_URL=postgresql://quantum:quantum123@localhost:5432/quantum_work
NODE_ENV=development
EOF
        echo "✅ Created .env file with default values."
    fi
else
    echo "✅ .env file already exists."
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    if command -v pnpm &> /dev/null; then
        pnpm install
    elif command -v npm &> /dev/null; then
        npm install
    else
        echo "⚠️  No package manager found. Please install dependencies manually."
    fi
fi

# Generate migrations
echo "🗄️  Generating database migrations..."
if command -v pnpm &> /dev/null; then
    pnpm drizzle:generate
elif command -v npm &> /dev/null; then
    npm run drizzle:generate
fi

# Push schema
echo "📤 Pushing database schema..."
if command -v pnpm &> /dev/null; then
    pnpm drizzle:push
elif command -v npm &> /dev/null; then
    npm run drizzle:push
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Postgres is running at: postgresql://quantum:quantum123@localhost:5432/quantum_work"
echo ""
echo "To start the dev server:"
echo "  pnpm dev"
echo ""
echo "To stop Postgres:"
echo "  docker-compose -f docker-compose.dev.yml down"
echo ""

