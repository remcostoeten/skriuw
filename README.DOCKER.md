# Docker Setup for Quantum Work

This project uses Postgres as the database backend. Use Docker Compose to run Postgres locally for development.

## Quick Start

### Development (Postgres only)

1. Start Postgres:
```bash
docker-compose -f docker-compose.dev.yml up -d
```

2. Set environment variables:
```bash
cp .env.example .env
# Edit .env and set DATABASE_URL
```

3. Generate and apply migrations:
```bash
pnpm drizzle:generate
pnpm drizzle:push
```

4. Start the dev server:
```bash
pnpm dev
```

### Full Stack (App + Postgres)

1. Build and start everything:
```bash
docker-compose up -d
```

2. Check logs:
```bash
docker-compose logs -f app
```

3. Stop everything:
```bash
docker-compose down
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
DATABASE_URL=postgresql://quantum:quantum123@localhost:5432/quantum_work
VITE_DATABASE_URL=postgresql://quantum:quantum123@localhost:5432/quantum_work
```

## Database Management

### Connect to Postgres
```bash
docker-compose exec postgres psql -U quantum -d quantum_work
```

### Reset Database
```bash
docker-compose down -v  # Removes volumes
docker-compose up -d    # Recreates fresh database
```

### View Database Logs
```bash
docker-compose logs postgres
```

## Troubleshooting

### Port 5432 already in use
Change the port mapping in `docker-compose.yml`:
```yaml
ports:
  - "5433:5432"  # Use 5433 instead
```

### Connection refused
1. Check if Postgres is running: `docker-compose ps`
2. Check health status: `docker-compose ps postgres`
3. View logs: `docker-compose logs postgres`

### Migration issues
1. Make sure DATABASE_URL is set correctly
2. Run `pnpm drizzle:generate` to create migrations
3. Run `pnpm drizzle:push` to apply schema

