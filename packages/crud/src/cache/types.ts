/**
 * @fileoverview Cache entry type
 * @module @skriuw/crud/cache/types
 */

/**
 * Cache entry structure.
 */
export interface CacheEntry<T> {
    data: T
    cachedAt: number
    expiresAt: number
    stale: boolean
    key: string
}
