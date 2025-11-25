import type { StorageAdapterName } from "@/api/storage/generic-types"

const VALID_ADAPTERS: StorageAdapterName[] = ['localStorage', 'drizzleLibsqlHttp', 'drizzleTauriSqlite']

const ADAPTER_ALIASES: Record<string, StorageAdapterName> = {
        localstorage: 'localStorage',
        drizzlelibsqlhttp: 'drizzleLibsqlHttp',
        drizzlelibsql: 'drizzleLibsqlHttp',
        drizzletaurisqlite: 'drizzleTauriSqlite'
}

const VALID_ADAPTER_SET = new Set<StorageAdapterName>(VALID_ADAPTERS)

export function normalizeAdapterName(adapter?: string | null): StorageAdapterName | null {
        if (!adapter) return null

        if (VALID_ADAPTER_SET.has(adapter as StorageAdapterName)) {
                return adapter as StorageAdapterName
        }

        const alias = ADAPTER_ALIASES[adapter.toLowerCase() as keyof typeof ADAPTER_ALIASES]
        return alias ?? null
}
