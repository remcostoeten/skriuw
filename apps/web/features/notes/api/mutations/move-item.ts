import { update } from '@skriuw/crud'

import { invalidateItemsCache } from '../queries/get-items'

const STORAGE_KEY = 'Skriuw_notes'

export async function moveItem(itemId: string, targetFolderId: string | null): Promise<boolean> {
	try {
		// Move is just an update to parentFolderId
		const result = await update(STORAGE_KEY, itemId, { parentFolderId: targetFolderId } as any)
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
