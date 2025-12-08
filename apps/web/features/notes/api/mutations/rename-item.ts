import { update } from '@skriuw/crud'

import { invalidateItemsCache } from '../queries/get-items'
import type { Item } from '../../types'

const STORAGE_KEY = 'Skriuw_notes'

export async function renameItem(id: string, newName: string): Promise<Item | undefined> {
	try {
		const result = await update<Item>(STORAGE_KEY, id, { name: newName })
		invalidateItemsCache()
		return result.data as Item | undefined
	} catch (error) {
		throw new Error(
			`Failed to rename item: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
