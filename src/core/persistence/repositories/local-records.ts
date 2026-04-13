import type {
  PersistedRecordForStore,
  PersistedStoreName,
} from "@/core/shared/persistence-types";
import {
  destroyPGliteRecord,
  getPGliteRecord,
  listPGliteRecords,
  putPGliteRecord,
} from "@/core/persistence/pglite/records";
import { destroyRecord, getRecord, listRecords, putRecord } from "@/core/storage";
import { resolveLocalPersistenceBackend } from "./local-backend";

async function withLocalBackend<T>(
  run: (backend: "pglite" | "indexeddb") => Promise<T>,
): Promise<T> {
  const backend = await resolveLocalPersistenceBackend();
  return run(backend);
}

export async function listLocalRecords<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
): Promise<PersistedRecordForStore<TStoreName>[]> {
  return withLocalBackend((backend) =>
    backend === "pglite" ? listPGliteRecords(storeName) : listRecords(storeName),
  );
}

export async function getLocalRecord<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
  id: PersistedRecordForStore<TStoreName>["id"],
): Promise<PersistedRecordForStore<TStoreName> | undefined> {
  return withLocalBackend((backend) =>
    backend === "pglite" ? getPGliteRecord(storeName, id) : getRecord(storeName, id),
  );
}

export async function putLocalRecord<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
  record: PersistedRecordForStore<TStoreName>,
): Promise<PersistedRecordForStore<TStoreName>> {
  return withLocalBackend((backend) =>
    backend === "pglite" ? putPGliteRecord(storeName, record) : putRecord(storeName, record),
  );
}

export async function destroyLocalRecord<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
  id: PersistedRecordForStore<TStoreName>["id"],
): Promise<void> {
  return withLocalBackend((backend) =>
    backend === "pglite" ? destroyPGliteRecord(storeName, id) : destroyRecord(storeName, id),
  );
}
