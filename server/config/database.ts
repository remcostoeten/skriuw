/**
 * @name DATABASE_CONFIG
 * @description Centralized place for database configuration variables
 */

export const DATABASE_CONFIG = {
  url: process.env.DATABASE_URL || process.env.TURSO_URL || '',
  authToken: process.env.TURSO_AUTH_TOKEN || '',
} as const;

