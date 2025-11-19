import type { StorageConfig } from "@/shared/storage";
import { DATABASE_CONFIG } from "@/shared/config/database";

const ADAPTER = import.meta.env?.VITE_STORAGE_ADAPTER as StorageConfig['adapter'] || 'drizzle-turso' as StorageConfig['adapter'];

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  adapter: ADAPTER,
  options: {
    url: DATABASE_CONFIG.url,
    authToken: DATABASE_CONFIG.authToken,
  }
};

export function getStorageConfig(): StorageConfig {

  const validAdapters: StorageConfig['adapter'][] = ['drizzle-turso', 'localStorage'];
  if (!validAdapters.includes(ADAPTER)) {
    console.warn(`Invalid storage adapter: ${ADAPTER}, falling back to drizzle-turso`);
    return DEFAULT_STORAGE_CONFIG;
  }

  return {
    adapter: ADAPTER,
    options: getAdapterOptions(),
  };
}

function getAdapterOptions(): Record<string, unknown> {
    return {
      url: DATABASE_CONFIG.url,
      authToken: DATABASE_CONFIG.authToken,
    };
}