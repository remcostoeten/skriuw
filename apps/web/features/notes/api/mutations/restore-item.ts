import { update } from '../../../../lib/storage'

import { invalidateItemsCache } from '../queries/get-items'
import { invalidatePrefetchedNote } from '../../hooks/use-prefetch'

import type { Item } from '../../types'

const STORAGE_KEY = 'Skriuw_notes'

/**
 * Restore a soft-deleted item from trash
 */
export async function restoreItem(id: string): Promise<boolean> {
	try {
		const result = await update(STORAGE_KEY, id, {
			deletedAt: undefined,
		} as Partial<Item>)

		if (result) {
			invalidateItemsCache()
			invalidatePrefetchedNote(id)
			return true
		}
		return false
	} catch (error) {
		throw new Error(
			`Failed to restore item: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
