import type { StorageAdapterName } from "@/api/storage/generic-types"

export function normalizeAdapterName(adapter?: string | null): StorageAdapterName | null {
        if (!adapter) return null
        if (adapter === 'localStorage') return 'localStorage'
        return null
}
