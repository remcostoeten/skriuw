
import { readMany, invalidateForStorageKey } from '@skriuw/crud'

import type { SettingsEntity } from '../types'

const STORAGE_KEY = 'skriuw:settings'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export function invalidateSettingsCache(): void {
	invalidateForStorageKey(STORAGE_KEY)
}

/**
 * Get all settings from storage
 */
export async function getSettings(options: { forceRefresh?: boolean } = {}): Promise<SettingsEntity | null> {
	try {
		const result = await readMany<SettingsEntity>(STORAGE_KEY, {
			cache: {
				ttl: CACHE_TTL_MS,
				staleWhileRevalidate: true,
				forceRefresh: options?.forceRefresh,
			},
		})

		if (!result.success || !result.data) {
			return null
		}

		const items = Array.isArray(result.data) ? result.data : []
		return items[0] ?? null
	} catch (error) {
		throw new Error(
			`Failed to get settings: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
