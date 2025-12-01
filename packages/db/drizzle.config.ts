import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load .env file (runs in Node.js context, so process.env is correct)
config();

export default {
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
  },
  // Use migrations instead of push for better control
  // push: {
  //   // Auto-resolve conflicts by creating new columns
  //   autoCreate: true,
  // },
} satisfies Config;

