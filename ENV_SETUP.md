# Environment Setup

## Quick Start

1. **Clean up old dependencies:**
```bash
pnpm cleanup:deps
```

2. **Set up Postgres:**
```bash
pnpm setup:postgres
```

Or manually:
```bash
# Start Postgres
pnpm docker:postgres

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://quantum:quantum123@localhost:5432/quantum_work
VITE_DATABASE_URL=postgresql://quantum:quantum123@localhost:5432/quantum_work
NODE_ENV=development
EOF

# Generate and apply migrations
pnpm drizzle:generate
pnpm drizzle:push
```

3. **Start dev server:**
```bash
pnpm dev
```

## Environment Variables

Create a `.env` file in the root directory:

```env
# Postgres Database Connection
# Format: postgresql://user:password@host:port/database
DATABASE_URL=postgresql://quantum:quantum123@localhost:5432/quantum_work

# For client-side (Vite) - use VITE_ prefix
VITE_DATABASE_URL=postgresql://quantum:quantum123@localhost:5432/quantum_work

# Node Environment
NODE_ENV=development
```

## Database Connection

The default Postgres setup uses:
- **Host:** localhost
- **Port:** 5432
- **User:** quantum
- **Password:** quantum123
- **Database:** quantum_work

To change these, update `docker-compose.dev.yml` and your `.env` file.

## Troubleshooting

### Lockfile issues
If you see errors about old dependencies, run:
```bash
pnpm cleanup:deps
```

### Port conflicts
If port 5432 is already in use, change it in `docker-compose.dev.yml`:
```yaml
ports:
  - "5433:5432"  # Use 5433 instead
```

Then update your `.env`:
```env
DATABASE_URL=postgresql://quantum:quantum123@localhost:5433/quantum_work
```

### Connection errors
1. Make sure Postgres is running: `docker ps`
2. Check logs: `docker-compose -f docker-compose.dev.yml logs postgres`
3. Verify DATABASE_URL in `.env` matches docker-compose settings

