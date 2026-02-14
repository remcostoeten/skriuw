import type { ExtractedTask } from '@/features/notes/utils/extract-tasks'
import { requireMutation } from '@/lib/api-auth'
import { getDatabase, notes, tasks } from '@skriuw/db'
import { generateId } from '@skriuw/shared'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

type SyncPayload = {
	noteId: string
	tasks: ExtractedTask[]
}

export async function POST(request: NextRequest) {
	try {
		const auth = await requireMutation()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const body: SyncPayload = await request.json()
		if (!body.noteId) return NextResponse.json({ error: 'noteId is required' }, { status: 400 })

		const incoming = Array.isArray(body.tasks) ? body.tasks : []
		const db = getDatabase()

		// Note must belong to the current user.
		const noteResult = await db
			.select({ id: notes.id })
			.from(notes)
			.where(and(eq(notes.id, body.noteId), eq(notes.userId, userId)))
			.limit(1)

		if (noteResult.length === 0) {
			return NextResponse.json({ error: 'Note not found' }, { status: 404 })
		}

		const existing = await db
			.select()
			.from(tasks)
			.where(and(eq(tasks.noteId, body.noteId), eq(tasks.userId, userId)))

		const existingByBlockId = new Map(existing.map((t) => [t.blockId, t]))
		const taskIdByBlockId = new Map(existing.map((t) => [t.blockId, t.id]))
		const now = Date.now()

		// Ensure each incoming block has a stable task id before resolving parent links.
		for (const task of incoming) {
			if (!taskIdByBlockId.has(task.blockId)) {
				taskIdByBlockId.set(task.blockId, generateId(`${body.noteId}-${task.blockId}-`))
			}
		}

		const rows = incoming.map((task) => {
			const id = taskIdByBlockId.get(task.blockId)!
			const mappedParentId = task.parentTaskId ? taskIdByBlockId.get(task.parentTaskId) : null
			const parentTaskId = mappedParentId ?? task.parentTaskId ?? null
			const current = existingByBlockId.get(task.blockId)

			return {
				id,
				noteId: body.noteId,
				blockId: task.blockId,
				content: task.content,
				description: current?.description ?? null,
				userId,
				checked: task.checked ? 1 : 0,
				dueDate: current?.dueDate ?? null,
				parentTaskId,
				position: task.position ?? 0,
				createdAt: current?.createdAt ?? now,
				updatedAt: now
			}
		})

		// Replace note-scoped task rows atomically enough for current usage.
		await db.delete(tasks).where(and(eq(tasks.noteId, body.noteId), eq(tasks.userId, userId)))
		if (rows.length > 0) {
			await db.insert(tasks).values(rows)
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Failed to sync tasks:', error)
		return NextResponse.json({ error: 'Failed to sync tasks' }, { status: 500 })
	}
}
