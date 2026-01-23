# @skriuw/env

Unified, type-safe environment configuration for the Skriuw monorepo.

## Features

- 🔒 **Type-safe**: Full TypeScript support with Zod validation
- 🎯 **Validated**: Errors on startup if env vars are missing or invalid
- 📝 **Documented**: Helpful error messages tell you exactly what's wrong
- 🔀 **Split imports**: Server and client modules prevent secret leakage

## Usage

### Server-side (API routes, server components)

```typescript
import { env, database, auth, ai } from '@skriuw/env/server'

// Direct access - fully typed!
const dbUrl = env.DATABASE_URL // string (validated)
const provider = env.DATABASE_PROVIDER // 'neon' | 'postgres'
const nodeEnv = env.NODE_ENV // 'development' | 'test' | 'production'

// Convenience getters
if (database.isNeon) {
	console.log('Using Neon serverless')
}

if (auth.github.isConfigured) {
	// GitHub OAuth is available
}

const geminiKey = ai.geminiKey // Uses backup key if primary is missing
```

### Client-side (React components)

```typescript
import { env, getAppUrl } from '@skriuw/env/client'

// Only NEXT_PUBLIC_* variables are available
const appUrl = getAppUrl() // Auto-detects Vercel preview URLs
```

## Error Messages

If environment variables are invalid, you'll see helpful messages:

```
❌ Invalid environment variables:

  • DATABASE_URL: DATABASE_URL must be a PostgreSQL connection string
  • NODE_ENV: Expected 'development' | 'test' | 'production', received 'staging'

💡 Check your .env.local file or environment configuration.
```

## Adding New Variables

1. Add the variable to the appropriate schema in `src/schema.ts`
2. Rebuild: `bun run build`
3. Use it with full type hints!

```typescript
// In schema.ts
export const serverSchema = z.object({
	// existing...
	MY_NEW_VAR: z.string().min(1, 'MY_NEW_VAR is required')
})

// Now accessible with types
import { env } from '@skriuw/env/server'
const value = env.MY_NEW_VAR // TypeScript knows this is a string!
```
