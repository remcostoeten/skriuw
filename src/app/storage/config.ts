import type { StorageConfig } from "@/api/storage/generic-types"

/**
 * Storage configuration
 * NOTE: This app runs on PostgreSQL, not localStorage
 * The localStorage adapter should not be used in production
 */
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
        // Using localStorage as fallback only - postgres adapter should be configured
        adapter: "localStorage",
        options: {}
}
