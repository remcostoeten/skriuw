import type { StorageConfig } from "@/api/storage/generic-types"

import { clearStoredStorageConfig, getStoredStorageConfig, setStoredStorageConfig } from "./preferences"

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
