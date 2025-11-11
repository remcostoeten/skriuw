import type { StorageConfig } from "@/shared/storage";

// Default storage configuration
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  adapter: 'localStorage',
  options: {
    // localStorage-specific options can go here
  }
};

// Environment-based configuration
export function getStorageConfig(): StorageConfig {
  // Check environment variables or other configuration sources
  const adapter = import.meta.env?.VITE_STORAGE_ADAPTER || 'localStorage';

  // Validate adapter
  const validAdapters = ['localStorage', 'instantdb', 'drizzle-turso', 'pglite'];
  if (!validAdapters.includes(adapter)) {
    console.warn(`Invalid storage adapter: ${adapter}, falling back to localStorage`);
    return DEFAULT_STORAGE_CONFIG;
  }

  return {
    adapter: adapter as StorageConfig['adapter'],
    options: getAdapterOptions(adapter),
  };
}

function getAdapterOptions(adapter: string): Record<string, unknown> {
  switch (adapter) {
    case 'localStorage':
      return {
        // localStorage-specific options
      };

    case 'instantdb':
      return {
        appId: import.meta.env?.VITE_INSTANTDB_APP_ID,
        // Other InstantDB options
      };

    case 'drizzle-turso':
      return {
        url: import.meta.env?.VITE_TURSO_URL,
        authToken: import.meta.env?.VITE_TURSO_AUTH_TOKEN,
        // Other Drizzle/Turso options
      };

    case 'pglite':
      return {
        // PGLite options
      };

    default:
      return {};
  }
}