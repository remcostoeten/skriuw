import type { PersistedRecordForStore, PersistedStoreName } from "@/core/shared/persistence-types";
import { runInTransaction } from "./db";
import { toStorageError } from "./errors";

export async function putRecord<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
  record: PersistedRecordForStore<TStoreName>,
): Promise<PersistedRecordForStore<TStoreName>> {
  return runInTransaction(storeName, "readwrite", async (stores) => {
    const store = stores.get(storeName);
    if (!store) {
      throw toStorageError("transaction_failed", `Missing object store: ${storeName}`);
    }

    return new Promise<PersistedRecordForStore<TStoreName>>((resolve, reject) => {
      const request = store.put(record);

      request.onsuccess = () => resolve(record);
      request.onerror = () => {
        reject(
          toStorageError(
            "transaction_failed",
            `Failed to write record to store: ${storeName}`,
            request.error,
          ),
        );
      };
    });
  });
}
