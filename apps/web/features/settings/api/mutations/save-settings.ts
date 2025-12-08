import { create, update, readOne } from '@/lib/storage/client'

import type { SettingsEntity } from '../types'

const STORAGE_KEY = 'app:settings'

export async function saveSettings(settings: Record<string, any>): Promise<void> {
	try {
		const result = await readOne<SettingsEntity>(STORAGE_KEY, 'app-settings')

		if (result.success && result.data) {
			// Update existing
			await update<SettingsEntity>(STORAGE_KEY, 'app-settings', {
				settings,
			})
		} else {
			// Create new
			await create<SettingsEntity>(STORAGE_KEY, {
				id: 'app-settings',
				settings,
			})
		}
	} catch (error) {
		throw new Error(
			`Failed to save settings: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
