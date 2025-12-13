import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';
import { env } from './apps/web/env';

config({ quiet: true });

export default {
  schema: './packages/db/src/schema.ts',
  out: './packages/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
} satisfies Config;

