import { update } from '@skriuw/crud'

import { invalidateItemsCache } from '../queries/get-items'
import type { Note } from '../../types'

import { STORAGE_KEYS } from '@/lib/storage-keys'

export async function favoriteNote(noteId: string, favorite: boolean): Promise<Note | undefined> {
	try {
		const result = await update<Note>(STORAGE_KEYS.NOTES, noteId, {
			favorite,
		})
		invalidateItemsCache()
		return result.data as Note | undefined
	} catch (error) {
		throw new Error(
			`Failed to ${favorite ? 'favorite' : 'unfavorite'} note: ${error instanceof Error ? error.message : String(error)
			}`
		)
	}
}
