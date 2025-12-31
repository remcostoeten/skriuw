'use server'
import { update } from '@skriuw/crud'

import { invalidateItemsCache } from '../queries/get-items'
import type { Item } from '../../types'

import { STORAGE_KEYS } from '@/lib/storage-keys'

export async function renameItem(
	id: string,
	newName: string
): Promise<Item | undefined> {
	try {
		const result = await update<Item>(STORAGE_KEYS.NOTES, id, {
			name: newName
		})
		invalidateItemsCache()
		return result.data as Item | undefined
	} catch (error) {
		throw new Error(
			`Failed to rename item: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
