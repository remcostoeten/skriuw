export const DATABASE_CONFIG = {
  url: import.meta.env?.VITE_TURSO_URL || '',
  authToken: import.meta.env?.VITE_TURSO_AUTH_TOKEN || '',
} as const;

