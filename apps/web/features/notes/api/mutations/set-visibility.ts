import { update } from '@skriuw/crud'
import type { Note } from '../../types'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { invalidateItemsCache } from '../queries/get-items'
import { invalidatePrefetchedNote } from '../../hooks/use-prefetch'

export async function setNoteVisibility(noteId: string, isPublic: boolean): Promise<Note | undefined> {
	const result = await update<Note>(STORAGE_KEYS.NOTES, noteId, { isPublic })
	invalidateItemsCache()
	invalidatePrefetchedNote(noteId)
	if (!result.success) {
		throw new Error(result.error?.message ?? 'Failed to update note visibility')
	}
	return result.data ?? undefined
}
