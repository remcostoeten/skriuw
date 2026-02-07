import type { KeyCombo } from '../../shortcut-definitions'
import { invalidateShortcutsCache } from '../queries/get-shortcuts'
import type { CustomShortcut } from '../../types'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { readOne, update, create } from '@skriuw/crud'

/**
 * Save or update a custom shortcut
 * Uses the generic CRUD layer for agnostic storage
 */
export async function saveShortcut(id: string, keys: KeyCombo[]): Promise<CustomShortcut> {
	try {
		const result = await readOne<CustomShortcut>(STORAGE_KEYS.SHORTCUTS, id)

		if (result.success && result.data) {
			const updated = await update<CustomShortcut>(STORAGE_KEYS.SHORTCUTS, id, {
				keys,
				customizedAt: new Date().toISOString()
			})

			if (!updated.success || !updated.data) {
				throw new Error('Failed to update shortcut')
			}

			invalidateShortcutsCache()
			return updated.data
		} else {
			const newShortcut = await create<CustomShortcut>(STORAGE_KEYS.SHORTCUTS, {
				id,
				keys,
				customizedAt: new Date().toISOString()
			})

			if (!newShortcut.success || !newShortcut.data) {
				throw new Error('Failed to create shortcut')
			}

			invalidateShortcutsCache()
			return newShortcut.data
		}
	} catch (error) {
		throw new Error(
			`Failed to save shortcut: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
