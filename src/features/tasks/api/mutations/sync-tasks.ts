import { isDatabaseAvailable } from '@/shared/database/client'

import type { ExtractedTask } from '@/features/notes/utils/extract-tasks'

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
 * Syncs tasks from BlockNote blocks to the database
 * This will:
 * 1. Delete tasks that no longer exist in the blocks
 * 2. Update existing tasks
 * 3. Create new tasks
 */
export async function syncTasksToDatabase(
	noteId: string,
	extractedTasks: ExtractedTask[]
): Promise<void> {
	// Check if database is available
	if (!isDatabaseAvailable()) {
		console.warn('Database not available, skipping task sync')
		return
	}

	try {
		// Lazy load database dependencies
		const { getDatabase } = await import('@/shared/database/client')
		const { eq, and } = await import('drizzle-orm')
		const { tasks } = await import('@/shared/database/schema')
		const db = await getDatabase()

		// Get all existing tasks for this note
		const existingTasks = await db
			.select()
			.from(tasks)
			.where(eq(tasks.noteId, noteId))

		const existingTasksByBlockId = new Map<string, Task>()
		for (const task of existingTasks) {
			existingTasksByBlockId.set(task.blockId, task)
		}

		const extractedTasksByBlockId = new Map<string, ExtractedTask>()
		for (const task of extractedTasks) {
			extractedTasksByBlockId.set(task.blockId, task)
		}

		const now = Date.now()

		// Delete tasks that no longer exist
		const tasksToDelete = existingTasks.filter(
			(task) => !extractedTasksByBlockId.has(task.blockId)
		)

		if (tasksToDelete.length > 0) {
			const blockIdsToDelete = tasksToDelete.map((t) => t.blockId)
			// Delete tasks one by one (drizzle-orm doesn't have a simple IN operator for delete)
			for (const blockId of blockIdsToDelete) {
				await db
					.delete(tasks)
					.where(and(eq(tasks.noteId, noteId), eq(tasks.blockId, blockId)))
			}
		}

		// Update or create tasks
		for (const extractedTask of extractedTasks) {
			const existingTask = existingTasksByBlockId.get(extractedTask.blockId)

			if (existingTask) {
				// Update existing task
				const needsUpdate =
					existingTask.content !== extractedTask.content ||
					existingTask.checked !== (extractedTask.checked ? 1 : 0) ||
					existingTask.parentTaskId !== extractedTask.parentTaskId ||
					existingTask.position !== extractedTask.position

				if (needsUpdate) {
					await db
						.update(tasks)
						.set({
							content: extractedTask.content,
							checked: extractedTask.checked ? 1 : 0,
							parentTaskId: extractedTask.parentTaskId,
							position: extractedTask.position,
							updatedAt: now,
						})
						.where(eq(tasks.id, existingTask.id))
				}
			} else {
				// Create new task
				const taskId = `${noteId}-${extractedTask.blockId}-${now}`
				await db.insert(tasks).values({
					id: taskId,
					noteId,
					blockId: extractedTask.blockId,
					content: extractedTask.content,
					checked: extractedTask.checked ? 1 : 0,
					parentTaskId: extractedTask.parentTaskId,
					position: extractedTask.position,
					createdAt: now,
					updatedAt: now,
				})
			}
		}
	} catch (error) {
		console.error('Failed to sync tasks to database:', error)
		throw new Error(
			`Failed to sync tasks: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

/**
 * Deletes all tasks for a note
 */
export async function deleteTasksForNote(noteId: string): Promise<void> {
	// Check if database is available
	if (!isDatabaseAvailable()) {
		console.warn('Database not available, skipping task deletion')
		return
	}

	try {
		// Lazy load database dependencies
		const { getDatabase } = await import('@/shared/database/client')
		const { eq } = await import('drizzle-orm')
		const { tasks } = await import('@/shared/database/schema')
		const db = await getDatabase()
		await db.delete(tasks).where(eq(tasks.noteId, noteId))
	} catch (error) {
		console.error('Failed to delete tasks for note:', error)
		throw new Error(
			`Failed to delete tasks: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

