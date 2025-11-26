import { normalizeAdapterName } from "./adapter-utils"

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
                const parsed = JSON.parse(raw) as StorageConfig & { adapter?: string }
                const adapter = normalizeAdapterName(parsed.adapter)

                if (!adapter) {
                        console.warn('Ignoring stored storage config with unknown adapter', parsed?.adapter)
                        return null
                }

                return { ...parsed, adapter }
        } catch (error) {
                console.error('Failed to parse stored storage config', error)
                return null
        }
}

export function setStoredStorageConfig(config: StorageConfig): void {
        if (!isStorageAvailable()) return
        ensureSchemaVersion()
        const adapter = normalizeAdapterName(config.adapter)

        if (!adapter) {
                console.error('Cannot persist storage config: unknown adapter', config.adapter)
                return
        }

        localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify({ ...config, adapter }))
}

export function clearStoredStorageConfig(): void {
        if (!isStorageAvailable()) return
        ensureSchemaVersion()
        localStorage.removeItem(STORAGE_CONFIG_KEY)
}
