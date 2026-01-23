import type { ExtractedTask } from "@/features/notes/utils/extract-tasks";
import { LRUCache } from "lru-cache";

// LRU cache to avoid redundant syncs - limited to 1000 entries with 1 hour TTL
// Size based on typical active notes in a session; TTL prevents stale data
export const lastSyncedTasksByNote = new LRUCache<string, string>({
	max: 1000,
	ttl: 1000 * 60 * 60
})

/**
 * Syncs tasks from BlockNote blocks to the database through the API
 */
export async function syncTasksToDatabase(
	noteId: string,
	extractedTasks: ExtractedTask[]
): Promise<void> {
	if (!noteId) return

	const tasksJson = JSON.stringify(extractedTasks)
	if (lastSyncedTasksByNote.get(noteId) === tasksJson) {
		return
	}

	try {
		const response = await fetch('/api/tasks/sync', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				noteId,
				tasks: extractedTasks
			})
		})

		if (!response.ok) {
			const errorBody = await response.json().catch(() => ({}))
			throw new Error(errorBody?.error ?? 'Failed to sync tasks')
		}

		lastSyncedTasksByNote.set(noteId, tasksJson)
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
			method: 'DELETE'
		})

		if (!response.ok) {
			const errorBody = await response.json().catch(() => ({}))
			throw new Error(errorBody?.error ?? 'Failed to delete tasks')
		}

		lastSyncedTasksByNote.delete(noteId)
	} catch (error) {
		console.error('Failed to delete tasks for note:', error)
		throw error instanceof Error ? error : new Error(`Failed to delete tasks: ${String(error)}`)
	}
}
