/**
 * @fileoverview Local Storage Adapter for Zero-Session Users
 * @description Implements localStorage-based storage for zero-session users
 * Allows demo editing without backend persistence
 */

// Define types locally since crud package has issues
type BaseEntity = {
	id: string
} & {
	createdAt: number
	updatedAt: number
	deletedAt?: number
}

interface ReadAdapterOptions {
	cache?: {
		ttl?: number
		staleWhileRevalidate?: boolean
		forceRefresh?: boolean
	}
	getById?: string
	userId?: string
}

interface CreateAdapterOptions {
	validate?: boolean
	optimistic?: boolean
	userId?: string
}

interface UpdateAdapterOptions {
	validate?: boolean
	optimistic?: boolean
	userId?: string
}

interface DeleteAdapterOptions {
	optimistic?: boolean
	userId?: string
}

interface BatchReadAdapterOptions {
	cache?: {
		ttl?: number
		staleWhileRevalidate?: boolean
		forceRefresh?: boolean
	}
	userId?: string
	getById?: string
}

interface BatchCreateAdapterOptions {
	validate?: boolean
	optimistic?: boolean
	userId?: string
}

interface BatchUpdateAdapterOptions {
	validate?: boolean
	optimistic?: boolean
	userId?: string
}

interface BatchDeleteAdapterOptions {
	optimistic?: boolean
	userId?: string
}

interface StorageAdapter {
	name: string
	read<T>(key: string, options?: BatchReadAdapterOptions): Promise<T[] | T | undefined>
	readOne<T>(key: string, id: string, options?: ReadAdapterOptions): Promise<T | null>
	readMany<T>(key: string, options?: BatchReadAdapterOptions): Promise<T[]>
	create<T>(key: string, data: any, options?: CreateAdapterOptions): Promise<T>
	update<T>(key: string, id: string, data: any, options?: UpdateAdapterOptions): Promise<T | undefined>
	delete(key: string, id: string, options?: DeleteAdapterOptions): Promise<boolean>
	batchCreate<T>(key: string, items: any[], options?: BatchCreateAdapterOptions): Promise<T[]>
	batchRead<T>(key: string, ids: string[], options?: BatchReadAdapterOptions): Promise<T[]>
	batchUpdate<T>(key: string, updates: { id: string; data: any }[], options?: BatchUpdateAdapterOptions): Promise<T[]>
	batchDelete(key: string, ids: string[], options?: BatchDeleteAdapterOptions): Promise<number>
}

import { generateId } from '@skriuw/shared'
import { ZERO_SESSION_PREFIX } from '../../constants'

/**
 * Gets the full storage key with zero-session prefix
 */
function getStorageKey(key: string): string {
	return `${ZERO_SESSION_PREFIX}${key}`
	return `${ZERO_SESSION_PREFIX}${key}`
}

/**
 * Gets all items from localStorage for a given key
 */
