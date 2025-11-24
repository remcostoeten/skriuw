import type { StorageConfig } from "@/api/storage/generic-types"

const STORAGE_CONFIG_KEY = 'storage.preference'
const STORAGE_SCHEMA_VERSION_KEY = 'storage.schemaVersion'
const STORAGE_SCHEMA_VERSION = '2'

function isStorageAvailable(): boolean {
        return typeof localStorage !== 'undefined'
}

function ensureSchemaVersion(): void {
        if (!isStorageAvailable()) return

        const currentVersion = localStorage.getItem(STORAGE_SCHEMA_VERSION_KEY)

        if (currentVersion !== STORAGE_SCHEMA_VERSION) {
                // We do not need backwards compatibility; wipe everything to start fresh.
                localStorage.clear()
                localStorage.setItem(STORAGE_SCHEMA_VERSION_KEY, STORAGE_SCHEMA_VERSION)
        }
}

export function getStoredStorageConfig(): StorageConfig | null {
        if (!isStorageAvailable()) return null

        ensureSchemaVersion()

        const raw = localStorage.getItem(STORAGE_CONFIG_KEY)
        if (!raw) return null

        try {
                const parsed = JSON.parse(raw) as StorageConfig
                return parsed
        } catch (error) {
                console.error('Failed to parse stored storage config', error)
                return null
        }
}

export function setStoredStorageConfig(config: StorageConfig): void {
        if (!isStorageAvailable()) return
        ensureSchemaVersion()
        localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config))
}

export function clearStoredStorageConfig(): void {
        if (!isStorageAvailable()) return
        ensureSchemaVersion()
        localStorage.removeItem(STORAGE_CONFIG_KEY)
}
