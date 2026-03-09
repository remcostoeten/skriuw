import { type PersistedStoreName } from "@/core/shared/persistence-types";
import { toStorageError } from "./errors";
import {
  PERSISTENCE_DB_NAME,
  PERSISTENCE_DB_VERSION,
  PERSISTENCE_STORE_DEFINITIONS,
} from "./schema";

let openDbPromise: Promise<IDBDatabase> | null = null;

function getIndexedDb(): IDBFactory {
  if (typeof indexedDB === "undefined") {
    throw toStorageError(
      "storage_unavailable",
      "IndexedDB is not available in the current runtime.",
    );
  }

  return indexedDB;
}

function initializeSchema(database: IDBDatabase) {
  for (const store of PERSISTENCE_STORE_DEFINITIONS) {
    if (!database.objectStoreNames.contains(store.name)) {
      database.createObjectStore(store.name, { keyPath: store.keyPath });
    }
  }
}

export async function openPersistenceDb(): Promise<IDBDatabase> {
  if (openDbPromise) {
    return openDbPromise;
  }

  openDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;

    try {
      request = getIndexedDb().open(PERSISTENCE_DB_NAME, PERSISTENCE_DB_VERSION);
    } catch (error) {
      reject(
        toStorageError("database_open_failed", "Failed to open the persistence database.", error),
      );
      return;
    }

    request.onupgradeneeded = () => {
      try {
        initializeSchema(request.result);
      } catch (error) {
        reject(
          toStorageError(
            "database_upgrade_failed",
            "Failed to initialize the persistence database schema.",
            error,
          ),
        );
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        openDbPromise = null;
      };
      resolve(database);
    };

    request.onerror = () => {
      reject(
        toStorageError(
          "database_open_failed",
          "IndexedDB failed while opening the persistence database.",
          request.error,
        ),
      );
    };

    request.onblocked = () => {
      reject(
        toStorageError(
          "database_open_failed",
          "IndexedDB open request was blocked by another open connection.",
        ),
      );
    };
  }).catch((error) => {
    openDbPromise = null;
    throw error;
  });

  return openDbPromise;
}

export async function runInTransaction<T>(
  storeNames: PersistedStoreName | PersistedStoreName[],
  mode: IDBTransactionMode,
  run: (stores: Map<PersistedStoreName, IDBObjectStore>, transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await openPersistenceDb();
  const normalizedStoreNames = Array.isArray(storeNames) ? storeNames : [storeNames];

  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    let didSettle = false;
    let result: T;

    try {
      transaction = database.transaction(normalizedStoreNames, mode);
    } catch (error) {
      reject(
        toStorageError("transaction_failed", "Failed to open a persistence transaction.", error),
      );
      return;
    }

    const stores = new Map<PersistedStoreName, IDBObjectStore>(
      normalizedStoreNames.map((storeName) => [storeName, transaction.objectStore(storeName)]),
    );

    run(stores, transaction)
      .then((value) => {
        result = value;
      })
      .catch((error) => {
        if (didSettle) return;
        didSettle = true;
        reject(
          toStorageError("transaction_failed", "Persistence transaction callback failed.", error),
        );
        transaction.abort();
      });

    transaction.oncomplete = () => {
      if (didSettle) return;
      didSettle = true;
      resolve(result);
    };

    transaction.onerror = () => {
      if (didSettle) return;
      didSettle = true;
      reject(
        toStorageError("transaction_failed", "Persistence transaction failed.", transaction.error),
      );
    };

    transaction.onabort = () => {
      if (didSettle) return;
      didSettle = true;
      reject(
        toStorageError(
          "transaction_failed",
          "Persistence transaction was aborted.",
          transaction.error,
        ),
      );
    };
  });
}

export async function closePersistenceDb(): Promise<void> {
  if (!openDbPromise) {
    return;
  }

  const database = await openDbPromise;
  database.close();
  openDbPromise = null;
}
