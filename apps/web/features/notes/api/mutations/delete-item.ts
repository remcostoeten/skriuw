'use server'

import type { Item } from '../../types'
import { invalidateItemsCache } from '../queries/get-items'
import { trackActivity } from '@/features/activity'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { update, readOne } from '@skriuw/crud'

/**
 * Soft delete an item by setting deletedAt timestamp.
 * Item will be moved to trash and can be restored within 30 days.
 */
export async function deleteItem(id: string): Promise<boolean> {
	try {
		// Get item name before deletion for activity tracking
		const itemResult = await readOne<Item>(STORAGE_KEYS.NOTES, id)
		const itemName = itemResult.success && itemResult.data ? itemResult.data.name : 'Unknown'
		const entityType =
			itemResult.success && itemResult.data?.type === 'folder' ? 'folder' : 'note'

		const result = await update<Item>(STORAGE_KEYS.NOTES, id, {
			deletedAt: Date.now()
		} as Partial<Item>)

		if (result.success && result.data) {
			// Invalidate cache after deletion
			invalidateItemsCache()

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
