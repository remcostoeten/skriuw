'use server'

import { invalidateItemsCache } from '../queries/get-items'
import { deleteTasksForNote } from '@/features/tasks'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { destroy } from '@skriuw/crud'

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

		const result = await destroy(STORAGE_KEYS.NOTES, id)
		if (result.success) {
			invalidateItemsCache()
		}
		return result.success
	} catch (error) {
		throw new Error(
			`Failed to permanently delete item: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
