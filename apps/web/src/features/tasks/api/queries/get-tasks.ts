// Dynamic imports to avoid bundling server-only code

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
	// Lazy load database dependencies
	const { isDatabaseAvailable, getDatabase, tasks } = await import('@skriuw/db')
	
	// Check if database is available
	if (!isDatabaseAvailable()) {
		console.warn('Database not available, returning empty tasks')
		return []
	}

	try {
		const { eq } = await import('drizzle-orm')
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
	// Lazy load database dependencies
	const { isDatabaseAvailable, getDatabase, tasks } = await import('@skriuw/db')
	
	// Check if database is available
	if (!isDatabaseAvailable()) {
		console.warn('Database not available, returning undefined for task')
		return undefined
	}

	try {
		const { eq, and } = await import('drizzle-orm')
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

