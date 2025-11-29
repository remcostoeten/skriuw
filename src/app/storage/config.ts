import type { StorageConfig } from "@/api/storage/generic-types"

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
        adapter: "localStorage",
        options: {}
}

/**
 * Get the storage configuration - always returns localStorage
 */
export function getStorageConfig(): StorageConfig {
        return DEFAULT_STORAGE_CONFIG
}

export function persistStorageConfig(_config: StorageConfig): void {
        // No-op: always use localStorage
}

export function resetStorageConfig(): void {
        // No-op: always use localStorage
}
