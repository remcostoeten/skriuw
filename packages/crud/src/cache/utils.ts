/**
 * @fileoverview Cache utility functions
 * @module @skriuw/crud/cache/utils
 */

/**
 * Generates a deterministic cache key.
 */
export function generateKey(storageKey: string, params?: Record<string, unknown>): string {
	if (!params || Object.keys(params).length === 0) {
		return storageKey
	}

	const sortedParams = Object.entries(params)
		.filter(([, value]) => value !== undefined)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => {
			if (typeof value === 'function') {
				return `${key}=fn`
			}
			return `${key}=${JSON.stringify(value)}`
		})
		.join('&')

	return `${storageKey}:${sortedParams}`
}
