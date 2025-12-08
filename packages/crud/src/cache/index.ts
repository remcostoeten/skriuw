/**
 * @fileoverview Cache module exports
 * @module @skriuw/crud/cache
 */

export {
    get,
    set,
    invalidate,
    invalidateForStorageKey,
    clear,
    getStats,
    registerRevalidation,
    isRevalidating,
    startCleanup,
    stopCleanup,
    CACHE_CONFIG,
    type CacheStats,
} from './store'

export { generateKey } from './utils'
export type { CacheEntry } from './types'
