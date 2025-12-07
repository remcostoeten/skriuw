import { readOne } from '@/lib/storage/client'

import type { SettingsEntity } from '../types'

const STORAGE_KEY = 'app:settings'

export async function getSettings(): Promise<Record<string, any> | null> {
	try {
		const result = await readOne<SettingsEntity>(STORAGE_KEY, 'app-settings')

		if (result.success && result.data && 'settings' in result.data) {
			return (result.data as any).settings
		}

		return null
	} catch (error) {
		console.error('Failed to get settings:', error)
		return null
	}
}
