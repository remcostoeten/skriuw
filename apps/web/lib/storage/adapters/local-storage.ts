/**
 * @fileoverview Local Storage Adapter for Zero-Session Users
 * @description Implements localStorage-based storage for zero-session users
 * Allows demo editing without backend persistence
 */

import type {
	StorageAdapter,
	ReadAdapterOptions,
	CreateAdapterOptions,
	UpdateAdapterOptions,
	DeleteAdapterOptions,
	BaseEntity
} from '@skriuw/crud'
import { generateId } from '@skriuw/shared'

const ZERO_SESSION_PREFIX = 'zero_session:'

/**
 * Gets the full storage key with zero-session prefix
 */
function getStorageKey(key: string): string {
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
		async create<T extends BaseEntity>(
			storageKey: string,
			data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>
		): Promise<T> {
			const now = Date.now()
			const newItem: T = {
				...(data as any),
				id: (data as any).id || generateId(),
				createdAt: now,
				updatedAt: now
			} as T

			const items = getAllFromStorage<T>(storageKey)
			items.push(newItem)
			saveAllToStorage(storageKey, items)

			return newItem
		},

		async read<T extends BaseEntity>(
			storageKey: string,
			options?: ReadAdapterOptions
		): Promise<T[] | T | undefined> {
			const items = getAllFromStorage<T>(storageKey)

			if (options?.getById) {
				return findById(items, options.getById)
			}

			return items
		},

		async update<T extends BaseEntity>(
			storageKey: string,
			id: string,
			data: Partial<T>
		): Promise<T | undefined> {
			const items = getAllFromStorage<T>(storageKey)
			const existing = findById(items, id)

			if (!existing) return undefined

			const updated = updateById(items, id, data)
			saveAllToStorage(storageKey, updated)

			return findById(updated, id)
		},

		async delete(storageKey: string, id: string): Promise<boolean> {
			const items = getAllFromStorage<BaseEntity>(storageKey)
			const existing = findById(items, id)

			if (!existing) return false

			const updated = removeById(items, id)
			saveAllToStorage(storageKey, updated)

			return true
		}
	}
}
