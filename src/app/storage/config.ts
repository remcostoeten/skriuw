import type { LibsqlHttpOptions, StorageConfig, TauriSqliteOptions } from "@/api/storage/generic-types"

import {
        clearStoredStorageConfig,
        getStoredStorageConfig,
        setStoredStorageConfig
} from "./preferences"
import { normalizeAdapterName } from "./adapter-utils"

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
        adapter: "drizzleLibsqlHttp",
        options: {}
}

function getEnvStorageConfig(): StorageConfig | null {
        const adapter = normalizeAdapterName(import.meta.env.VITE_STORAGE_ADAPTER as string | undefined)
        if (!adapter) return null

        if (adapter === "drizzleLibsqlHttp") {
            const url = import.meta.env.VITE_LIBSQL_URL as string | undefined
            if (url) {
                    const authToken = import.meta.env.VITE_LIBSQL_AUTH_TOKEN as string | undefined
                    return { adapter, options: { url, authToken } satisfies LibsqlHttpOptions }
            }
            return null
        }

        if (adapter === "drizzleTauriSqlite") {
                const databasePath = import.meta.env.VITE_SQLITE_PATH as string | undefined
                if (!databasePath) return null
                return { adapter, options: { databasePath } satisfies TauriSqliteOptions }
        }

        return { adapter, options: {} } as StorageConfig
}

/**
 * Resolve the storage configuration chosen by the user or configured via env.
 * Returning null allows the onboarding flow to run.
 */
export function getStorageConfig(): StorageConfig | null {
        return getStoredStorageConfig() ?? getEnvStorageConfig()
}

export function persistStorageConfig(config: StorageConfig): void {
        setStoredStorageConfig(config)
}

export function resetStorageConfig(): void {
        clearStoredStorageConfig()
}
