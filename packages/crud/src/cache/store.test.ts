import {
	get,
	set,
	invalidate,
	invalidateForStorageKey,
	clear,
	getStats,
	CACHE_CONFIG
} from './store'
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Cache Store', () => {
	beforeEach(() => {
		clear()
	})

	describe('LRU Eviction', () => {
		it('should evict least recently used when reaching max entries', () => {
			// Fill cache to max
			for (let i = 0; i < CACHE_CONFIG.maxEntries; i++) {
				set(`key-${i}`, { value: i })
			}

			expect(getStats().size).toBe(CACHE_CONFIG.maxEntries)

			// Add one more - should evict key-0
			set('new-key', { value: 'new' })

			expect(getStats().size).toBe(CACHE_CONFIG.maxEntries)
			expect(get('key-0')).toBeUndefined()
			expect(get('new-key')?.data).toEqual({ value: 'new' })
		})

		it('should update access order when getting a key', () => {
			// Fill cache to max
			for (let i = 0; i < CACHE_CONFIG.maxEntries; i++) {
				set(`key-${i}`, { value: i })
			}

			// Access key-0 to make it most recently used
			get('key-0')

			// Add new key - should evict key-1 (was least recently used after access)
			set('new-key', { value: 'new' })

			expect(get('key-0')?.data).toEqual({ value: 0 })
			expect(get('key-1')).toBeUndefined()
		})
	})

	describe('Stale Detection', () => {
		it('should mark entry as stale when approaching expiry', () => {
			const originalDateNow = Date.now
			const baseTime = 1000000

			// Set at base time
			Date.now = () => baseTime
			set('test-key', { value: 'test' }, 60000) // 60s TTL

			// Read at base time - not stale
			const fresh = get('test-key')
			expect(fresh?.stale).toBe(false)

			// Read just before stale threshold - not stale
			Date.now = () => baseTime + 60000 - CACHE_CONFIG.staleGracePeriod - 1000
			const stillFresh = get('test-key')
			expect(stillFresh?.stale).toBe(false)

			// Read after stale threshold but before expiry
			Date.now = () => baseTime + 60000 - CACHE_CONFIG.staleGracePeriod + 1000
			const stale = get('test-key')
			expect(stale?.stale).toBe(true)
			expect(stale?.data).toEqual({ value: 'test' }) // Still returns data

			// Restore
			Date.now = originalDateNow
		})

		it('should return undefined for expired entries without SWR', () => {
			const originalDateNow = Date.now
			const baseTime = 1000000

			Date.now = () => baseTime
			set('test-key', { value: 'test' }, 1000) // 1s TTL

			// After expiry, without SWR
			Date.now = () => baseTime + 2000
			const result = get('test-key', { staleWhileRevalidate: false })
			expect(result).toBeUndefined()

			// Restore
			Date.now = originalDateNow
		})

		it('should return stale data for expired entries with SWR', () => {
			const originalDateNow = Date.now
			const baseTime = 1000000

			Date.now = () => baseTime
			set('test-key', { value: 'test' }, 1000) // 1s TTL

			// After expiry, with SWR
			Date.now = () => baseTime + 2000
			const result = get('test-key', { staleWhileRevalidate: true })
			expect(result?.data).toEqual({ value: 'test' })
			expect(result?.stale).toBe(true)

			// Restore
			Date.now = originalDateNow
		})
	})

	describe('Invalidation', () => {
		it('should invalidate by exact key', () => {
			set('notes:123', { id: '123' })
			set('notes:456', { id: '456' })

			expect(get('notes:123')).toBeDefined()

			invalidate('notes:123')

			expect(get('notes:123')).toBeUndefined()
			expect(get('notes:456')).toBeDefined()
		})

		it('should invalidate all keys for a storage key', () => {
			set('notes:123', { id: '123' })
			set('notes:456', { id: '456' })
			set('folders:789', { id: '789' })

			const count = invalidateForStorageKey('notes')

			expect(count).toBe(2)
			expect(get('notes:123')).toBeUndefined()
			expect(get('notes:456')).toBeUndefined()
			expect(get('folders:789')).toBeDefined()
		})

		it('should not invalidate partial matches incorrectly', () => {
			set('notes:123', { id: '123' })
			set('notes-archive:456', { id: '456' })

			invalidateForStorageKey('notes')

			expect(get('notes:123')).toBeUndefined()
			expect(get('notes-archive:456')).toBeDefined() // Should NOT be invalidated
		})
	})

	describe('Force Refresh', () => {
		it('should return undefined when forceRefresh is true', () => {
			set('test-key', { value: 'test' })

			const withForce = get('test-key', { forceRefresh: true })
			expect(withForce).toBeUndefined()

			const withoutForce = get('test-key')
			expect(withoutForce?.data).toEqual({ value: 'test' })
		})
	})
})
