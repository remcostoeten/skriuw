import type { Config } from 'drizzle-kit'
import { env } from '@skriuw/env/server'

export default {
  schema: './packages/db/db/schema.ts',
  out: './packages/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL
  },
} satisfies Config
