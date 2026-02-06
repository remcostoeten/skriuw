import type { ShortcutId } from '../../shortcut-definitions'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { destroy } from '@skriuw/crud'

/**
 * Reset a custom shortcut (delete it)
 * Uses the generic CRUD layer for agnostic storage
 */
export async function resetShortcut(id: ShortcutId): Promise<boolean> {
	try {
		const result = await destroy(STORAGE_KEYS.SHORTCUTS, id)
		return result.success
	} catch (error) {
		throw new Error(
			`Failed to reset shortcut: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
