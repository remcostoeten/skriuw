import { openPGliteDb } from "@/core/persistence/pglite";

export type LocalPersistenceBackend = "pglite" | "indexeddb";

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

export function resetLocalPersistenceBackendForTests(): void {
  backendPromise = null;
}
