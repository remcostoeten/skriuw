import type { FeatureDefinitionSet, FeatureSchema, Segment, StorageProvider } from '../../core';

export interface IndexedDBFeatureStoreOptions<TSchema extends FeatureSchema> {
  dbName?: string;
  storeName?: string;
  definitions: FeatureDefinitionSet<TSchema>;
  segments?: Segment[];
  version?: string | number;
}

interface Payload<TSchema extends FeatureSchema> {
  definitions: FeatureDefinitionSet<TSchema>;
  segments: Segment[];
  version: string | number;
  overrides: Record<string, Partial<TSchema>>;
}

const DEFAULT_KEY = 'feature_payload';

function openDatabase(name: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function runTransaction<T>(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, handler: (store: IDBObjectStore) => T | Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    Promise.resolve(handler(store))
      .then((result) => {
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      })
      .catch(reject);
  });
}

function getRecord<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

function setRecord(store: IDBObjectStore, key: IDBValidKey, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDBFeatureStore<TSchema extends FeatureSchema> implements StorageProvider<TSchema> {
  private readonly dbPromise: Promise<IDBDatabase>;

  private readonly storeName: string;

  private readonly fallback: Payload<TSchema>;

  constructor(options: IndexedDBFeatureStoreOptions<TSchema>) {
    this.storeName = options.storeName ?? 'feature_flags';
    this.fallback = {
      definitions: options.definitions,
      segments: options.segments ?? [],
      version: options.version ?? 'indexeddb',
      overrides: {},
    };
    if (typeof indexedDB === 'undefined') {
      this.dbPromise = Promise.reject(new Error('IndexedDB is not available in this environment'));
    } else {
      this.dbPromise = openDatabase(options.dbName ?? 'feature_flags', this.storeName);
    }
  }

  private async read(): Promise<Payload<TSchema>> {
    try {
      const db = await this.dbPromise;
      return runTransaction(db, this.storeName, 'readonly', (store) => getRecord<Payload<TSchema>>(store, DEFAULT_KEY)).then(
        (value) => value ?? this.fallback,
      );
    } catch (error) {
      console.warn('IndexedDB unavailable, falling back to defaults', error);
      return this.fallback;
    }
  }

  private async write(payload: Payload<TSchema>): Promise<void> {
    try {
      const db = await this.dbPromise;
      await runTransaction(db, this.storeName, 'readwrite', (store) => setRecord(store, DEFAULT_KEY, payload));
    } catch (error) {
      console.warn('Failed to persist feature payload to IndexedDB', error);
    }
  }

  async getEnvironmentDefinition(_env: string): Promise<FeatureDefinitionSet<TSchema>> {
    return (await this.read()).definitions;
  }

  async getSegments(): Promise<Segment[]> {
    return (await this.read()).segments;
  }

  async getVersion(_env: string): Promise<string | number> {
    return (await this.read()).version;
  }

  async getUserOverrides(identityKey: string): Promise<Partial<TSchema> | null> {
    const payload = await this.read();
    return payload.overrides[identityKey] ?? null;
  }

  async setUserOverrides(identityKey: string, overrides: Partial<TSchema>): Promise<void> {
    const payload = await this.read();
    payload.overrides[identityKey] = overrides;
    await this.write(payload);
  }
}
