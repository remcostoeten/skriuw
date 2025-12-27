import { update } from '@skriuw/crud'

import { invalidateItemsCache } from '../queries/get-items'
import { invalidatePrefetchedNote } from '../../hooks/use-prefetch'

import type { Item } from '../../types'

import { STORAGE_KEYS } from '@/lib/storage-keys'

/**
 * Restore a soft-deleted item from trash
 */
export async function restoreItem(id: string): Promise<boolean> {
	try {
		const result = await update<Item>(STORAGE_KEYS.NOTES, id, {
			deletedAt: undefined,
		} as Partial<Item>)

		if (result.success) {
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
