import { apiRequest } from '../../../../lib/storage'
import type { Task } from '../../types'

export type { Task }

/**
 * Gets all tasks for a specific note
 */
export async function getTasksForNote(noteId: string): Promise<Task[]> {
	if (!noteId) return []
	try {
		return await apiRequest<Task[]>(`/api/tasks/${encodeURIComponent(noteId)}`)
	} catch (error) {
		console.error('Failed to get tasks for note:', error)
		throw error
	}
}

/**
 * Gets a single task by blockId
 */
export async function getTaskByBlockId(noteId: string, blockId: string): Promise<Task | undefined> {
	if (!noteId || !blockId) return undefined
	try {
		const result = await apiRequest<Task | null>(
			`/api/tasks/${encodeURIComponent(noteId)}?blockId=${encodeURIComponent(blockId)}`
		)
		return result ?? undefined
	} catch (error) {
		console.error('Failed to get task by blockId:', error)
		throw error instanceof Error ? error : new Error(`Failed to get task: ${String(error)}`)
	}
}
