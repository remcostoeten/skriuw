
import { readMany } from '@skriuw/crud'
import type { ShortcutId, KeyCombo } from '../../shortcut-definitions'
import type { CustomShortcut } from '../types'

const STORAGE_KEY = 'skriuw:shortcuts:custom'

/**
 * Get all custom shortcuts as a record
 * Uses the generic CRUD layer for agnostic storage
 */
export async function getShortcuts(): Promise<Record<ShortcutId, KeyCombo[]>> {
	try {
		const crudResult = await readMany<CustomShortcut>(STORAGE_KEY)
		const result: Record<ShortcutId, KeyCombo[]> = {
			'editor-focus': [],
			'toggle-shortcuts': [],
			'create-note': [],
			'create-folder': [],
			'rename-item': [],
			'open-collection': [],
			'toggle-sidebar': [],
			'save-note': [],
			'search-notes': [],
			'delete-item': [],
			'open-settings': [],
			'toggle-theme': [],
		}

		if (crudResult.success && crudResult.data) {
			for (const shortcut of crudResult.data) {
				result[shortcut.id as ShortcutId] = shortcut.keys
			}
		}

		return result
	} catch (error) {
		throw new Error(
			`Failed to get shortcuts: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
