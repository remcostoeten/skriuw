import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

let db: ReturnType<typeof drizzle> | null = null;

/**
 * Initialize the database connection
 * Turso handles sync automatically - just connect!
 */
export async function initDatabase(): Promise<void> {
  if (db) {
    return;
  }

  const url = import.meta.env?.VITE_TURSO_URL || 'libsql://resolved-justice-remcostoeten.aws-eu-west-1.turso.io';
  const authToken = import.meta.env?.VITE_TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjI5ODcyNzksImlkIjoiZTlkNmU3NzctMjQ2ZS00MGZiLWE5MzAtZjI0NTQwOWU2MDkyIiwicmlkIjoiODBiNGIxMGYtZTYyNi00NWNkLTlkYzQtMmIyYjViNzY4NWM3In0.oLtKZBNYWJ7t4qK25FroXSAZZzxrq_8HTEpoCQIdDpqvVEKWBtEkRnWHBypj3x4GQk8V-D5dQyrXbpX26krGDg';

  const client = createClient({
    url,
    authToken,
  });

  db = drizzle(client, { schema });

  // Ensure tables exist
  await ensureTablesExist();

  console.log('Database initialized!');
}

/**
 * Get the database instance
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Ensure database tables exist, create them if they don't
 */
async function ensureTablesExist(): Promise<void> {
  if (!db) return;

  try {
    // Try to query the notes table to see if it exists
    await db.execute(`SELECT 1 FROM notes LIMIT 1`);
  } catch (error: any) {
    // Table doesn't exist, create it
    if (error?.message?.includes('no such table') || error?.message?.includes('does not exist')) {
      console.log('Creating database tables...');
      await createTables();
    } else {
      throw error;
    }
  }
}

/**
 * Create database tables
 */
async function createTables(): Promise<void> {
  if (!db) return;

  // Create folders table first (no dependencies)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_folders_updated_at ON folders(updated_at DESC)`);

  // Create notes table (depends on folders)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes(folder_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC)`);

  console.log('Database tables created successfully');
}

