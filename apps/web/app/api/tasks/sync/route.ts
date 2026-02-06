import type { ExtractedTask } from '@/features/notes/utils/extract-tasks'
import type { Task } from '@/features/tasks/api/queries/get-tasks'
import { db } from '@/lib/storage/adapters/server-db'
import { generateId } from '@skriuw/shared'
import { NextRequest, NextResponse } from 'next/server'

type SyncPayload = {
	noteId: string
	tasks: ExtractedTask[]
}

export async function POST(request: NextRequest) {
	try {
		const body: SyncPayload = await request.json()
		if (!body.noteId) return NextResponse.json({ error: 'noteId is required' }, { status: 400 })

		const incoming = Array.isArray(body.tasks) ? body.tasks : []
		const existing = (await db.findAll<Task>('tasks')).filter((t) => t.noteId === body.noteId)

		const existingMap = new Map(existing.map((t) => [t.blockId, t]))
		const incomingMap = new Map(incoming.map((t) => [t.blockId, t]))
		const now = Date.now()

		// Delete removed
		const toDelete = existing
			.filter((t) => !incomingMap.has(t.blockId))
			.map((t) => (t as any).id)
		if (toDelete.length > 0) await db.deleteMany('tasks', toDelete)

		// Prepare inserts and updates
		const toInsert: any[] = []
		const toUpdate: { id: string; data: any }[] = []

		for (const task of incoming) {
			const current = existingMap.get(task.blockId)
			if (current) {
				const needsUpdate =
					current.content !== task.content ||
					current.checked !== (task.checked ? 1 : 0) ||
					current.parentTaskId !== task.parentTaskId ||
					current.position !== task.position

				if (needsUpdate) {
					toUpdate.push({
						id: (current as any).id,
						data: {
							content: task.content,
							checked: task.checked ? 1 : 0,
							parentTaskId: task.parentTaskId ?? null,
							position: task.position ?? current.position,
							updatedAt: now
						}
					})
				}
			} else {
				toInsert.push({
					id: generateId(`${body.noteId}-${task.blockId}-`),
					noteId: body.noteId,
					blockId: task.blockId,
					content: task.content,
					checked: task.checked ? 1 : 0,
					parentTaskId: task.parentTaskId ?? null,
					position: task.position ?? 0,
					createdAt: now,
					updatedAt: now
				})
			}
		}

		if (toInsert.length > 0) await db.createMany('tasks', toInsert)
		if (toUpdate.length > 0) {
			await Promise.all(toUpdate.map((u) => db.update('tasks', u.id, u.data)))
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Failed to sync tasks:', error)
		return NextResponse.json({ error: 'Failed to sync tasks' }, { status: 500 })
	}
}
