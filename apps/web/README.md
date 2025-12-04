# Skriuw

A blazingly fast, privacy-focused note-taking app.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- PostgreSQL database (local or Neon)

### Setup

1. Install dependencies:

```bash
pnpm install
```

2. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` and add your database URL:

```
DATABASE_URL=postgresql://user:password@host:port/database
```

3. Push the database schema:

```bash
pnpm db:push
```

4. (Optional) Seed the database:

```bash
pnpm db:seed
```

5. Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Database

This app uses Drizzle ORM with PostgreSQL. It supports both:

- **Neon** (serverless PostgreSQL) - auto-detected if URL contains "neon"
- **Standard PostgreSQL** - for local development with Docker

### Local Development with Docker

```bash
docker-compose up -d
```

This starts a PostgreSQL container on port 5432.

### Commands

- `pnpm db:push` - Push schema changes to database
- `pnpm db:generate` - Generate migrations
- `pnpm db:studio` - Open Drizzle Studio
- `pnpm db:seed` - Seed the database

## Deployment

This app is ready to deploy on Vercel:

1. Push to GitHub
2. Import to Vercel
3. Add `DATABASE_URL` environment variable
4. Deploy

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS v4
- **UI Components**: Radix UI
- **State Management**: Zustand
- **Deployment**: Vercel
