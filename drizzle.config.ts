import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load .env file (runs in Node.js context, so process.env is correct)
config();

export default {
  schema: './client/shared/storage/drizzle/schema.ts',
  out: './client/shared/storage/drizzle/migrations',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'libsql://resolved-justice-remcostoeten.aws-eu-west-1.turso.io',
    authToken: process.env.TURSO_AUTH_TOKEN || '***REMOVED***',
  },
} satisfies Config;

