import { read } from '@skriuw/storage/crud'

import type { ShortcutId, KeyCombo } from '../../shortcut-definitions'
import type { CustomShortcut } from '../types'

const STORAGE_KEY = 'quantum-works:shortcuts:custom'

/**
 * Get all custom shortcuts as a record
 * Uses the generic CRUD layer for agnostic storage
 */
export async function getShortcuts(): Promise<Record<ShortcutId, KeyCombo[]>> {
	try {
		const shortcuts = await read<CustomShortcut>(STORAGE_KEY)
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

		if (Array.isArray(shortcuts)) {
			for (const shortcut of shortcuts) {
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
