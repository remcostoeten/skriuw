'use server'

import type { Note } from '../../types'
import { invalidateItemsCache } from '../queries/get-items'
import { trackActivity } from '@/features/activity'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { update } from '@skriuw/crud'

export async function setNoteVisibility(
	noteId: string,
	isPublic: boolean
): Promise<Note | undefined> {
	const result = await update<Note>(STORAGE_KEYS.NOTES, noteId, { isPublic })
	invalidateItemsCache()

	if (!result.success) {
		throw new Error((result as any).error?.message ?? 'Failed to update note visibility')
	}

	if (result.data) {
		trackActivity({
			entityType: 'note',
			entityId: result.data.id,
			action: 'updated',
			entityName: result.data.name
		})
	}

	return result.data ?? undefined
}
