/**
 * @fileoverview Cache entry type
 * @module @skriuw/crud/cache/types
 */

/**
 * Cache entry structure.
 */
export type CacheEntry<T> = {
	data: T
	cachedAt: number
	expiresAt: number
	stale: boolean
	key: string
}
