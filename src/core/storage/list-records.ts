import type { PersistedRecordForStore, PersistedStoreName } from "@/core/shared/persistence-types";
import { runInTransaction } from "./db";
import { toStorageError } from "./errors";

export async function listRecords<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
): Promise<PersistedRecordForStore<TStoreName>[]> {
  return runInTransaction(storeName, "readonly", async (stores) => {
    const store = stores.get(storeName);
    if (!store) {
      throw toStorageError("transaction_failed", `Missing object store: ${storeName}`);
    }

    return new Promise<PersistedRecordForStore<TStoreName>[]>((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as PersistedRecordForStore<TStoreName>[]);
      };

      request.onerror = () => {
        reject(
          toStorageError(
            "transaction_failed",
            `Failed to list records from store: ${storeName}`,
            request.error,
          ),
        );
      };
    });
  });
}
