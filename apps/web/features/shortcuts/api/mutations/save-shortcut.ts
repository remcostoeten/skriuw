
import type { CustomShortcut } from '../types'
import type { KeyCombo } from '../../shortcut-definitions'
import { readOne, update, create } from '@skriuw/crud'
import { invalidateShortcutsCache } from '../queries/get-shortcuts'

const STORAGE_KEY = 'quantum-works:shortcuts:custom'

/**
 * Save or update a custom shortcut
 * Uses the generic CRUD layer for agnostic storage
 */
export async function saveShortcut(id: string, keys: KeyCombo[]): Promise<CustomShortcut> {
	try {
		// Check if shortcut already exists
		const result = await readOne<CustomShortcut>(STORAGE_KEY, id)

		if (result.success && result.data) {
			// Update existing shortcut
			const updated = await update<CustomShortcut>(STORAGE_KEY, id, {
				keys,
				customizedAt: new Date().toISOString(),
			})

			if (!updated.success || !updated.data) {
				throw new Error('Failed to update shortcut')
			}

			return updated.data
		} else {
			// Create new shortcut
			const newShortcut = await create<CustomShortcut>(STORAGE_KEY, {
				id,
				keys,
				customizedAt: new Date().toISOString(),
			})

			if (!newShortcut.success || !newShortcut.data) {
				throw new Error('Failed to create shortcut')
			}

			return newShortcut.data
		}

		// Invalidate cache when shortcut changes
		invalidateShortcutsCache()
	} catch (error) {
		throw new Error(
			`Failed to save shortcut: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
