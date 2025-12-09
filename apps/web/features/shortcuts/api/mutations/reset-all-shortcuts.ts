import { readMany, destroy } from '@skriuw/crud'

import type { CustomShortcut } from '../types'

import { STORAGE_KEYS } from '@/lib/storage-keys'

/**
 * Reset all custom shortcuts (delete all)
 * Uses the generic CRUD layer for agnostic storage
 */
export async function resetAllShortcuts(): Promise<boolean> {
	try {
		const result = await readMany<CustomShortcut>(STORAGE_KEYS.SHORTCUTS)

		if (result.success && result.data && result.data.length > 0) {
			// Delete all shortcuts
			await Promise.all(result.data.map((shortcut) => destroy(STORAGE_KEYS.SHORTCUTS, shortcut.id)))
			return true
		}

		return true
	} catch (error) {
		throw new Error(
			`Failed to reset all shortcuts: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
