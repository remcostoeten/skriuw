import { readMany } from '@/lib/storage/client'

import type { Item } from '../../types'

const STORAGE_KEY = 'Skriuw_notes'
const CACHE_TTL_MS = 1000
const STALE_TTL_MS = 30000 // Consider stale after 30s, but still usable

let cachedItems: Item[] | null = null
let cacheTimestamp = 0
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

async function fetchItems(): Promise<Item[]> {
	const result = await readMany<Item>(STORAGE_KEY)
	const allItems = result.success ? normalizeResult(result.data) : []
	// Filter out soft-deleted items
	const items = filterActiveItems(allItems)

	cachedItems = items
	cacheTimestamp = Date.now()

	return items
}

/**
 * Background revalidation - fire and forget
 */
function revalidateInBackground(): void {
	if (inflightRequest) return // Already revalidating

	const request = fetchItems()
	inflightRequest = request

	request
		.catch((error) => {
			console.warn('Background revalidation failed:', error)
		})
		.finally(() => {
			if (inflightRequest === request) {
				inflightRequest = null
			}
		})
}

export function invalidateItemsCache(): void {
	cachedItems = null
	cacheTimestamp = 0
	inflightRequest = null
}

/**
 * Get items with stale-while-revalidate pattern
 * - Returns fresh cached data immediately if < CACHE_TTL_MS
 * - Returns stale cached data immediately + triggers background refresh if < STALE_TTL_MS
 * - Only waits for fetch if no cache or cache is very stale
 */
export async function getItems(options: { forceRefresh?: boolean } = {}): Promise<Item[]> {
	const now = Date.now()
	const cacheAge = now - cacheTimestamp
	const shouldBypassCache = options.forceRefresh === true

	if (!shouldBypassCache && cachedItems) {
		// Fresh cache - return immediately
		if (cacheAge < CACHE_TTL_MS) {
			return cachedItems
		}

		// Stale but usable - return immediately and revalidate in background
		if (cacheAge < STALE_TTL_MS) {
			revalidateInBackground()
			return cachedItems
		}
	}

	// No cache or force refresh - wait for fetch
	if (shouldBypassCache) {
		inflightRequest = null
	}

	// Deduplicate in-flight requests
	if (inflightRequest) {
		return inflightRequest
	}

	const request = fetchItems()
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

