import { update, readOne } from '@skriuw/crud'

import { invalidateItemsCache } from '../queries/get-items'

import type { Item } from '../../types'
import { trackActivity } from '@/features/activity'
import { STORAGE_KEYS } from '@/lib/storage-keys'

export async function moveItem(itemId: string, targetFolderId: string | undefined): Promise<boolean> {
	try {
		const itemResult = await readOne<Item>(STORAGE_KEYS.NOTES, itemId)
		const itemName = itemResult.success && itemResult.data ? itemResult.data.name : 'Unknown'
		const entityType = itemResult.success && itemResult.data?.type === 'folder' ? 'folder' : 'note'

		const result = await update<Item>(STORAGE_KEYS.NOTES, itemId, { parentFolderId: targetFolderId })
		if (result.success) {
			// Cache invalidation is now handled by disabling caching in getItems()
			// No need for manual invalidation since we always fetch fresh data
			// invalidateItemsCache()

			trackActivity({
				entityType,
				entityId: itemId,
				action: 'moved',
				entityName: itemName
			})

			return true
		}
		return false
	} catch (error) {
		throw new Error(
			`Failed to move item: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
