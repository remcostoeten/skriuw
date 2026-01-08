/**
 * @fileoverview LocalStorage Adapter
 * @description Implements StorageAdapter for guest users using browser LocalStorage.
 */

import { generatePreseededItems, hasPreseededItems, markPreseededItems } from '../../preseed-data'
import type {
    StorageAdapter,
    ReadAdapterOptions,
    CreateAdapterOptions,
    UpdateAdapterOptions,
    DeleteAdapterOptions,
    BatchReadAdapterOptions,
    BatchCreateAdapterOptions,
    BatchUpdateAdapterOptions,
    BatchDeleteAdapterOptions
} from './types'

const PRESEEDED_KEYS = ['skriuw:notes', 'notes'];

// Helpers for LocalStorage operations
function getLocalItems<T>(key: string): T[] {
    if (typeof window === 'undefined') return []
    try {
        const item = window.localStorage.getItem(key)
        return item ? JSON.parse(item) : []
    } catch (e) {
        console.warn(`Error reading from localStorage key "${key}":`, e)
        return []
    }
}

function setLocalItems<T>(key: string, items: T[]): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(key, JSON.stringify(items))
    } catch (e) {
        console.warn(`Error writing to localStorage key "${key}":`, e)
    }
}

// Recursive helper to find item location in tree
function findItemLocation(
    items: any[],
    id: string,
    visited = new Set<string>() // Prevent infinite recursion
): { list: any[]; index: number } | null {
    const index = items.findIndex((i) => i.id === id)
    if (index !== -1) return { list: items, index }

    for (const item of items) {
        // Circular reference check
        if (item.id && visited.has(item.id)) continue;
        if (item.id) visited.add(item.id);

        if (item.children && Array.isArray(item.children)) {
            const found = findItemLocation(item.children, id, visited)
            if (found) return found
        }
    }
    return null
}

export class LocalStorageAdapter implements StorageAdapter {
    name = 'local-storage'

