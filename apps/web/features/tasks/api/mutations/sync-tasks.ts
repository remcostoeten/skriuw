import type { ExtractedTask } from '@/features/notes/utils/extract-tasks'

/**
 * Syncs tasks from BlockNote blocks to the database through the API
 */
export async function syncTasksToDatabase(
	noteId: string,
	extractedTasks: ExtractedTask[]
): Promise<void> {
	if (!noteId) return

	try {
		const response = await fetch('/api/tasks/sync', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				noteId,
				tasks: extractedTasks,
			}),
		})

		if (!response.ok) {
			const errorBody = await response.json().catch(() => ({}))
			throw new Error(errorBody?.error ?? 'Failed to sync tasks')
		}
	} catch (error) {
		console.error('Failed to sync tasks to database:', error)
		throw error instanceof Error ? error : new Error(`Failed to sync tasks: ${String(error)}`)
	}
}

/**
 * Deletes all tasks for a note
 */
export async function deleteTasksForNote(noteId: string): Promise<void> {
	if (!noteId) return

	try {
		const response = await fetch(`/api/tasks/${encodeURIComponent(noteId)}`, {
			method: 'DELETE',
		})

		if (!response.ok) {
			const errorBody = await response.json().catch(() => ({}))
			throw new Error(errorBody?.error ?? 'Failed to delete tasks')
		}
	} catch (error) {
		console.error('Failed to delete tasks for note:', error)
		throw error instanceof Error ? error : new Error(`Failed to delete tasks: ${String(error)}`)
	}
}
