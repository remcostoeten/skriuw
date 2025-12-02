import { read } from '@skriuw/storage/crud/read'

import type { Item } from '../../types'

const STORAGE_KEY = 'Skriuw_notes'
const CACHE_TTL_MS = 1000

let cachedItems: Item[] | null = null
let cacheTimestamp = 0
let inflightRequest: Promise<Item[]> | null = null

function normalizeResult(result: unknown): Item[] {
	return Array.isArray(result) ? (result as Item[]) : []
}

async function fetchItems(): Promise<Item[]> {
	const readFn = read
	const raw = await readFn(STORAGE_KEY, { getAll: true })
	const items = normalizeResult(raw)

	cachedItems = items
	cacheTimestamp = Date.now()

	return items
}

export function invalidateItemsCache(): void {
	cachedItems = null
	cacheTimestamp = 0
	inflightRequest = null
}

export async function getItems(options: { forceRefresh?: boolean } = {}): Promise<Item[]> {
	const now = Date.now()
	const shouldBypassCache = options.forceRefresh === true

	if (!shouldBypassCache) {
		if (cachedItems && now - cacheTimestamp < CACHE_TTL_MS) {
			return cachedItems
		}

		if (inflightRequest) {
			return inflightRequest
		}
	} else {
		inflightRequest = null
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
