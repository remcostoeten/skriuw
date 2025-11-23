import type { StorageConfig } from '@/api/storage/generic-types'

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
    adapter: 'localStorage',
    options: {
        // localStorage-specific options can go here
    }
}

export function getStorageConfig(): StorageConfig {
    return DEFAULT_STORAGE_CONFIG
}
