# @skriuw/db

Database package for Skriuw with support for multiple PostgreSQL providers.

## Features

- ✅ **Neon** (cloud PostgreSQL) - serverless, edge-ready
- ✅ **Local PostgreSQL** (Docker/local instance) - for development
- ✅ **Auto-detection** - automatically chooses provider based on DATABASE_URL
- ✅ **Zero-config** - works out of the box

## Quick Start

### Option 1: Local PostgreSQL (Docker) - Recommended for Development

1. Start local PostgreSQL:
```bash
docker-compose up -d
```

2. Set environment variable:
```bash
# .env file
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/skriuw
```

3. Run migrations:
```bash
cd packages/db
pnpm db:push
```

That's it! The database will automatically use the PostgreSQL driver.

### Option 2: Neon (Cloud PostgreSQL)

1. Get your Neon connection string from [neon.tech](https://neon.tech)

2. Set environment variables:
```bash
# .env file
DATABASE_URL=postgresql://user:password@ep-xxx.region.neon.tech/dbname?sslmode=require
# Optional: explicitly set provider
DATABASE_PROVIDER=neon
```

3. Run migrations:
```bash
cd packages/db
pnpm db:push
```

The database will automatically detect Neon from the URL and use the Neon driver.

## Configuration

### Environment Variables

- `DATABASE_URL` (required) - PostgreSQL connection string
- `DATABASE_PROVIDER` (optional) - Explicit provider: `neon` or `postgres`
  - If not set, auto-detects based on DATABASE_URL
  - If URL contains "neon" → uses Neon provider
  - Otherwise → uses PostgreSQL provider

### Auto-Detection Logic

The provider is automatically detected from the DATABASE_URL:

- URLs containing `neon.tech` or `neon` → **Neon provider**
- All other URLs → **PostgreSQL provider**

You can override with `DATABASE_PROVIDER=neon` or `DATABASE_PROVIDER=postgres`.

## Usage

```typescript
import { getDatabase, notes } from '@skriuw/db'

const db = await getDatabase()

// Query data
const allNotes = await db.select().from(notes)

// Insert data
await db.insert(notes).values({
  id: 'note-1',
  name: 'My Note',
  content: '{}',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  type: 'note'
})
```

## Database Commands

```bash
# Push schema to database (creates tables)
pnpm db:push

# Generate migration files
pnpm db:generate

# Open Drizzle Studio (database GUI)
pnpm db:studio
```

## Development

### Start Local Database

```bash
# Start PostgreSQL container
docker-compose up -d

# Check if running
docker ps | grep postgres

# View logs
docker-compose logs -f postgres

# Stop database
docker-compose down

# Stop and remove all data
docker-compose down -v
```

### Migration Workflow

1. Edit schema in `src/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Review migration files in `migrations/`
4. Apply migration: `pnpm db:push`

## Provider Comparison

| Feature | Neon | PostgreSQL |
|---------|------|------------|
| Setup | Cloud signup | Docker/install |
| Cost | Free tier available | Free (self-hosted) |
| Latency | Edge locations | Local/self-hosted |
| Use Case | Production, edge apps | Development, self-hosted |

## Troubleshooting

### Connection refused
- Check if Docker container is running: `docker ps`
- Verify DATABASE_URL port matches container port (5432)
- Check firewall settings

### Module not found
- Install dependencies: `pnpm install`
- For Neon: `pnpm add @neondatabase/serverless`
- For PostgreSQL: `pnpm add postgres`

### Migration errors
- Make sure database is running
- Check DATABASE_URL is correct
- Try resetting: `docker-compose down -v && docker-compose up -d`

