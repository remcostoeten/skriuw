import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getDatabase, tasks } from '@/lib/db'
import type { ExtractedTask } from '@/features/notes/utils/extract-tasks'

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
    const existing = await db
      .select()
      .from(tasks)
      .where(eq(tasks.noteId, body.noteId))

    const existingMap = new Map(existing.map((task) => [task.blockId, task]))
    const incomingMap = new Map(incomingTasks.map((task) => [task.blockId, task]))
    const now = Date.now()

    // Delete removed tasks
    for (const task of existing) {
      if (!incomingMap.has(task.blockId)) {
        await db
          .delete(tasks)
          .where(and(eq(tasks.noteId, body.noteId), eq(tasks.blockId, task.blockId)))
      }
    }

    // Upsert tasks
    for (const extracted of incomingTasks) {
      const current = existingMap.get(extracted.blockId)
      if (current) {
        const needsUpdate =
          current.content !== extracted.content ||
          current.checked !== (extracted.checked ? 1 : 0) ||
          current.parentTaskId !== extracted.parentTaskId ||
          current.position !== extracted.position

        if (needsUpdate) {
          await db
            .update(tasks)
            .set({
              content: extracted.content,
              checked: extracted.checked ? 1 : 0,
              parentTaskId: extracted.parentTaskId ?? null,
              position: extracted.position ?? current.position,
              updatedAt: now
            })
            .where(eq(tasks.id, current.id))
        }
      } else {
        const taskId = `${body.noteId}-${extracted.blockId}-${now}-${Math.random().toString(36).slice(2, 6)}`
        await db.insert(tasks).values({
          id: taskId,
          noteId: body.noteId,
          blockId: extracted.blockId,
          content: extracted.content,
          checked: extracted.checked ? 1 : 0,
          parentTaskId: extracted.parentTaskId ?? null,
          position: extracted.position ?? 0,
          createdAt: now,
          updatedAt: now
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to sync tasks:', error)
    return NextResponse.json(
      { error: 'Failed to sync tasks' },
      { status: 500 }
    )
  }
}
