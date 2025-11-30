import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load .env file (runs in Node.js context, so process.env is correct)
config();

export default {
  schema: './src/shared/database/schema.ts',
  out: './src/shared/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
  },
} satisfies Config;