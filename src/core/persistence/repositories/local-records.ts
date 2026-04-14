import type {
  PersistedRecordForStore,
  PersistedStoreName,
} from "@/core/shared/persistence-types";
import { destroyRecord, getRecord, listRecords, putRecord } from "@/core/storage";

export async function listLocalRecords<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
): Promise<PersistedRecordForStore<TStoreName>[]> {
  return listRecords(storeName);
}

export async function getLocalRecord<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
  id: PersistedRecordForStore<TStoreName>["id"],
): Promise<PersistedRecordForStore<TStoreName> | undefined> {
  return getRecord(storeName, id);
}

export async function putLocalRecord<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
  record: PersistedRecordForStore<TStoreName>,
): Promise<PersistedRecordForStore<TStoreName>> {
  return putRecord(storeName, record);
}

export async function destroyLocalRecord<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
  id: PersistedRecordForStore<TStoreName>["id"],
): Promise<void> {
  return destroyRecord(storeName, id);
}
