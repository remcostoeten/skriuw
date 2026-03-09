import type { PersistedRecordForStore, PersistedStoreName } from "@/core/shared/persistence-types";
import { runInTransaction } from "./db";
import { toStorageError } from "./errors";

export async function destroyRecord<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
  id: PersistedRecordForStore<TStoreName>["id"],
): Promise<void> {
  return runInTransaction(storeName, "readwrite", async (stores) => {
    const store = stores.get(storeName);
    if (!store) {
      throw toStorageError("transaction_failed", `Missing object store: ${storeName}`);
    }

    return new Promise<void>((resolve, reject) => {
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(
          toStorageError(
            "transaction_failed",
            `Failed to destroy record from store: ${storeName}`,
            request.error,
          ),
        );
      };
    });
  });
}
