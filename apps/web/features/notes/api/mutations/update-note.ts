
import { invalidateItemsCache } from '../queries/get-items'
import { invalidatePrefetchedNote } from '../../hooks/use-prefetch'
import type { Note, UpdateNoteData } from '../../types'
import { update } from '../../../../lib/storage'
import { syncTasksToDatabase } from '../../../tasks'
import { extractTasksFromBlocks } from '../../utils/extract-tasks'

const STORAGE_KEY = 'Skriuw_notes'

export async function updateNote(id: string, data: UpdateNoteData): Promise<Note | undefined> {
	const updateFn = update
	try {
		const result = await updateFn(STORAGE_KEY, id, {
			name: data.name,
			content: data.content,
		} as Partial<Note>)

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

		return result as Note | undefined
	} catch (error) {
		throw new Error(
			`Failed to update note: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
