import type {
  LibsqlHttpOptions,
  StorageAdapterName,
  StorageConfig,
  TauriSqliteOptions,
} from "@/api/storage/generic-types";

const STORAGE_CONFIG_KEY = 'skriuw:onboarding:storage-config';

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  adapter: 'localStorage',
  options: {},
};

function parsePersistedConfig(value: string | null): StorageConfig | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StorageConfig>;
    if (parsed && parsed.adapter) {
      return parsed as StorageConfig;
    }
  } catch (error) {
    console.warn('Failed to parse persisted storage config', error);
  }
  return null;
}

function getOnboardingStorageConfig(): StorageConfig | null {
  if (typeof localStorage === 'undefined') return null;
  const persisted = parsePersistedConfig(localStorage.getItem(STORAGE_CONFIG_KEY));
  return persisted;
}

function getEnvStorageConfig(): StorageConfig | null {
  const adapter = (import.meta.env.VITE_STORAGE_ADAPTER as StorageAdapterName | undefined) || undefined;
  if (!adapter) return null;

  if (adapter === 'drizzleLibsqlHttp') {
    const url = import.meta.env.VITE_LIBSQL_URL as string | undefined;
    if (url) {
      const authToken = import.meta.env.VITE_LIBSQL_AUTH_TOKEN as string | undefined;
      return { adapter, options: { url, authToken } satisfies LibsqlHttpOptions };
    }
  }

  if (adapter === 'drizzleTauriSqlite') {
    const databasePath = import.meta.env.VITE_SQLITE_PATH as string | undefined;
    return { adapter, options: { databasePath } satisfies TauriSqliteOptions };
  }

  return { adapter, options: {} } as StorageConfig;
}

export function getStorageConfig(): StorageConfig {
  return getOnboardingStorageConfig() || getEnvStorageConfig() || DEFAULT_STORAGE_CONFIG;
import type { StorageConfig } from "@/api/storage/generic-types"


export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
        adapter: 'localStorage',
        options: {
                // localStorage-specific options can go here
        }
}

/**
 * Retrieve the persisted storage config (if selected). Returns null until the
 * onboarding flow records a user choice.
 */
export function getStorageConfig(): StorageConfig | null {
        return getStoredStorageConfig()
}

export function persistStorageConfig(config: StorageConfig): void {
        setStoredStorageConfig(config)
}

export function resetStorageConfig(): void {
        clearStoredStorageConfig()
}
