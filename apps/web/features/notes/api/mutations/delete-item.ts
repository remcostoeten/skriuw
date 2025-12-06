import { update } from '../../../../lib/storage'

import { invalidateItemsCache } from '../queries/get-items'
import { invalidatePrefetchedNote } from '../../hooks/use-prefetch'

import type { Item } from '../../types'

const STORAGE_KEY = 'Skriuw_notes'

/**
 * Soft delete an item by setting deletedAt timestamp.
 * Item will be moved to trash and can be restored within 30 days.
 */
export async function deleteItem(id: string): Promise<boolean> {
	try {
		const result = await update(STORAGE_KEY, id, {
			deletedAt: Date.now(),
		} as Partial<Item>)

		if (result) {
			invalidateItemsCache()
			invalidatePrefetchedNote(id)
			return true
		}
		return false
	} catch (error) {
		throw new Error(
			`Failed to delete item: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
