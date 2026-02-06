import type { ShortcutId, KeyCombo } from '../../shortcut-definitions'
import type { CustomShortcut } from '../types'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { readMany, invalidateForStorageKey } from '@skriuw/crud'

const CACHE_TTL_MS = 60000 // 1 minute cache for shortcuts

export function invalidateShortcutsCache(): void {
	invalidateForStorageKey(STORAGE_KEYS.SHORTCUTS)
}

/**
 * Get all custom shortcuts as a record
 * Uses generic CRUD layer for agnostic storage
 */
export async function getShortcuts(): Promise<Record<ShortcutId, KeyCombo[]>> {
	try {
		const crudResult = await readMany<CustomShortcut>(STORAGE_KEYS.SHORTCUTS, {
			cache: {
				ttl: CACHE_TTL_MS
			}
		})

		const result: Record<ShortcutId, KeyCombo[]> = {
			'editor-focus': [],
			'toggle-shortcuts': [],
			'toggle-sidebar': [],
			'open-settings': [],
			'open-collection': [],
			'create-note': [],
			'create-folder': [],
			'rename-item': [],
			'delete-item': [],
			'pin-item': [],
			'split.toggle': [],
			'split.swap': [],
			'split.orientation.next': [],
			'split.vertical': [],
			'split.horizontal': [],
			'split.focus.left': [],
			'split.focus.right': [],
			'split.close': [],
			'split.cycle': [],
			'command-executor': [],
			'toggle-theme': []
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
