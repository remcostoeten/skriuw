import { readMany } from '@skriuw/crud'
import type { ShortcutId, KeyCombo } from '../../shortcut-definitions'
import type { CustomShortcut } from '../types'

import { STORAGE_KEYS } from '@/lib/storage-keys'
const CACHE_TTL = 60000 // 1 minute cache for shortcuts
let cachedShortcuts: Record<ShortcutId, KeyCombo[]> | null = null
let cacheTimestamp = 0

/**
 * Get all custom shortcuts as a record
 * Uses the generic CRUD layer for agnostic storage
 * Includes in-memory caching to reduce storage calls
 */
export async function getShortcuts(): Promise<Record<ShortcutId, KeyCombo[]>> {
	const now = Date.now()

	// Return cached shortcuts if still valid
	if (cachedShortcuts && now - cacheTimestamp < CACHE_TTL) {
		return cachedShortcuts
	}

	try {
		const crudResult = await readMany<CustomShortcut>(STORAGE_KEYS.SHORTCUTS)
		const result: Record<ShortcutId, KeyCombo[]> = {
			'editor-focus': [],
			'toggle-shortcuts': [],
			'create-note': [],
			'create-folder': [],
			'rename-item': [],
			'open-collection': [],
			'toggle-sidebar': [],
			'save-note': [],
			'toggle-split-view': [],
			'swap-split-panes': [],
			'cycle-split-orientation': [],
			'split.toggle': [],
			'split.swap': [],
			'split.orientation.next': [],
			'split.focus.left': [],
			'split.focus.right': [],
			'split.close': [],
			'split.vertical': [],
			'split.horizontal': [],
			'toggle-panes': [],
			'delete-item': [],
			'pin-item': [],
			'open-settings': [],
			'toggle-theme': [],
		}

		if (crudResult.success && crudResult.data) {
			for (const shortcut of crudResult.data) {
				result[shortcut.id as ShortcutId] = shortcut.keys
			}
		}

		// Cache the result
		cachedShortcuts = result
		cacheTimestamp = now

		return result
	} catch (error) {
		throw new Error(
			`Failed to get shortcuts: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

export function invalidateShortcutsCache(): void {
	cachedShortcuts = null
	cacheTimestamp = 0
}
