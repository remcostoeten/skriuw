import type { PGlite } from "@electric-sql/pglite";
import type { PersistedRecordForStore, PersistedStoreName } from "@/core/shared/persistence-types";
import { openPGliteDb } from "./db";

type RecordRow = {
  record_json: unknown;
};

function parseJsonValue<T>(value: unknown): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }

  return value as T;
}

async function queryRows<T>(run: (db: PGlite) => Promise<T>): Promise<T> {
  const db = await openPGliteDb();
  return run(db);
}

export async function getPGliteRecord<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
  id: PersistedRecordForStore<TStoreName>["id"],
): Promise<PersistedRecordForStore<TStoreName> | undefined> {
  return queryRows(async (db) => {
    const result = await db.query<RecordRow>(
      `
        SELECT record_json
        FROM app_records
        WHERE store_name = $1 AND record_id = $2
        LIMIT 1
      `,
      [storeName, id],
    );

    const record = result.rows[0]?.record_json;
    return record ? parseJsonValue<PersistedRecordForStore<TStoreName>>(record) : undefined;
  });
}

export async function listPGliteRecords<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
): Promise<PersistedRecordForStore<TStoreName>[]> {
  return queryRows(async (db) => {
    const result = await db.query<RecordRow>(
      `
        SELECT record_json
        FROM app_records
        WHERE store_name = $1
        ORDER BY record_id ASC
      `,
      [storeName],
    );

    return result.rows.map((row) => parseJsonValue<PersistedRecordForStore<TStoreName>>(row.record_json));
  });
}

export async function putPGliteRecord<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
  record: PersistedRecordForStore<TStoreName>,
): Promise<PersistedRecordForStore<TStoreName>> {
  return queryRows(async (db) => {
    await db.query(
      `
        INSERT INTO app_records (store_name, record_id, record_json)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (store_name, record_id)
        DO UPDATE SET record_json = EXCLUDED.record_json
      `,
      [storeName, record.id, JSON.stringify(record)],
    );

    return record;
  });
}

export async function destroyPGliteRecord<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
  id: PersistedRecordForStore<TStoreName>["id"],
): Promise<void> {
  return queryRows(async (db) => {
    await db.query(
      `
        DELETE FROM app_records
        WHERE store_name = $1 AND record_id = $2
      `,
      [storeName, id],
    );
  });
}
