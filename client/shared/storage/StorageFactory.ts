import type { StorageAdapter, StorageConfig } from "./types";
import { LocalStorageAdapter } from "./implementations/LocalStorageAdapter";

// Registry of available adapters
class StorageRegistry {
  private adapters = new Map<string, new (...args: any[]) => StorageAdapter>();

  register(name: string, adapter: new (...args: any[]) => StorageAdapter): void {
    this.adapters.set(name, adapter);
  }

  create(name: string, ...args: any[]): StorageAdapter {
    const AdapterClass = this.adapters.get(name);
    if (!AdapterClass) {
      throw new Error(`Storage adapter '${name}' not found`);
    }
    return new AdapterClass(...args);
  }

  list(): string[] {
    return Array.from(this.adapters.keys());
  }
}

// Global registry instance
const registry = new StorageRegistry();

// Register built-in adapters
registry.register('localStorage', LocalStorageAdapter);

// Factory function
export function createStorageAdapter(config: StorageConfig): StorageAdapter {
  switch (config.adapter) {
    case 'localStorage':
      return registry.create('localStorage');

    case 'instantdb':
      // TODO: Implement when ready
      throw new Error('InstantDB adapter not yet implemented');

    case 'drizzle-turso':
      // TODO: Implement when ready
      throw new Error('Drizzle + Turso adapter not yet implemented');

    case 'pglite':
      // TODO: Implement when ready
      throw new Error('PGLite adapter not yet implemented');

    default:
      throw new Error(`Unknown storage adapter: ${config.adapter}`);
  }
}

// Register additional adapters (for future use)
export function registerStorageAdapter(
  name: string,
  adapter: new (...args: any[]) => StorageAdapter
): void {
  registry.register(name, adapter);
}

export function getAvailableAdapters(): string[] {
  return registry.list();
}

// Singleton storage instance
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