import type { FeatureDefinitionSet, FeatureSchema, Segment, StorageProvider } from '../../core';

export interface LocalStorageFeatureStoreOptions<TSchema extends FeatureSchema> {
  storageKey: string;
  definitions: FeatureDefinitionSet<TSchema>;
  segments?: Segment[];
  version?: string | number;
}

interface StoredPayload<TSchema extends FeatureSchema> {
  definitions: FeatureDefinitionSet<TSchema>;
  segments: Segment[];
  version: string | number;
  overrides: Record<string, Partial<TSchema>>;
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn('Failed to parse localStorage feature payload', error);
    return fallback;
  }
}

export class LocalStorageFeatureStore<TSchema extends FeatureSchema> implements StorageProvider<TSchema> {
  private readonly storageKey: string;

  private readonly fallback: StoredPayload<TSchema>;

  constructor(options: LocalStorageFeatureStoreOptions<TSchema>) {
    this.storageKey = options.storageKey;
    this.fallback = {
      definitions: options.definitions,
      segments: options.segments ?? [],
      version: options.version ?? 'local',
      overrides: {},
    };
  }

  private read(): StoredPayload<TSchema> {
    if (typeof window === 'undefined') {
      return this.fallback;
    }
    return safeParse<StoredPayload<TSchema>>(window.localStorage.getItem(this.storageKey), this.fallback);
  }

  private write(payload: StoredPayload<TSchema>): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(this.storageKey, JSON.stringify(payload));
  }

  async getEnvironmentDefinition(_env: string): Promise<FeatureDefinitionSet<TSchema>> {
    return this.read().definitions;
  }

  async getSegments(): Promise<Segment[]> {
    return this.read().segments;
  }

  async getVersion(_env: string): Promise<string | number> {
    return this.read().version;
  }

  async getUserOverrides(identityKey: string): Promise<Partial<TSchema> | null> {
    const payload = this.read();
    return payload.overrides[identityKey] ?? null;
  }

  async setUserOverrides(identityKey: string, overrides: Partial<TSchema>): Promise<void> {
    const payload = this.read();
    payload.overrides[identityKey] = overrides;
    this.write(payload);
  }
}
