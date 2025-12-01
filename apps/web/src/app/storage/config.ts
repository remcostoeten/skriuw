import type { StorageConfig } from '@skriuw/storage/generic-types'

/**
 * Storage configuration
 * Uses PostgreSQL database via Drizzle ORM
 */
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
        adapter: "serverless-api",
        options: {}
}
