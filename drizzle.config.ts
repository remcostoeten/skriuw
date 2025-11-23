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
    authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjI5ODcyNzksImlkIjoiZTlkNmU3NzctMjQ2ZS00MGZiLWE5MzAtZjI0NTQwOWU2MDkyIiwicmlkIjoiODBiNGIxMGYtZTYyNi00NWNkLTlkYzQtMmIyYjViNzY4NWM3In0.oLtKZBNYWJ7t4qK25FroXSAZZzxrq_8HTEpoCQIdDpqvVEKWBtEkRnWHBypj3x4GQk8V-D5dQyrXbpX26krGDg',
  },
} satisfies Config;

