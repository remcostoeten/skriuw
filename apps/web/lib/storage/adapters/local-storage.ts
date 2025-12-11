/**
 * @fileoverview Local Storage Adapter
 * @description A localStorage-based adapter for @skriuw/crud that works without auth.
 * Used as fallback/demo mode before user authenticates.
 */

import type { StorageAdapter, BaseEntity } from '@skriuw/crud'

const STORAGE_PREFIX = 'skriuw_demo:'

/**
 * Creates a localStorage-based adapter for demo/unauthenticated mode
 */
export function createLocalStorageAdapter(): StorageAdapter {
    function getKey(storageKey: string): string {
        return `${STORAGE_PREFIX}${storageKey}`
    }

    function readStorage<T>(key: string): T[] {
        if (typeof window === 'undefined') return []
        const raw = localStorage.getItem(getKey(key))
        if (!raw) return []
        try {
            return JSON.parse(raw)
        } catch {
            return []
        }
    }

    function writeStorage<T>(key: string, data: T[]): void {
        if (typeof window === 'undefined') return
        localStorage.setItem(getKey(key), JSON.stringify(data))
    }

    return {
        async create<T extends BaseEntity>(
            storageKey: string,
            data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
        ): Promise<T> {
            const items = readStorage<T>(storageKey)
            const now = Date.now()
            const newItem = {
                ...data,
                id: data.id ?? `local_${now}_${Math.random().toString(36).slice(2, 8)}`,
                createdAt: now,
                updatedAt: now,
            } as T

            items.push(newItem)
            writeStorage(storageKey, items)
            return newItem
        },

        async read<T extends BaseEntity>(
            storageKey: string,
            options?: { getById?: string }
        ): Promise<T[] | T | undefined> {
            const items = readStorage<T>(storageKey)

            if (options?.getById) {
                return items.find(item => item.id === options.getById)
            }

            return items
        },

        async update<T extends BaseEntity>(
            storageKey: string,
            id: string,
            data: Partial<T>
        ): Promise<T | undefined> {
            const items = readStorage<T>(storageKey)
            const index = items.findIndex(item => item.id === id)

            if (index === -1) return undefined

            const updated = {
                ...items[index],
                ...data,
                updatedAt: Date.now(),
            } as T

            items[index] = updated
            writeStorage(storageKey, items)
            return updated
        },

        async delete(storageKey: string, id: string): Promise<boolean> {
            const items = readStorage<BaseEntity>(storageKey)
            const filtered = items.filter(item => item.id !== id)

            if (filtered.length === items.length) return false

            writeStorage(storageKey, filtered)
            return true
        },
    }
}

/**
 * Get all demo data from localStorage for migration
 */
export function getDemoData(): Record<string, unknown[]> {
    if (typeof window === 'undefined') return {}

    const data: Record<string, unknown[]> = {}

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(STORAGE_PREFIX)) {
            const storageKey = key.replace(STORAGE_PREFIX, '')
            try {
                data[storageKey] = JSON.parse(localStorage.getItem(key) || '[]')
            } catch {
                data[storageKey] = []
            }
        }
    }

    return data
}

/**
 * Clear all demo data from localStorage (after migration)
 */
export function clearDemoData(): void {
    if (typeof window === 'undefined') return

    const keysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(STORAGE_PREFIX)) {
            keysToRemove.push(key)
        }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key))
}

/**
 * Check if there's any demo data to migrate
 */
export function hasDemoData(): boolean {
    if (typeof window === 'undefined') return false

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(STORAGE_PREFIX)) {
            return true
        }
    }

    return false
}
