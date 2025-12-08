import { readMany, destroy } from '@/lib/storage/client'

import type { CustomShortcut } from '../types'

const STORAGE_KEY = 'quantum-works:shortcuts:custom'

/**
 * Reset all custom shortcuts (delete all)
 * Uses the generic CRUD layer for agnostic storage
 */
export async function resetAllShortcuts(): Promise<boolean> {
	try {
		const result = await readMany<CustomShortcut>(STORAGE_KEY)

		if (result.success && result.data && result.data.length > 0) {
			// Delete all shortcuts
			await Promise.all(result.data.map((shortcut) => destroy(STORAGE_KEY, shortcut.id)))
			return true
		}

		return true
	} catch (error) {
		throw new Error(
			`Failed to reset all shortcuts: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
