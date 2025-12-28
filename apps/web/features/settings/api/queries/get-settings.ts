
import { readMany, invalidateForStorageKey } from '@skriuw/crud'

import { STORAGE_KEYS } from '@/lib/storage-keys'
import type { SettingsEntity } from '../types'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export function invalidateSettingsCache(): void {
	invalidateForStorageKey(STORAGE_KEYS.SETTINGS)
}

/**
 * Get all settings from storage
 */
export async function getSettings(options: { forceRefresh?: boolean } = {}): Promise<SettingsEntity | null> {
	try {
		const result = await readMany<SettingsEntity>(STORAGE_KEYS.SETTINGS, {
			cache: {
				ttl: 0, // Disable caching to prevent stale data issues
				forceRefresh: options?.forceRefresh || true, // Always refresh to ensure fresh data
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
