import { PERSISTED_STORE_NAMES, type PersistedStoreName } from "@/core/shared/persistence-types";
import { runInTransaction } from "@/core/storage/db";
import { toStorageError } from "@/core/storage/errors";

export async function runFolderTransaction<T>(
  storeNames: PersistedStoreName | PersistedStoreName[],
  mode: IDBTransactionMode,
  run: (stores: Map<PersistedStoreName, IDBObjectStore>, transaction: IDBTransaction) => Promise<T>,
) {
  return runInTransaction(storeNames, mode, run);
}

export function createFolderStorageError(
  code: Parameters<typeof toStorageError>[0],
  message: Parameters<typeof toStorageError>[1],
  cause?: Parameters<typeof toStorageError>[2],
) {
  return toStorageError(code, message, cause);
}

export { PERSISTED_STORE_NAMES };
