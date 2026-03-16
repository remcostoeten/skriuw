"use client";

import { PGlite } from "@electric-sql/pglite";
import type { PersistedStoreName } from "@/core/shared/persistence-types";
import { listRecords } from "@/core/storage";
import { getPersistenceStoreNames, PERSISTENCE_DB_VERSION } from "@/core/storage/schema";

const PGLITE_DATA_DIR = "idb://theme-persistence-pglite";
const LEGACY_IMPORT_KEY = `legacy_indexeddb_import_v${PERSISTENCE_DB_VERSION}`;

let openDbPromise: Promise<PGlite> | null = null;

type MetaRow = {
  value_json: unknown;
};

type CountRow = {
  record_count: number | string;
};

function ensureBrowserRuntime() {
  if (typeof window === "undefined") {
    throw new Error("PGlite persistence is only available in the browser runtime.");
  }
}

function parseJsonValue<T>(value: unknown): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }

  return value as T;
}

async function initializeSchema(db: PGlite) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_records (
      store_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      record_json JSONB NOT NULL,
      PRIMARY KEY (store_name, record_id)
    );

    CREATE INDEX IF NOT EXISTS app_records_store_name_idx
      ON app_records (store_name);

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value_json JSONB NOT NULL
    );
  `);
}

async function getMeta<T>(db: PGlite, key: string): Promise<T | undefined> {
  const result = await db.query<MetaRow>(
    `SELECT value_json FROM app_meta WHERE key = $1 LIMIT 1`,
    [key],
  );

  return result.rows[0] ? parseJsonValue<T>(result.rows[0].value_json) : undefined;
}

async function setMeta(db: PGlite, key: string, value: unknown): Promise<void> {
  await db.query(
    `
      INSERT INTO app_meta (key, value_json)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (key)
      DO UPDATE SET value_json = EXCLUDED.value_json
    `,
    [key, JSON.stringify(value)],
  );
}

async function getRecordCount(db: PGlite): Promise<number> {
  const result = await db.query<CountRow>(
    `SELECT COUNT(*)::int AS record_count FROM app_records`,
  );

  return Number(result.rows[0]?.record_count ?? 0);
}

async function importLegacyStore(db: PGlite, storeName: PersistedStoreName): Promise<number> {
  const records = await listRecords(storeName);

  for (const record of records) {
    await db.query(
      `
        INSERT INTO app_records (store_name, record_id, record_json)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (store_name, record_id)
        DO UPDATE SET record_json = EXCLUDED.record_json
      `,
      [storeName, record.id, JSON.stringify(record)],
    );
  }

  return records.length;
}

async function migrateFromIndexedDbIfNeeded(db: PGlite): Promise<void> {
  const existingMigration = await getMeta<{ status: string }>(db, LEGACY_IMPORT_KEY);
  if (existingMigration) {
    return;
  }

  const existingRecordCount = await getRecordCount(db);
  if (existingRecordCount > 0) {
    await setMeta(db, LEGACY_IMPORT_KEY, {
      status: "skipped_existing_pglite_records",
      migratedAt: new Date().toISOString(),
    });
    return;
  }

  let importedRecords = 0;
  for (const storeName of getPersistenceStoreNames()) {
    importedRecords += await importLegacyStore(db, storeName);
  }

  await setMeta(db, LEGACY_IMPORT_KEY, {
    status: "completed",
    importedRecords,
    migratedAt: new Date().toISOString(),
  });
}

export async function openPGliteDb(): Promise<PGlite> {
  if (openDbPromise) {
    return openDbPromise;
  }

  openDbPromise = (async () => {
    ensureBrowserRuntime();

    const db = new PGlite(PGLITE_DATA_DIR, {
      relaxedDurability: true,
    });

    await db.waitReady;
    await initializeSchema(db);
    await migrateFromIndexedDbIfNeeded(db);

    return db;
  })().catch((error) => {
    openDbPromise = null;
    throw error;
  });

  return openDbPromise;
}

export async function closePGliteDb(): Promise<void> {
  if (!openDbPromise) {
    return;
  }

  const db = await openDbPromise;
  await db.close();
  openDbPromise = null;
}

export function resetPGliteDbForTests(): void {
  openDbPromise = null;
}
