# Vercel Deployment Guide

This app is designed to work on Vercel with LibSQL (Turso) as the database backend.

## Prerequisites

1. **LibSQL/Turso Database**: You need a LibSQL database URL and auth token
   - Sign up at [Turso](https://turso.tech) or use your own LibSQL instance
   - Get your database URL and auth token

2. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)

## Deployment Steps

### 1. Configure Environment Variables

In your Vercel project settings, add these environment variables:

```
VITE_LIBSQL_URL=https://your-database.turso.io
VITE_LIBSQL_AUTH_TOKEN=your-auth-token-here
VITE_STORAGE_ADAPTER=drizzleLibsqlHttp
```

### 2. Run Database Migrations

Before deploying, ensure your LibSQL database schema is up to date:

```bash
# Generate migrations (if schema changed)
pnpm drizzle:generate:libsql

# Apply migrations to your LibSQL database
# You'll need to run this manually or via a migration script
# The migrations are in drizzle/libsql/
```

### 3. Deploy to Vercel

#### Option A: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# For production
vercel --prod
```

#### Option B: Via GitHub Integration

1. Push your code to GitHub
2. Import your repository in Vercel
3. Vercel will automatically detect the Vite configuration
4. Add environment variables in project settings
5. Deploy

## Architecture Notes

### What Works on Vercel

✅ **LibSQL HTTP Adapter**: Uses `@libsql/client/web` which works perfectly in browser/serverless environments
✅ **SPA Build**: Vite builds a static SPA that Vercel serves efficiently
✅ **Environment Variables**: All config via `VITE_*` env vars

### What Doesn't Work on Vercel

❌ **File-based SQLite**: The `file:local.db` fallback won't work (throws error in production)
❌ **Tauri SQLite Adapter**: Desktop-only, dynamically loaded to avoid bundling issues
❌ **Local File System**: No persistent file system in serverless functions

### Fallback Strategy

The app uses this adapter priority:
1. **drizzleLibsqlHttp** (default for web) - Works on Vercel ✅
2. **localStorage** - Works as fallback ✅
3. **drizzleTauriSqlite** - Desktop only, not loaded in web builds ✅

## Troubleshooting

### Build Fails with Tauri Import Error

If you see errors about `@tauri-apps/plugin-sql`, the dynamic import should prevent this. If it still happens:

1. Ensure `VITE_STORAGE_ADAPTER=drizzleLibsqlHttp` is set
2. Check that the Tauri adapter isn't being statically imported anywhere

### Database Connection Errors

- Verify `VITE_LIBSQL_URL` and `VITE_LIBSQL_AUTH_TOKEN` are set correctly
- Check that your Turso database is accessible
- Ensure migrations have been run

### 404 Errors on Routes

The `vercel.json` includes a rewrite rule to serve `index.html` for all routes (SPA routing). If you see 404s:

1. Verify `vercel.json` is in the repo root
2. Check that the rewrite rule is correct

## Local Development vs Production

- **Local**: Can use `file:local.db` fallback (development only)
- **Vercel**: Must use LibSQL HTTP adapter with explicit URL
- **Desktop**: Uses Tauri SQLite adapter (not relevant for Vercel)

## Next Steps

After deployment:
1. Test database connectivity
2. Verify all routes work (SPA routing)
3. Check that environment variables are set correctly
4. Monitor Vercel function logs for any errors

