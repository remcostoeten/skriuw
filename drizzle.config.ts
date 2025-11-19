import type { Config } from 'drizzle-kit';
import { DATABASE_CONFIG } from './server/config/database';

export default {
  schema: './client/shared/storage/drizzle/schema.ts',
  out: './client/shared/storage/drizzle/migrations',
  dialect: 'turso',
  dbCredentials: {
    url: DATABASE_CONFIG.url,
    authToken: DATABASE_CONFIG.authToken,
  },
} satisfies Config;
