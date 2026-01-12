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

// Base interface for items in storage
interface StorageItem {
    id: string;
    parentFolderId?: string;
    children?: StorageItem[];
    [key: string]: any; // Allow other properties but enforce structure
}


function ensurePreseededData<T extends StorageItem>(storageKey: string, items: T[]): T[] {
    if (items.length === 0 && PRESEEDED_KEYS.includes(storageKey) && !hasPreseededItems()) {
        try {
            const seedItems = generatePreseededItems('guest')
            const treeItems: StorageItem[] = []

            seedItems.forEach((item: any) => {
                const typedItem = item as StorageItem
                if (typedItem.type === 'folder' && !Array.isArray(typedItem.children)) {
                    typedItem.children = []
                }

                if (typedItem.parentFolderId) {
                    const location = findItemLocation(treeItems, typedItem.parentFolderId)
                    if (location) {
                        const parent = location.list[location.index]
                        if (!Array.isArray(parent.children)) parent.children = []
                        parent.children!.push(typedItem)
                    } else {
                        treeItems.push(typedItem)
                    }
                } else {
                    treeItems.push(typedItem)
                }
            })

            setLocalItems(storageKey, treeItems)
            return treeItems as T[]
        } catch (error) {
            console.error('Failed to seed guest data:', error)
            return items
        } finally {
            markPreseededItems()
        }
    }
    return items
}

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
        // Simple cycle detection before stringifying
        const seen = new WeakSet()
        const safeStringify = (key: string, value: any) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular]'
                }
                seen.add(value)
            }
            return value
        }
        window.localStorage.setItem(key, JSON.stringify(items, safeStringify))
    } catch (e) {
        console.warn(`Error writing to localStorage key "${key}":`, e)
    }
}

