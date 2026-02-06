import { requireAuth } from '../../../lib/api-auth'
import { getDatabase, tasks, notes } from '@skriuw/db'
import { desc, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

function serializeTask(row: {
	id: string
	noteId: string
	noteName: string | null
	blockId: string
	content: string
	description: string | null
	checked: number
	dueDate: number | null
	parentTaskId: string | null
	position: number
	createdAt: number
	updatedAt: number
}) {
	return {
		id: row.id,
		noteId: row.noteId,
		noteName: row.noteName ?? null,
		blockId: row.blockId,
		content: row.content,
		description: row.description,
		checked: row.checked,
		dueDate: row.dueDate,
		parentTaskId: row.parentTaskId,
		position: row.position,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	}
}

// GET /api/tasks - Get all tasks for authenticated user
export async function GET(_request: NextRequest) {
	try {
		const auth = await requireAuth()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const db = getDatabase()

		// Join tasks with notes to get note names, filtered by user
		const result = await db
			.select({
				id: tasks.id,
				noteId: tasks.noteId,
				noteName: notes.name,
				blockId: tasks.blockId,
				content: tasks.content,
				description: tasks.description,
				checked: tasks.checked,
				dueDate: tasks.dueDate,
				parentTaskId: tasks.parentTaskId,
				position: tasks.position,
				createdAt: tasks.createdAt,
				updatedAt: tasks.updatedAt
			})
			.from(tasks)
			.leftJoin(notes, eq(tasks.noteId, notes.id))
			.where(eq(tasks.userId, userId))
			.orderBy(desc(tasks.updatedAt))

		return NextResponse.json(result.map(serializeTask))
	} catch (error) {
		console.error('Database error:', error)
		const errorMessage = error instanceof Error ? error.message : String(error)
		return NextResponse.json(
			{ error: 'Failed to fetch tasks', message: errorMessage },
			{ status: 500 }
		)
	}
}
