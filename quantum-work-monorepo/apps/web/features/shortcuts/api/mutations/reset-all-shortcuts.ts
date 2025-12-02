import { read, destroy } from '@skriuw/storage/crud'

import type { CustomShortcut } from '../types'

const STORAGE_KEY = 'quantum-works:shortcuts:custom'

/**
 * Reset all custom shortcuts (delete all)
 * Uses the generic CRUD layer for agnostic storage
 */
export async function resetAllShortcuts(): Promise<boolean> {
	try {
		const shortcuts = await read<CustomShortcut>(STORAGE_KEY)

		if (Array.isArray(shortcuts)) {
			// Delete all shortcuts
			await Promise.all(shortcuts.map((shortcut) => destroy(STORAGE_KEY, shortcut.id)))
			return true
		}

		return true
	} catch (error) {
		throw new Error(
			`Failed to reset all shortcuts: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
