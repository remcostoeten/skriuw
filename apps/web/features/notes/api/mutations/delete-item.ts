import { update, readOne } from '@skriuw/crud'

import { invalidateItemsCache } from '../queries/get-items'
import { invalidatePrefetchedNote } from '../../hooks/use-prefetch'

import type { Item } from '../../types'
import { trackActivity } from '@/features/activity'
import { STORAGE_KEYS } from '@/lib/storage-keys'

/**
 * Soft delete an item by setting deletedAt timestamp.
 * Item will be moved to trash and can be restored within 30 days.
 */
export async function deleteItem(id: string): Promise<boolean> {
	try {
		// Get item name before deletion for activity tracking
		const itemResult = await readOne<Item>(STORAGE_KEYS.NOTES, id)
		const itemName = itemResult.success && itemResult.data ? itemResult.data.name : 'Unknown'
		const entityType = itemResult.success && itemResult.data?.type === 'folder' ? 'folder' : 'note'

		const result = await update(STORAGE_KEYS.NOTES, id, {
			deletedAt: Date.now(),
		} as Partial<Item>)

		if (result.success && result.data) {
			invalidateItemsCache()
			invalidatePrefetchedNote(id)

			trackActivity({
				entityType,
				entityId: id,
				action: 'deleted',
				entityName: itemName
			})

			return true
		}
		return false
	} catch (error) {
		throw new Error(
			`Failed to delete item: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
