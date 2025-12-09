import { update } from '@skriuw/crud'

import { invalidateItemsCache } from '../queries/get-items'

import { STORAGE_KEYS } from '@/lib/storage-keys'

export async function moveItem(itemId: string, targetFolderId: string | null): Promise<boolean> {
	try {
		// Move is just an update to parentFolderId
		const result = await update(STORAGE_KEYS.NOTES, itemId, { parentFolderId: targetFolderId } as any)
		if (result.success) {
			invalidateItemsCache()
			return true
		}
		return false
	} catch (error) {
		throw new Error(
			`Failed to move item: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
