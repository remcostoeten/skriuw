import { readMany, invalidateForStorageKey } from '@skriuw/crud'

import { STORAGE_KEYS } from '@/lib/storage-keys'
import type { Item } from '../../types'

const CACHE_TTL_MS = 60000

function normalizeResult(result: unknown): Item[] {
	return Array.isArray(result) ? (result as Item[]) : []
}

/**
 * Filter out deleted items recursively
 */
function filterActiveItems(items: Item[]): Item[] {
	return items
		.filter((item) => !item.deletedAt)
		.map((item) => {
			if (item.type === 'folder') {
				return { ...item, children: filterActiveItems(item.children) }
			}
			return item
		})
}

async function fetchItems(options?: {
	forceRefresh?: boolean
}): Promise<Item[]> {
	const result = await readMany<Item>(STORAGE_KEYS.NOTES, {
		cache: {
			ttl: CACHE_TTL_MS,
			forceRefresh: options?.forceRefresh
		}
	})

	const allItems = result.success ? normalizeResult(result.data) : []
	// Filter out soft-deleted items
	return filterActiveItems(allItems)
}

/**
 * Invalidate the items cache
 * Call this after mutations that affect the items list
 */
export function invalidateItemsCache(): void {
	invalidateForStorageKey(STORAGE_KEYS.NOTES)
}

/**
 * Get items using CRUD's built-in caching with stale-while-revalidate
 */
export async function getItems(
	options: { forceRefresh?: boolean } = {}
): Promise<Item[]> {
	try {
		return await fetchItems(options)
	} catch (error) {
		throw new Error(
			`Failed to get items: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
