import { create, update, readOne, invalidateForStorageKey } from '@skriuw/crud'

import { STORAGE_KEYS, DEFAULT_IDS } from '@/lib/storage-keys'
import type { SettingsEntity } from '../types'

export async function saveSettings(
	settings: Record<string, any>
): Promise<void> {
	try {
		const result = await readOne<SettingsEntity>(
			STORAGE_KEYS.SETTINGS,
			DEFAULT_IDS.SETTINGS
		)

		if (result.success && result.data) {
			// Update existing
			await update<SettingsEntity>(
				STORAGE_KEYS.SETTINGS,
				DEFAULT_IDS.SETTINGS,
				{
					settings
				}
			)
		} else {
			// Create new
			await create<SettingsEntity>(STORAGE_KEYS.SETTINGS, {
				id: DEFAULT_IDS.SETTINGS,
				settings
			})
		}

		invalidateForStorageKey(STORAGE_KEYS.SETTINGS)
	} catch (error) {
		throw new Error(
			`Failed to save settings: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
