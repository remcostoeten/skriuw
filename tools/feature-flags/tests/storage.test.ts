import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureDefinitionSet } from '../src/core';
import { LocalStorageFeatureStore } from '../src/adapters/local-storage';
import { IndexedDBFeatureStore } from '../src/adapters/indexeddb';
import { InstantDBFeatureStore } from '../src/adapters/instantdb';
import { DrizzleFeatureStore } from '../src/adapters/drizzle';
import { InMemoryFeatureStore as CoreMemoryStore } from '../src/adapters/memory';

interface TestSchema {
  flagA: boolean;
  choice: 'left' | 'right';
}

const definitions: FeatureDefinitionSet<TestSchema> = {
  features: {
    flagA: { key: 'flagA', defaultValue: false },
    choice: { key: 'choice', defaultValue: 'left' },
  },
  environments: {
    production: { name: 'production', defaults: { flagA: true }, rules: {} },
  },
};

const segments = [];

describe('in-memory store', () => {
  it('stores overrides in memory', async () => {
    const store = new CoreMemoryStore<TestSchema>({ definitions, segments });
    expect(await store.getEnvironmentDefinition('production')).toEqual(definitions);
    await store.setUserOverrides('user-1', { flagA: false });
    expect(await store.getUserOverrides('user-1')).toEqual({ flagA: false });
  });
});

describe('local storage store', () => {
  const storage: Record<string, string> = {};
  beforeEach(() => {
    (globalThis as any).window = {
      localStorage: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
      },
    };
  });

  it('persists overrides to localStorage', async () => {
    const store = new LocalStorageFeatureStore<TestSchema>({
      storageKey: 'flags',
      definitions,
    });
    await store.setUserOverrides('anon', { choice: 'right' });
    expect(await store.getUserOverrides('anon')).toEqual({ choice: 'right' });
  });
});

describe('indexeddb store', () => {
  it('falls back gracefully when indexedDB is unavailable', async () => {
    (globalThis as any).indexedDB = undefined;
    const store = new IndexedDBFeatureStore<TestSchema>({
      definitions,
    });
    await store.setUserOverrides('user', { flagA: true });
    const defs = await store.getEnvironmentDefinition('production');
    expect(defs.features.flagA.defaultValue).toBe(false);
  });
});

describe('instantdb store', () => {
  it('uses fetcher for CRUD operations', async () => {
    const fetcher = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/overrides') && init?.method === 'GET') {
        return { ok: true, json: async () => ({ overrides: { flagA: true } }) } as Response;
      }
      if (url.includes('/overrides') && init?.method === 'POST') {
        return { ok: true, json: async () => ({}) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ definitions, segments, version: 'v1' }),
      } as Response;
    });
    const store = new InstantDBFeatureStore<TestSchema>({
      baseUrl: 'https://example.com',
      appId: 'app',
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(await store.getVersion('production')).toBe('v1');
    expect(await store.getUserOverrides('user')).toEqual({ flagA: true });
    await store.setUserOverrides('user', { choice: 'right' });
    expect(fetcher).toHaveBeenCalled();
  });
});

describe('drizzle store', () => {
  it('hydrates definitions from queryable database', async () => {
    const data = {
      features: [
        { key: 'flagA', description: null, defaultValue: 'false', valueType: 'boolean' },
        { key: 'choice', description: null, defaultValue: '"left"', valueType: 'string' },
      ],
      environmentDefaults: [
        { environment: 'production', featureKey: 'flagA', value: 'true' },
      ],
      rules: [],
      segments: [],
      versions: [{ environment: 'production', version: 1 }],
      userOverrides: [] as any[],
    };

    const db = {
      select: () => ({
        from: (table: unknown) => {
          if ((table as any).name === 'feature_definitions') {
            return Promise.resolve(data.features);
          }
          if ((table as any).name === 'feature_environment_defaults') {
            return Promise.resolve(data.environmentDefaults);
          }
          if ((table as any).name === 'feature_rules') {
            return Promise.resolve(data.rules);
          }
          if ((table as any).name === 'feature_segments') {
            return Promise.resolve(data.segments);
          }
          if ((table as any).name === 'feature_environment_versions') {
            return Promise.resolve(data.versions);
          }
          return Promise.resolve([]);
        },
      }),
      delete: () => ({ where: async () => {} }),
      insert: () => ({ values: async () => {} }),
    };

    const store = new DrizzleFeatureStore<TestSchema>(db, { dialect: 'sqlite' });
    const defs = await store.getEnvironmentDefinition('production');
    expect(defs.environments.production.defaults?.flagA).toBe(true);
  });
});
