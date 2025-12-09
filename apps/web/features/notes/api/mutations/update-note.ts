import { invalidateItemsCache } from '../queries/get-items'
import { invalidatePrefetchedNote } from '../../hooks/use-prefetch'
import type { Note, UpdateNoteData } from '../../types'
import { update } from '@skriuw/crud'
import { syncTasksToDatabase } from '../../../tasks'
import { extractTasksFromBlocks } from '../../utils/extract-tasks'

import { STORAGE_KEYS } from '@/lib/storage-keys'

export async function updateNote(id: string, data: UpdateNoteData): Promise<Note | undefined> {
	try {
		const result = await update<Note>(STORAGE_KEYS.NOTES, id, {
			name: data.name,
			content: data.content,
		})

		if (!result.success) {
			throw new Error(result.error?.message || 'Failed to update note')
		}

		invalidateItemsCache()
		invalidatePrefetchedNote(id)

		// Sync tasks to database if content was updated
		if (data.content && Array.isArray(data.content)) {
			try {
				const extractedTasks = extractTasksFromBlocks(data.content, id)
				await syncTasksToDatabase(id, extractedTasks)
			} catch (taskError) {
				// Log error but don't fail the note update
				console.error('Failed to sync tasks to database:', taskError)
			}
		}

		return result.data ?? undefined
	} catch (error) {
		throw new Error(
			`Failed to update note: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
