import type { ShortcutId } from '../../shortcut-definitions'
import type { CustomShortcut } from '../types'
import { readOne } from '@skriuw/crud'

const STORAGE_KEY = 'quantum-works:shortcuts:custom'

/**
 * Get a single custom shortcut by ID
 * Uses the generic CRUD layer for agnostic storage
 */
export async function getShortcut(id: ShortcutId): Promise<CustomShortcut | undefined> {
	try {
		const result = await readOne<CustomShortcut>(STORAGE_KEY, id)

		if (result.success && result.data) {
			return result.data
		}

		return undefined
	} catch (error) {
		throw new Error(
			`Failed to get shortcut: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
