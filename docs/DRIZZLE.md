# Database migrations with Drizzle

The project uses [drizzle-kit](https://orm.drizzle.team/docs/kit-overview) to manage schema and migrations for both the web (libsql) and desktop (SQLite) builds.

## Configuration

`drizzle.config.ts` reads the `DRIZZLE_TARGET` environment variable to pick credentials:

- `web` (libsql/Turso): set `LIBSQL_DATABASE_URL` and `LIBSQL_AUTH_TOKEN`.
- `desktop` (SQLite): set `SQLITE_DATABASE_PATH` or use the default `./local.sqlite` file.

The shared schema lives in `src/db/schema.ts`, and migration files are written to `./drizzle`.

## Common commands

Generate and run migrations per target with the package scripts:

- **Web (libsql)**
  - `pnpm drizzle:generate:web`
  - `pnpm drizzle:migrate:web`
- **Desktop (SQLite)**
  - `pnpm drizzle:generate:desktop`
  - `pnpm drizzle:migrate:desktop`

Each script sets `DRIZZLE_TARGET` automatically; ensure the appropriate environment variables are exported before running the commands.
