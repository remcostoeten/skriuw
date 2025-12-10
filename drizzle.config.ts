// Use dotenv with quiet mode to suppress verbose logs
import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load .env file silently (Drizzle CLI requires dotenv, not @skriuw/env)
config({ debug: false });

export default {
  schema: './packages/db/db/schema.ts',
  out: './packages/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: 'postgresql://neondb_owner:npg_J7pQT1ObNtKY@ep-wild-bonus-adliw3et-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
  },
} satisfies Config;



