import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { DATABASE_CONFIG } from '../../config/database';

let db: ReturnType<typeof drizzle> | null = null;
let client: ReturnType<typeof createClient> | null = null;

type InitOptions = {
  url?: string;
  authToken?: string;
  localDbPath?: string;
};

export async function initDatabase(options?: InitOptions): Promise<void> {
  if (db) {
    return;
  }

  const url = options?.url || DATABASE_CONFIG.url;
  const authToken = options?.authToken || DATABASE_CONFIG.authToken;

  const clientConfig: Parameters<typeof createClient>[0] = {
    url,
  };

  if (authToken) {
    clientConfig.authToken = authToken;
  }

  if (options?.localDbPath) {
    clientConfig.url = `file:${options.localDbPath}`;
  }

  client = createClient(clientConfig);
  db = drizzle(client, { schema });

  await ensureTablesExist();

  console.log('Database initialized!');
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function getDatabase() {
  return getDb();
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
  db = null;
}

async function ensureTablesExist(): Promise<void> {
  if (!db) return;

  try {
    await db.$client.execute(`SELECT 1 FROM notes LIMIT 1`);
  } catch (error: any) {
    if (error?.message?.includes('no such table') || error?.message?.includes('does not exist')) {
      console.log('Creating database tables...');
      await createTables();
    } else {
      throw error;
    }
  }
}

async function createTables(): Promise<void> {
  if (!db) return;

  await db.$client.execute(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.$client.execute(`CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)`);
  await db.$client.execute(`CREATE INDEX IF NOT EXISTS idx_folders_updated_at ON folders(updated_at DESC)`);

  await db.$client.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.$client.execute(`CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes(folder_id)`);
  await db.$client.execute(`CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC)`);

  console.log('Database tables created successfully');
}
