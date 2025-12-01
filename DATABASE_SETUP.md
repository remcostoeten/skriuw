# Database Setup Guide

Perfect DX met simpele keuze tussen Neon (cloud) of lokale Docker PostgreSQL.

## 🚀 Quick Start (30 seconden)

### Optie 1: Lokale Docker PostgreSQL (Aanbevolen voor Development)

```bash
# 1. Start database
docker-compose up -d

# 2. Maak .env file (al gedaan als je .env.example gebruikt)
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/skriuw

# 3. Run migrations
cd packages/db && pnpm db:push

# Klaar! ✅
```

### Optie 2: Neon (Cloud PostgreSQL)

```bash
# 1. Haal connection string op van neon.tech
# 2. Zet in .env:
# DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require

# 3. Run migrations
cd packages/db && pnpm db:push

# Klaar! ✅ Auto-detecteert Neon uit de URL
```

## 📋 Hoe het werkt

### Auto-Detectie (Zero Config)

Het systeem detecteert automatisch welke provider je gebruikt:

- **Neon**: Als je DATABASE_URL `neon.tech` of `neon` bevat → gebruikt Neon driver
- **PostgreSQL**: Alle andere URLs → gebruikt standaard PostgreSQL driver

### Expliciete Keuze

Je kunt ook expliciet kiezen via environment variable:

```bash
# Forceer Neon provider
DATABASE_PROVIDER=neon
DATABASE_URL=postgresql://...

# Forceer PostgreSQL provider  
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://...
```

## 🐳 Docker Setup

De `docker-compose.yml` file zorgt voor:

- ✅ PostgreSQL 16 container
- ✅ Automatische health checks
- ✅ Data persistence (volume)
- ✅ Standaard credentials: `postgres:postgres`
- ✅ Database: `skriuw`
- ✅ Poort: `5432`

### Docker Commands

```bash
# Start database
docker-compose up -d

# Bekijk logs
docker-compose logs -f postgres

# Stop database
docker-compose down

# Stop + verwijder alle data (reset)
docker-compose down -v

# Check status
docker ps | grep postgres
```

## 🔄 Database Migraties

```bash
cd packages/db

# Schema naar database pushen (creëert tabellen)
pnpm db:push

# Migratie files genereren
pnpm db:generate

# Drizzle Studio openen (GUI)
pnpm db:studio
```

## 🔍 Troubleshooting

### "Connection refused"
```bash
# Check of Docker container draait
docker ps | grep postgres

# Start container
docker-compose up -d

# Check logs voor errors
docker-compose logs postgres
```

### "Module not found"
```bash
# Installeer dependencies
pnpm install

# Voor Neon (als je Neon gebruikt)
pnpm add @neondatabase/serverless

# Voor PostgreSQL (standaard)
pnpm add postgres
```

### Database reset
```bash
# Stop + verwijder alles
docker-compose down -v

# Start opnieuw
docker-compose up -d

# Run migrations opnieuw
cd packages/db && pnpm db:push
```

## 📊 Provider Vergelijking

| Feature | Neon (Cloud) | PostgreSQL (Docker) |
|---------|--------------|---------------------|
| Setup tijd | ~2 minuten | ~30 seconden |
| Kosten | Free tier | Gratis |
| Internet nodig | ✅ Ja | ❌ Nee (lokaal) |
| Best voor | Production, Edge | Development, Testing |
| Performance | Edge locations | Lokale latency |

## 💡 Tips

1. **Development**: Gebruik Docker (sneller, offline, gratis)
2. **Production**: Gebruik Neon (edge-ready, schaalbaar)
3. **Testing**: Gebruik Docker (isolatie, snel resetten)

## 🎯 Perfect DX Features

- ✅ **Zero config** - Auto-detectie werkt out-of-the-box
- ✅ **Simpele flag** - `DATABASE_PROVIDER` environment variable
- ✅ **Geen overhead** - Alleen de benodigde driver wordt geladen
- ✅ **Duidelijke errors** - Helpful error messages
- ✅ **One-liner setup** - `docker-compose up -d` en klaar

