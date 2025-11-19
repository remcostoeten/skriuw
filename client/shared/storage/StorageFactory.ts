import type { StorageAdapter, StorageConfig } from "./types";
import { DrizzleTursoAdapter } from "./implementations/DrizzleTursoAdapter";
import { LocalStorageAdapter } from "./implementations/LocalStorageAdapter";

export function createStorageAdapter(config: StorageConfig): StorageAdapter {
  switch (config.adapter) {
    case 'drizzle-turso':
      return new DrizzleTursoAdapter({
        url: config.options?.url as string | undefined,
        authToken: config.options?.authToken as string | undefined,
        localDbPath: config.options?.localDbPath as string | undefined,
      });

    case 'localStorage':
      return new LocalStorageAdapter();

    default:
      throw new Error(`Unknown storage adapter: ${config.adapter}`);
  }
}

let currentStorage: StorageAdapter | null = null;

export async function initializeStorage(config: StorageConfig): Promise<StorageAdapter> {
  if (currentStorage) {
    await currentStorage.destroy();
  }

  currentStorage = createStorageAdapter(config);
  await currentStorage.initialize();

  return currentStorage;
}

export function getStorage(): StorageAdapter {
  if (!currentStorage) {
    throw new Error('Storage not initialized. Call initializeStorage() first.');
  }
  return currentStorage;
}

export async function destroyStorage(): Promise<void> {
  if (currentStorage) {
    await currentStorage.destroy();
    currentStorage = null;
  }
}