function getAllFromStorage<T>(key: string): T[] {
	if (typeof window === 'undefined') return []

	const storageKey = getStorageKey(key)
	const data = localStorage.getItem(storageKey)
	if (!data) return []

	try {
		const parsed = JSON.parse(data)
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

/**
 * Saves all items to localStorage for a given key
 */
function saveAllToStorage<T>(key: string, items: T[]): void {
	if (typeof window === 'undefined') return

	const storageKey = getStorageKey(key)
	localStorage.setItem(storageKey, JSON.stringify(items))
}

/**
 * Finds an item by ID in localStorage
 */
function findById<T extends BaseEntity>(items: T[], id: string): T | undefined {
	return items.find((item) => item.id === id)
}

/**
 * Removes an item by ID and returns the updated array
 */
function removeById<T extends BaseEntity>(items: T[], id: string): T[] {
	return items.filter((item) => item.id !== id)
}

/**
 * Updates an item by ID and returns the updated array
 */
function updateById<T extends BaseEntity>(
	items: T[],
	id: string,
	updates: Partial<T>
): T[] {
	return items.map((item) =>
		item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item
	)
}

/**
 * Creates a localStorage adapter for zero-session users
 * This allows demo editing without backend persistence
 */
export function createLocalStorageAdapter(): StorageAdapter {
	return {
		name: 'local-storage',
		async create<T>(
			storageKey: string,
			data: any,
			options?: CreateAdapterOptions
		): Promise<T> {
			const now = Date.now()
			const newItem: T = {
				...data,
				id: data.id || generateId(),
				createdAt: now,
				updatedAt: now
			} as T

			const items = getAllFromStorage<T>(storageKey)
			items.push(newItem)
			saveAllToStorage(storageKey, items)

			return newItem
		},

		async read<T>(
			storageKey: string,
			options?: BatchReadAdapterOptions
		): Promise<T[] | T | undefined> {
			const items = getAllFromStorage<T>(storageKey)

			if (options?.getById) {
				return findById(items as BaseEntity[], options.getById) as T | undefined
			}

			return items
		},

		async update<T>(
			storageKey: string,
			id: string,
			data: any,
			options?: UpdateAdapterOptions
		): Promise<T | undefined> {
			const items = getAllFromStorage<T>(storageKey)
			const existing = findById(items as BaseEntity[], id)

			if (!existing) return undefined

			const updated = updateById(items as BaseEntity[], id, data)
			saveAllToStorage(storageKey, updated)

			return findById(updated, id) as T | undefined
		},

		async delete(storageKey: string, id: string): Promise<boolean> {
			const items = getAllFromStorage<BaseEntity>(storageKey)
			const existing = findById(items, id)

			if (!existing) return false

			const updated = removeById(items, id)
			saveAllToStorage(storageKey, updated)

			return true
		},
		readOne: async <T>(storageKey: string, id: string, options?: ReadAdapterOptions): Promise<T | null> => {
			const items = getAllFromStorage<T>(storageKey)
			return findById(items as BaseEntity[], id) as T | null
		},
		readMany: async <T>(storageKey: string, options?: BatchReadAdapterOptions): Promise<T[]> => {
			return getAllFromStorage<T>(storageKey)
		},
		batchCreate: async <T>(storageKey: string, items: any[], options?: BatchCreateAdapterOptions): Promise<T[]> => {
			const now = Date.now()
			const newItems = items.map(item => ({
				...item,
				id: item.id || generateId(),
				createdAt: now,
				updatedAt: now
			}))
			const existingItems = getAllFromStorage<T>(storageKey)
			const allItems = [...existingItems, ...newItems]
			saveAllToStorage(storageKey, allItems)
			return newItems
		},
		batchRead: async <T>(storageKey: string, ids: string[], options?: BatchReadAdapterOptions): Promise<T[]> => {
			const items = getAllFromStorage<T>(storageKey)
			return ids.map(id => findById(items as BaseEntity[], id)).filter(Boolean) as T[]
		},
		batchUpdate: async <T>(storageKey: string, updates: { id: string; data: any }[], options?: BatchUpdateAdapterOptions): Promise<T[]> => {
			const items = getAllFromStorage<T>(storageKey)
			let updatedItems = items as BaseEntity[]
			for (const update of updates) {
				updatedItems = updateById(updatedItems, update.id, update.data)
			}
			saveAllToStorage(storageKey, updatedItems)
			return updates.map(update => findById(updatedItems, update.id)).filter(Boolean) as T[]
		},
		batchDelete: async (storageKey: string, ids: string[], options?: BatchDeleteAdapterOptions): Promise<number> => {
			const items = getAllFromStorage<BaseEntity>(storageKey)
			let remainingItems = items
			let deletedCount = 0
			for (const id of ids) {
				const existing = findById(remainingItems, id)
				if (existing) {
					remainingItems = removeById(remainingItems, id)
					deletedCount++
				}
			}
			saveAllToStorage(storageKey, remainingItems)
			return deletedCount
		}
	}
}
