import { openPGliteDb } from "@/core/persistence/pglite";

export type LocalPersistenceBackend = "pglite" | "indexeddb";
export type LocalPersistenceDurability = "durable" | "ephemeral" | "unknown";

const EPHEMERAL_STORAGE_QUOTA_BYTES = 128 * 1024 * 1024;

let backendPromise: Promise<LocalPersistenceBackend> | null = null;

export async function resolveLocalPersistenceBackend(): Promise<LocalPersistenceBackend> {
  if (backendPromise) {
    return backendPromise;
  }

  backendPromise = openPGliteDb()
    .then(() => "pglite" as const)
    .catch((error) => {
      console.warn("Falling back to IndexedDB persistence because PGlite failed to initialize.", error);
      return "indexeddb" as const;
    });

  return backendPromise;
}

export async function detectLocalPersistenceDurability(): Promise<LocalPersistenceDurability> {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return "unknown";
  }

  try {
    if (typeof navigator.storage.persisted === "function") {
      const isPersisted = await navigator.storage.persisted();
      if (isPersisted) {
        return "durable";
      }
    }

    if (typeof navigator.storage.estimate === "function") {
      const estimate = await navigator.storage.estimate();
      const quota = typeof estimate.quota === "number" ? estimate.quota : undefined;

      if (quota && quota > 0 && quota < EPHEMERAL_STORAGE_QUOTA_BYTES) {
        return "ephemeral";
      }
    }
  } catch {
    return "unknown";
  }

  return "unknown";
}

export function resetLocalPersistenceBackendForTests(): void {
  backendPromise = null;
}
