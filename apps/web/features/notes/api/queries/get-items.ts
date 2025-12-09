import { readMany, invalidateForStorageKey } from '@skriuw/crud'

import { STORAGE_KEYS } from '@/lib/storage-keys'
import type { Item } from '../../types'

const CACHE_TTL_MS = 60000

let inflightRequest: Promise<Item[]> | null = null

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

async function fetchItems(options?: { forceRefresh?: boolean }): Promise<Item[]> {
	const result = await readMany<Item>(STORAGE_KEYS.NOTES, {
		cache: {
			ttl: CACHE_TTL_MS,
			staleWhileRevalidate: true,
			forceRefresh: options?.forceRefresh,
		},
	})

	const allItems = result.success ? normalizeResult(result.data) : []
	// Filter out soft-deleted items
	return filterActiveItems(allItems)
}

export function invalidateItemsCache(): void {
	inflightRequest = null
	invalidateForStorageKey(STORAGE_KEYS.NOTES)
}

/**
 * Get items using @skriuw/crud's built-in caching and stale-while-revalidate
 */
export async function getItems(options: { forceRefresh?: boolean } = {}): Promise<Item[]> {
	if (options.forceRefresh) {
		inflightRequest = null
	}

	if (inflightRequest) {
		return inflightRequest
	}

	const request = fetchItems(options)
	inflightRequest = request

	try {
		return await request
	} catch (error) {
		throw new Error(
			`Failed to get items: ${error instanceof Error ? error.message : String(error)}`
		)
	} finally {
		if (inflightRequest === request) {
			inflightRequest = null
		}
	}
}

