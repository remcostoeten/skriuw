import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load .env file (runs in Node.js context, so process.env is correct)
config();

export default {
  schema: './packages/db/db/schema.ts',
  out: './packages/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://skriuw:skriuw_dev@localhost:5432/skriuw',
  },
} satisfies Config;