// Recursive helper to find item location in tree
function findItemLocation(
    items: StorageItem[],
    id: string,
    visited = new Set<string>() // Prevent infinite recursion
): { list: StorageItem[]; index: number } | null {
    const index = items.findIndex((i) => i.id === id)
    if (index !== -1) return { list: items, index }

    for (const item of items) {
        // Circular reference check
        if (!item.id || visited.has(item.id)) continue;
        visited.add(item.id);

        if (Array.isArray(item.children)) {
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
        const items = getLocalItems<StorageItem>(storageKey)
        const timestamp = Date.now()
        const newItem: StorageItem = {
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
                if (!Array.isArray(parent.children)) parent.children = []
                parent.children!.push(newItem)
            } else {
                // Parent not found, fallback to root
                items.push(newItem)
            }
        } else {
            items.push(newItem)
        }

        setLocalItems(storageKey, items)
        return newItem as unknown as T
    }

    async read<T>(
        storageKey: string,
        options?: ReadAdapterOptions
    ): Promise<T[] | T | undefined> {
        let items = getLocalItems<StorageItem>(storageKey)

        if (options?.getById) {
            items = ensurePreseededData(storageKey, items)
            const location = findItemLocation(items, options.getById)
            return (location ? location.list[location.index] : undefined) as unknown as T | undefined
        }

        return ensurePreseededData(storageKey, items) as unknown as T[]
    }

    async readOne<T>(
        storageKey: string,
        id: string,
        options?: ReadAdapterOptions
    ): Promise<T | null> {
        const items = getLocalItems<StorageItem>(storageKey)
        const location = findItemLocation(items, id)
        return (location ? location.list[location.index] : null) as unknown as T | null
    }

    async readMany<T>(
        storageKey: string,
        options?: BatchReadAdapterOptions
    ): Promise<T[]> {
        const items = getLocalItems<StorageItem>(storageKey)
        return ensurePreseededData(storageKey, items) as unknown as T[]
    }

    async update<T>(
        storageKey: string,
        id: string,
        data: any,
        options?: UpdateAdapterOptions
    ): Promise<T | undefined> {
        const items = getLocalItems<StorageItem>(storageKey)
        const location = findItemLocation(items, id)
        if (!location) return undefined

        const currentItem = location.list[location.index]
        
        // Check if moving to a different folder
        const isMoving = data.parentFolderId !== undefined && data.parentFolderId !== currentItem.parentFolderId

        if (isMoving) {
            // 1. Remove from old location
            location.list.splice(location.index, 1)

            // 2. Update item data
            const updatedItem: StorageItem = {
                ...currentItem,
                ...data,
                updatedAt: Date.now()
            }

            // 3. Add to new location
            if (updatedItem.parentFolderId) {
                // Find new parent
                // Note: items is the root array, which we modified in step 1. 
                // Since we removed the item, we don't risk finding it as its own parent (checking visited prevents bad cycles in search)
                const parentLoc = findItemLocation(items, updatedItem.parentFolderId)
                
                if (parentLoc) {
                    const parent = parentLoc.list[parentLoc.index]
                    if (!Array.isArray(parent.children)) parent.children = []
                    parent.children!.push(updatedItem)
                } else {
                    // Parent not found, fallback to root
                    items.push(updatedItem)
                }
            } else {
                // Moving to root
                items.push(updatedItem)
            }

            setLocalItems(storageKey, items)
            return updatedItem as unknown as T
        } else {
            // Simple update in place
            const updatedItem: StorageItem = {
                ...currentItem,
                ...data,
                updatedAt: Date.now()
            }
            location.list[location.index] = updatedItem
            setLocalItems(storageKey, items)
            return updatedItem as unknown as T
        }
    }

    async delete(
        storageKey: string,
        id: string,
        options?: DeleteAdapterOptions
    ): Promise<boolean> {
        const items = getLocalItems<StorageItem>(storageKey)
        const location = findItemLocation(items, id)
        if (!location) return false

        location.list.splice(location.index, 1)
        setLocalItems(storageKey, items)
        return true
    }

    async batchCreate<T>(
        storageKey: string,
        itemsToCreate: any[],
        options?: BatchCreateAdapterOptions
    ): Promise<T[]> {
        const existingItems = getLocalItems<StorageItem>(storageKey)
        const timestamp = Date.now()

        const newItems: StorageItem[] = itemsToCreate.map(item => ({
            ...item,
            id: item.id || `local-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: timestamp,
            updatedAt: timestamp
        }))

        newItems.forEach(newItem => {
            if (newItem.parentFolderId) {
                const location = findItemLocation(existingItems, newItem.parentFolderId)
                if (location) {
                    const parent = location.list[location.index]
                    if (!Array.isArray(parent.children)) parent.children = []
                    parent.children!.push(newItem)
                } else {
                    existingItems.push(newItem)
                }
            } else {
                existingItems.push(newItem)
            }
        })

        setLocalItems(storageKey, existingItems)
        return newItems as unknown as T[]
    }

    async batchRead<T>(
        storageKey: string,
        ids: string[],
        options?: BatchReadAdapterOptions
    ): Promise<T[]> {
        const items = getLocalItems<StorageItem>(storageKey)
        const results: StorageItem[] = []
        for (const id of ids) {
            const location = findItemLocation(items, id)
            if (location) results.push(location.list[location.index])
        }
        return results as unknown as T[]
    }

    async batchUpdate<T>(
        storageKey: string,
        updates: { id: string; data: any }[],
        options?: BatchUpdateAdapterOptions
    ): Promise<T[]> {
        const items = getLocalItems<StorageItem>(storageKey)
        const updatedItems: StorageItem[] = []
        let hasChanges = false

        for (const { id, data } of updates) {
            const location = findItemLocation(items, id)
            if (location) {
                const currentItem = location.list[location.index]
                const isMoving = data.parentFolderId !== undefined && data.parentFolderId !== currentItem.parentFolderId

                if (isMoving) {
                     // 1. Remove from old location
                    location.list.splice(location.index, 1)

                    // 2. Update item data
                    const updatedItem: StorageItem = {
                        ...currentItem,
                        ...data,
                        updatedAt: Date.now()
                    }

                    // 3. Add to new location
                    if (updatedItem.parentFolderId) {
                         const parentLoc = findItemLocation(items, updatedItem.parentFolderId)
                         if (parentLoc) {
                             const parent = parentLoc.list[parentLoc.index]
                             if (!Array.isArray(parent.children)) parent.children = []
                             parent.children!.push(updatedItem)
                         } else {
                             items.push(updatedItem)
                         }
                    } else {
                        items.push(updatedItem)
                    }
                    updatedItems.push(updatedItem)
                } else {
                    const updatedItem: StorageItem = {
                        ...currentItem,
                        ...data,
                        updatedAt: Date.now()
                    }
                    location.list[location.index] = updatedItem
                    updatedItems.push(updatedItem)
                }
                hasChanges = true
            }
        }

        if (hasChanges) {
            setLocalItems(storageKey, items)
        }

        return updatedItems as unknown as T[]
    }

    async batchDelete(
        storageKey: string,
        ids: string[],
        options?: BatchDeleteAdapterOptions
    ): Promise<number> {
        const items = getLocalItems<StorageItem>(storageKey)
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
