import { isDatabaseAvailable } from '@skriuw/db'

export interface Task {
	id: string
	noteId: string
	blockId: string
	content: string
	checked: number // 0 or 1
	parentTaskId: string | null
	position: number
	createdAt: number
	updatedAt: number
}

/**
 * Gets all tasks for a specific note
 */
export async function getTasksForNote(noteId: string): Promise<Task[]> {
	// Check if database is available
	if (!isDatabaseAvailable()) {
		console.warn('Database not available, returning empty tasks')
		return []
	}

	try {
		// Lazy load database dependencies
		const { getDatabase } = await import('@/shared/database/client')
		const { eq } = await import('drizzle-orm')
		const { tasks } = await import('@/shared/database/schema')
		const db = await getDatabase()
		const result = await db
			.select()
			.from(tasks)
			.where(eq(tasks.noteId, noteId))
			.orderBy(tasks.position)

		return result
	} catch (error) {
		console.error('Failed to get tasks for note:', error)
		throw new Error(
			`Failed to get tasks: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

/**
 * Gets a single task by blockId
 */
export async function getTaskByBlockId(
	noteId: string,
	blockId: string
): Promise<Task | undefined> {
	// Check if database is available
	if (!isDatabaseAvailable()) {
		console.warn('Database not available, returning undefined for task')
		return undefined
	}

	try {
		// Lazy load database dependencies
		const { getDatabase } = await import('@/shared/database/client')
		const { eq, and } = await import('drizzle-orm')
		const { tasks } = await import('@/shared/database/schema')
		const db = await getDatabase()
		const result = await db
			.select()
			.from(tasks)
			.where(and(eq(tasks.noteId, noteId), eq(tasks.blockId, blockId)))
			.limit(1)

		return result[0]
	} catch (error) {
		console.error('Failed to get task by blockId:', error)
		throw new Error(
			`Failed to get task: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

