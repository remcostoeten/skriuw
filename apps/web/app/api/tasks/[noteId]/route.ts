import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getDatabase, tasks } from '@skriuw/db'

type RouteContext = {
	params: Promise<{ noteId: string }>
}

function serializeTask(row: typeof tasks.$inferSelect) {
	return {
		id: row.id,
		noteId: row.noteId,
		blockId: row.blockId,
		content: row.content,
		checked: row.checked,
		parentTaskId: row.parentTaskId,
		position: row.position,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
}

// GET /api/tasks/[noteId] - Get tasks for a note (optionally filtered by blockId)
export async function GET(request: NextRequest, context: RouteContext) {
	try {
		const db = getDatabase()
		const { searchParams } = new URL(request.url)
		const blockId = searchParams.get('blockId')
		const { noteId } = await context.params
		const condition = blockId
			? and(eq(tasks.noteId, noteId), eq(tasks.blockId, blockId))
			: eq(tasks.noteId, noteId)

		const result = await db.select().from(tasks).where(condition).orderBy(tasks.position)

		if (blockId) {
			return NextResponse.json(result.length > 0 ? serializeTask(result[0]) : null)
		}

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

// DELETE /api/tasks/[noteId] - Delete all tasks for a note
export async function DELETE(_request: NextRequest, context: RouteContext) {
	try {
		const db = getDatabase()
		const { noteId } = await context.params

		await db.delete(tasks).where(eq(tasks.noteId, noteId))

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Database error:', error)
		const errorMessage = error instanceof Error ? error.message : String(error)
		return NextResponse.json(
			{ error: 'Failed to delete tasks', message: errorMessage },
			{ status: 500 }
		)
	}
}
