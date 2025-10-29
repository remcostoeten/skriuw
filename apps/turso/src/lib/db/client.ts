import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const tursoClient = createClient({
  url: import.meta.env.VITE_TURSO_DATABASE_URL,
  authToken: import.meta.env.VITE_TURSO_AUTH_TOKEN,
  syncUrl: import.meta.env.VITE_TURSO_DATABASE_URL,
  syncInterval: 60, // Sync every 60 seconds
});

export const db = drizzle(tursoClient, { schema });
export { schema };

