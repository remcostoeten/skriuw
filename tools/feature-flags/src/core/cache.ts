import type { AsyncCache, AsyncCacheValue } from './types';

export class InMemoryCache<T> implements AsyncCache<T> {
  private readonly ttlMs: number;
  private readonly store = new Map<string, AsyncCacheValue<T>>();

  constructor(ttlMs = 30_000) {
    this.ttlMs = ttlMs;
  }

  async get(key: string): Promise<AsyncCacheValue<T> | undefined> {
    const value = this.store.get(key);
    if (!value) {
      return undefined;
    }
    if (value.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return value;
  }

  async set(key: string, value: AsyncCacheValue<T>): Promise<void> {
    const entry: AsyncCacheValue<T> = {
      ...value,
      expiresAt: value.expiresAt ?? Date.now() + this.ttlMs,
    };
    this.store.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
