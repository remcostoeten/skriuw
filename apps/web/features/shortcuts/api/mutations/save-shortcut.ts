
import type { CustomShortcut } from '../types'
import type { KeyCombo } from '../../shortcut-definitions'
import { readOne, update, create } from '@skriuw/crud'
import { invalidateShortcutsCache } from '../queries/get-shortcuts'

import { STORAGE_KEYS } from '@/lib/storage-keys'

/**
 * Save or update a custom shortcut
 * Uses the generic CRUD layer for agnostic storage
 */
export async function saveShortcut(id: string, keys: KeyCombo[]): Promise<CustomShortcut> {
	try {
		// Check if shortcut already exists
		const result = await readOne<CustomShortcut>(STORAGE_KEYS.SHORTCUTS, id)

		if (result.success && result.data) {
			// Update existing shortcut
			const updated = await update<CustomShortcut>(STORAGE_KEYS.SHORTCUTS, id, {
				keys,
				customizedAt: new Date().toISOString(),
			})

			if (!updated.success || !updated.data) {
				throw new Error('Failed to update shortcut')
			}

			// Invalidate cache when shortcut changes
			invalidateShortcutsCache()
			return updated.data
		} else {
			// Create new shortcut
			const newShortcut = await create<CustomShortcut>(STORAGE_KEYS.SHORTCUTS, {
				id,
				keys,
				customizedAt: new Date().toISOString(),
			})

			if (!newShortcut.success || !newShortcut.data) {
				throw new Error('Failed to create shortcut')
			}

			// Invalidate cache when shortcut changes
			invalidateShortcutsCache()
			return newShortcut.data
		}
	} catch (error) {
		throw new Error(
			`Failed to save shortcut: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
