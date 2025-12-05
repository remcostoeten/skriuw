import { NextRequest, NextResponse } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import { getDatabase, tasks } from '@skriuw/db'
import type { ExtractedTask } from '../../../../features/notes/utils/extract-tasks'

type SyncPayload = {
	noteId: string
	tasks: ExtractedTask[]
}

export async function POST(request: NextRequest) {
	try {
		const body: SyncPayload = await request.json()
		if (!body.noteId) {
			return NextResponse.json({ error: 'noteId is required' }, { status: 400 })
		}

		const incomingTasks = Array.isArray(body.tasks) ? body.tasks : []
		const db = getDatabase()
		const existing = await db.select().from(tasks).where(eq(tasks.noteId, body.noteId))

		const existingMap = new Map(existing.map((task) => [task.blockId, task]))
		const incomingMap = new Map(incomingTasks.map((task) => [task.blockId, task]))
		const now = Date.now()

		// Collect IDs to delete (batch operation)
		const toDeleteIds = existing
			.filter((task) => !incomingMap.has(task.blockId))
			.map((task) => task.id)

		// Delete removed tasks in batch
		if (toDeleteIds.length > 0) {
			await db.delete(tasks).where(inArray(tasks.id, toDeleteIds))
		}

		// Collect inserts and updates
		const toInsert: (typeof tasks.$inferInsert)[] = []
		const toUpdate: { id: string; data: Partial<typeof tasks.$inferInsert> }[] = []

		for (const extracted of incomingTasks) {
			const current = existingMap.get(extracted.blockId)
			if (current) {
				const needsUpdate =
					current.content !== extracted.content ||
					current.checked !== (extracted.checked ? 1 : 0) ||
					current.parentTaskId !== extracted.parentTaskId ||
					current.position !== extracted.position

				if (needsUpdate) {
					toUpdate.push({
						id: current.id,
						data: {
							content: extracted.content,
							checked: extracted.checked ? 1 : 0,
							parentTaskId: extracted.parentTaskId ?? null,
							position: extracted.position ?? current.position,
							updatedAt: now,
						},
					})
				}
			} else {
				const taskId = `${body.noteId}-${extracted.blockId}-${now}-${Math.random().toString(36).slice(2, 6)}`
				toInsert.push({
					id: taskId,
					noteId: body.noteId,
					blockId: extracted.blockId,
					content: extracted.content,
					checked: extracted.checked ? 1 : 0,
					parentTaskId: extracted.parentTaskId ?? null,
					position: extracted.position ?? 0,
					createdAt: now,
					updatedAt: now,
				})
			}
		}

		// Batch insert new tasks
		if (toInsert.length > 0) {
			await db.insert(tasks).values(toInsert)
		}

		// Batch update existing tasks (PostgreSQL doesn't support multi-row update in one query easily,
		// but we can use Promise.all for parallel execution)
		if (toUpdate.length > 0) {
			await Promise.all(
				toUpdate.map((item) =>
					db.update(tasks).set(item.data).where(eq(tasks.id, item.id))
				)
			)
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Failed to sync tasks:', error)
		return NextResponse.json({ error: 'Failed to sync tasks' }, { status: 500 })
	}
}

