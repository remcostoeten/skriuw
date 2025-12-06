import { deleteTasksForNote } from '@/features/tasks'

import { destroy } from '@skriuw/storage/crud/destroy'

import { invalidateItemsCache } from '../queries/get-items'
import { invalidatePrefetchedNote } from '../../hooks/use-prefetch'

const STORAGE_KEY = 'Skriuw_notes'

/**
 * Permanently delete an item (bypass trash)
 */
export async function permanentDeleteItem(id: string): Promise<boolean> {
	try {
		// Delete associated tasks before deleting the note
		try {
			await deleteTasksForNote(id)
		} catch (taskError) {
			// Log error but don't fail the note deletion
			console.error('Failed to delete tasks for note:', taskError)
		}

		const result = await destroy(STORAGE_KEY, id)
		if (result) {
			invalidateItemsCache()
			invalidatePrefetchedNote(id)
		}
		return result
	} catch (error) {
		throw new Error(
			`Failed to permanently delete item: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
