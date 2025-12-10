# @skriuw/env

Type-safe environment variable validation for the Skriuw monorepo with Zod validation at both runtime and build time.

## Features

- 🔒 **Type-safe** - Full TypeScript inference from Zod schemas
- ✅ **Runtime validation** - Throws early errors if required variables are missing
- 🔨 **Build-time validation** - Prevents builds with invalid configuration
- 📝 **Detailed error messages** - Clear feedback for debugging
- 🌳 **Tree-shakable** - Separate client/server exports
- 📦 **Comprehensive schemas** - Supports common services and providers

## Installation

```bash
# In workspace packages
bun add @skriuw/env

# External packages
bun add @skriuw/env --config-workspace
```

## Usage

### Server-side (API routes, server components)

```typescript
import { env, database, auth, ai } from '@skriuw/env/server'

// Direct access - fully typed!
const dbUrl = env.DATABASE_URL
const v0Key = env.V0_API_KEY
const provider = env.DATABASE_PROVIDER

// Convenience getters
const isNeon = database.isNeon
const hasGithubAuth = auth.github.isConfigured
const geminiKey = ai.geminiKey
```

### Client-side (React components)

```typescript
import { env, getAppUrl } from '@skriuw/env/client'

// Only includes NEXT_PUBLIC_* variables
const appUrl = env.NEXT_PUBLIC_APP_URL
const currentUrl = getAppUrl()
```

### Build-time Validation

```json
{
  "scripts": {
    "build": "tsx /path/to/skriuw/packages/env/src/validate-build.ts && next build",
    "check-env": "tsx /path/to/skriuw/packages/env/src/validate-build.ts"
  }
}
```

## Environment Variables

### Required Variables

- `V0_API_KEY` - v0.dev API key
- `DATABASE_URL` or `POSTGRES_URL` - PostgreSQL connection string

### Optional Variables

#### Authentication
- `AUTH_SECRET` / `BETTER_AUTH_SECRET` - Auth secret (min 32 chars)
- `AUTH_URL` / `BETTER_AUTH_URL` - Auth callback URL
- `AUTH_TRUST_HOST` - Trust host in production

#### Database
- `POSTGRES_PRISMA_URL` - Non-pooling database URL
- `DATABASE_PROVIDER` - Provider type (neon, postgres, turso, sqlite)

#### OAuth Providers
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

#### AI/LLM Services
- `GEMINI_API_KEY` / `GEMINI_BACKUP_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

#### Other Services
- `RESEND_API_KEY` - Email service
- `STRIPE_*` - Payment processing
- `AWS_*` - AWS services
- `CLOUDINARY_*` - Image CDN

## Validation Errors

### Missing Required Variable
```
❌ Invalid environment variables:

V0_API_KEY: V0_API_KEY is required
DATABASE_URL: ❌ DATABASE_URL is required

💡 Check your .env.local file or environment configuration.
```

### Invalid Value
```
❌ Invalid environment variables:

AUTH_SECRET: AUTH_SECRET must be at least 32 characters long

💡 Check your .env.local file or environment configuration.
```

## Advanced Usage

### Custom Validation

```typescript
import { validateEnv, serverSchema } from '@skriuw/env'

// Validate custom env object
const customEnv = validateEnv(serverSchema, myCustomEnv)
```

### Environment Helpers

```typescript
import { isProduction, isDevelopment, isVercel } from '@skriuw/env/server'

if (isProduction()) {
  // Production-specific logic
}

if (isVercel()) {
  // Vercel-specific logic
}
```

## Package Structure

```
packages/env/
├── src/
│   ├── index.ts         # Main exports
│   ├── schema.ts        # Zod schema definitions
│   ├── server.ts        # Server-side environment
│   ├── client.ts        # Client-side environment
│   ├── validate.ts      # Validation utilities
│   └── validate-build.ts # Build-time validation script
└── dist/                # Built outputs
```

## Contributing

To add new environment variables:

1. Update the appropriate schema in `src/schema.ts`
2. Add type exports
3. Update the .env.example files
4. Test validation with `bun run validate`

## License

Private package for Skriuw monorepo.