    async create<T>(
        storageKey: string,
        data: any,
        options?: CreateAdapterOptions
    ): Promise<T> {
        const items = getLocalItems<any>(storageKey)
        const timestamp = Date.now()
        const newItem = {
            ...data,
            // Ensure ID exists
            id: data.id || `local-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: timestamp,
            updatedAt: timestamp
        }

        if (newItem.parentFolderId) {
            // Find parent folder and add to its children
            const location = findItemLocation(items, newItem.parentFolderId)
            if (location) {
                const parent = location.list[location.index]
                if (!parent.children) parent.children = []
                parent.children.push(newItem)
            } else {
                // Parent not found, fallback to root
                items.push(newItem)
            }
        } else {
            items.push(newItem)
        }

        setLocalItems(storageKey, items)
        return newItem as T
    }

    async read<T>(
        storageKey: string,
        options?: ReadAdapterOptions
    ): Promise<T[] | T | undefined> {
        const items = getLocalItems<any>(storageKey)

        if (options?.getById) {
            const location = findItemLocation(items, options.getById)
            return (location ? location.list[location.index] : undefined) as T | undefined
        }

        return items as T[]
    }

    async readOne<T>(
        storageKey: string,
        id: string,
        options?: ReadAdapterOptions
    ): Promise<T | null> {
        const items = getLocalItems<any>(storageKey)
        const location = findItemLocation(items, id)
        return (location ? location.list[location.index] : null) as T | null
    }

    async readMany<T>(
        storageKey: string,
        options?: BatchReadAdapterOptions
    ): Promise<T[]> {
        const items = getLocalItems<T>(storageKey)

        // Auto-seed for guest if empty and not seeded
        if (items.length === 0 && PRESEEDED_KEYS.includes(storageKey) && !hasPreseededItems()) {
            try {
                const seedItems = generatePreseededItems('guest')
                const treeItems: any[] = []

                // Build tree structure for seed items
                seedItems.forEach((item: any) => {
                    const anyItem = item
                    // Ensure children array exists for folders
                    if (anyItem.type === 'folder' && !anyItem.children) {
                        anyItem.children = []
                    }

                    if (anyItem.parentFolderId) {
                        // Pass fresh Set for each find pass to allow DAGs but prevent cycles
                        const location = findItemLocation(treeItems, anyItem.parentFolderId)
                        if (location) {
                            const parent = location.list[location.index]
                            if (!parent.children) parent.children = []
                            parent.children.push(anyItem)
                        } else {
                            treeItems.push(anyItem)
                        }
                    } else {
                        treeItems.push(anyItem)
                    }
                })

                setLocalItems(storageKey, treeItems)
                return treeItems as T[]
            } catch (error) {
                console.error('Failed to seed guest data:', error)
                // Fallback to empty items if seeding fails
                return items
            } finally {
                // Always mark as seeded to prevent infinite retry loops on failure
                markPreseededItems()
            }
        }

        return items
    }

    async update<T>(
        storageKey: string,
        id: string,
        data: any,
        options?: UpdateAdapterOptions
    ): Promise<T | undefined> {
        const items = getLocalItems<any>(storageKey)
        const location = findItemLocation(items, id)
        if (!location) return undefined

        const updatedItem = {
            ...location.list[location.index],
            ...data,
            updatedAt: Date.now()
        }
        location.list[location.index] = updatedItem
        setLocalItems(storageKey, items)
        return updatedItem as T
    }

    async delete(
        storageKey: string,
        id: string,
        options?: DeleteAdapterOptions
    ): Promise<boolean> {
        const items = getLocalItems<any>(storageKey)
        const location = findItemLocation(items, id)
        if (!location) return false

        location.list.splice(location.index, 1)
        setLocalItems(storageKey, items)
        return true
    }

    async batchCreate<T>(
        storageKey: string,
        items: any[],
        options?: BatchCreateAdapterOptions
    ): Promise<T[]> {
        const existingItems = getLocalItems<any>(storageKey)
        const timestamp = Date.now()

        const newItems = items.map(item => ({
            ...item,
            id: item.id || `local-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: timestamp,
            updatedAt: timestamp
        }))

        newItems.forEach(newItem => {
            if (newItem.parentFolderId) {
                const location = findItemLocation(existingItems, newItem.parentFolderId)
                if (location) {
                    if (!location.list[location.index].children) location.list[location.index].children = []
                    location.list[location.index].children.push(newItem)
                } else {
                    existingItems.push(newItem)
                }
            } else {
                existingItems.push(newItem)
            }
        })

        setLocalItems(storageKey, existingItems)
        return newItems as T[]
    }

    async batchRead<T>(
        storageKey: string,
        ids: string[],
        options?: BatchReadAdapterOptions
    ): Promise<T[]> {
        const items = getLocalItems<any>(storageKey)
        const results: T[] = []
        for (const id of ids) {
            const location = findItemLocation(items, id)
            if (location) results.push(location.list[location.index] as T)
        }
        return results
    }

    async batchUpdate<T>(
        storageKey: string,
        updates: { id: string; data: any }[],
        options?: BatchUpdateAdapterOptions
    ): Promise<T[]> {
        const items = getLocalItems<any>(storageKey)
        const updatedItems: T[] = []
        let hasChanges = false

        updates.forEach(({ id, data }) => {
            const location = findItemLocation(items, id)
            if (location) {
                const updatedItem = {
                    ...location.list[location.index],
                    ...data,
                    updatedAt: Date.now()
                }
                location.list[location.index] = updatedItem
                updatedItems.push(updatedItem as T)
                hasChanges = true
            }
        })

        if (hasChanges) {
            setLocalItems(storageKey, items)
        }

        return updatedItems
    }

    async batchDelete(
        storageKey: string,
        ids: string[],
        options?: BatchDeleteAdapterOptions
    ): Promise<number> {
        const items = getLocalItems<any>(storageKey)
        let deletedCount = 0

        for (const id of ids) {
            const location = findItemLocation(items, id)
            if (location) {
                location.list.splice(location.index, 1)
                deletedCount++
            }
        }

        if (deletedCount > 0) {
            setLocalItems(storageKey, items)
        }
        return deletedCount
    }
}
