import { move } from '@skriuw/storage/crud'

import { invalidateItemsCache } from '../queries/get-items'

const STORAGE_KEY = 'Skriuw_notes'

export async function moveItem(itemId: string, targetFolderId: string | null): Promise<boolean> {
	try {
		const result = await move(STORAGE_KEY, itemId, targetFolderId)
		if (result) {
			invalidateItemsCache()
		}
		return result
	} catch (error) {
		throw new Error(
			`Failed to move item: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
