import type { PersistedRecordForStore, PersistedStoreName } from "@/core/shared/persistence-types";
import { runInTransaction } from "./db";
import { toStorageError } from "./errors";

export async function getRecord<TStoreName extends PersistedStoreName>(
  storeName: TStoreName,
  id: PersistedRecordForStore<TStoreName>["id"],
): Promise<PersistedRecordForStore<TStoreName> | undefined> {
  return runInTransaction(storeName, "readonly", async (stores) => {
    const store = stores.get(storeName);
    if (!store) {
      throw toStorageError("transaction_failed", `Missing object store: ${storeName}`);
    }

    return new Promise<PersistedRecordForStore<TStoreName> | undefined>((resolve, reject) => {
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result as PersistedRecordForStore<TStoreName> | undefined);
      };

      request.onerror = () => {
        reject(
          toStorageError(
            "transaction_failed",
            `Failed to read record from store: ${storeName}`,
            request.error,
          ),
        );
      };
    });
  });
}
