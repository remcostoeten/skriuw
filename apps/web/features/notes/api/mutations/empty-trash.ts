import { deleteTasksForNote } from '@/features/tasks'

import { destroy } from '@/lib/storage/client'

import { getTrashItems } from '../queries/get-trash'
import { invalidateItemsCache } from '../queries/get-items'

const STORAGE_KEY = 'Skriuw_notes'

/**
 * Permanently delete all items in trash
 */
export async function emptyTrash(): Promise<number> {
	try {
		const trashItems = await getTrashItems()
		let deletedCount = 0

		for (const item of trashItems) {
			try {
				// Delete associated tasks
				await deleteTasksForNote(item.id)
			} catch (taskError) {
				console.error('Failed to delete tasks for note:', taskError)
			}

			const result = await destroy(STORAGE_KEY, item.id)
			if (result.success) {
				deletedCount++
			}
		}

		if (deletedCount > 0) {
			invalidateItemsCache()
		}

		return deletedCount
	} catch (error) {
		throw new Error(
			`Failed to empty trash: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
