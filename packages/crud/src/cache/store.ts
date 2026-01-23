import type { CacheEntry } from "./types";

/** Default cache configuration */
export const CACHE_CONFIG = {
	defaultTtl: 60_000,
	maxEntries: 1000,
	cleanupInterval: 300_000,
	staleGracePeriod: 30_000
} as const

/** Internal cache storage */
const cache = new Map<string, CacheEntry<unknown>>()

/** LRU access order */
const accessOrder: string[] = []

/** Cleanup interval reference */
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null

/** Pending revalidations */
const pendingRevalidations = new Map<string, Promise<void>>()

/**
 * Gets a cached value.
 */
export function get<T>(
	key: string,
	options?: { forceRefresh?: boolean; staleWhileRevalidate?: boolean }
): { data: T; stale: boolean } | undefined {
	const entry = cache.get(key) as CacheEntry<T> | undefined
	if (!entry) return undefined

	const now = Date.now()
	const isExpired = now > entry.expiresAt
	const isStale = now > entry.expiresAt - CACHE_CONFIG.staleGracePeriod

	if (options?.forceRefresh) return undefined

	if (isExpired && !options?.staleWhileRevalidate) {
		cache.delete(key)
		removeFromAccessOrder(key)
		return undefined
	}

	updateAccessOrder(key)
	return { data: entry.data, stale: isStale || isExpired }
}

/**
 * Sets a value in cache.
 */
export function set<T>(key: string, data: T, ttl?: number): void {
	while (cache.size >= CACHE_CONFIG.maxEntries) {
		evictLeastRecentlyUsed()
	}

	const now = Date.now()
	cache.set(key, {
		data,
		cachedAt: now,
		expiresAt: now + (ttl ?? CACHE_CONFIG.defaultTtl),
		stale: false,
		key
	})
	updateAccessOrder(key)
}

/**
 * Invalidates entries matching pattern.
 */
export function invalidate(pattern: string | RegExp): number {
	let count = 0
	const regex =
		typeof pattern === 'string'
			? new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
			: pattern

	for (const key of Array.from(cache.keys())) {
		if (regex.test(key)) {
			cache.delete(key)
			removeFromAccessOrder(key)
			count++
		}
	}
	return count
}

/**
 * Invalidates all entries for a storage key.
 */
export function invalidateForStorageKey(storageKey: string): number {
	return invalidate(new RegExp(`^${storageKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(:|$)`))
}

/**
 * Clears entire cache.
 */
export function clear(): void {
	cache.clear()
	accessOrder.length = 0
	pendingRevalidations.clear()
}

/**
 * Gets cache statistics.
 */
export function getStats(): CacheStats {
	const now = Date.now()
	let staleCount = 0
	let expiredCount = 0

	for (const entry of Array.from(cache.values())) {
		if (now > entry.expiresAt) expiredCount++
		else if (now > entry.expiresAt - CACHE_CONFIG.staleGracePeriod) staleCount++
	}

	return {
		size: cache.size,
		maxSize: CACHE_CONFIG.maxEntries,
		staleEntries: staleCount,
		expiredEntries: expiredCount
	}
}

/**
 * Registers a revalidation promise.
 */
export function registerRevalidation(key: string, promise: Promise<void>): void {
	pendingRevalidations.set(key, promise)
	promise.finally(() => pendingRevalidations.delete(key))
}

/**
 * Checks if key is being revalidated.
 */
export function isRevalidating(key: string): boolean {
	return pendingRevalidations.has(key)
}

/**
 * Starts automatic cleanup.
 */
export function startCleanup(): void {
	if (cleanupIntervalId) return

	cleanupIntervalId = setInterval(() => {
		const now = Date.now()
		for (const [key, entry] of Array.from(cache.entries())) {
			if (now > entry.expiresAt + CACHE_CONFIG.staleGracePeriod) {
				cache.delete(key)
				removeFromAccessOrder(key)
			}
		}
	}, CACHE_CONFIG.cleanupInterval)
}

/**
 * Stops automatic cleanup.
 */
export function stopCleanup(): void {
	if (cleanupIntervalId) {
		clearInterval(cleanupIntervalId)
		cleanupIntervalId = null
	}
}

// Internal helpers
function updateAccessOrder(key: string): void {
	const idx = accessOrder.indexOf(key)
	if (idx !== -1) accessOrder.splice(idx, 1)
	accessOrder.push(key)
}

function removeFromAccessOrder(key: string): void {
	const idx = accessOrder.indexOf(key)
	if (idx !== -1) accessOrder.splice(idx, 1)
}

function evictLeastRecentlyUsed(): void {
	const oldest = accessOrder.shift()
	if (oldest) cache.delete(oldest)
}

// Types
export type CacheStats = {
	size: number
	maxSize: number
	staleEntries: number
	expiredEntries: number
}
