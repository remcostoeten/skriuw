import { NextRequest, NextResponse } from 'next/server'
import { eq, or } from 'drizzle-orm'
import { getDatabase, tasks } from '@skriuw/db'

type RouteContext = {
    params: Promise<{ taskId: string }>
}

function serializeTask(row: typeof tasks.$inferSelect) {
    return {
        id: row.id,
        noteId: row.noteId,
        blockId: row.blockId,
        content: row.content,
        description: row.description,
        checked: row.checked,
        dueDate: row.dueDate,
        parentTaskId: row.parentTaskId,
        position: row.position,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }
}

// GET /api/tasks/item/[taskId] - Get a single task by ID
export async function GET(_request: NextRequest, context: RouteContext) {
    try {
        const db = getDatabase()
        const { taskId } = await context.params

        const result = await db
            .select()
            .from(tasks)
            .where(or(eq(tasks.id, taskId), eq(tasks.blockId, taskId)))
            .limit(1)

        if (result.length === 0) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        return NextResponse.json(serializeTask(result[0]))
    } catch (error) {
        console.error('Database error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return NextResponse.json(
            { error: 'Failed to fetch task', message: errorMessage },
            { status: 500 }
        )
    }
}

// PATCH /api/tasks/item/[taskId] - Update a task
export async function PATCH(request: NextRequest, context: RouteContext) {
    try {
        const db = getDatabase()
        const { taskId } = await context.params
        const body = await request.json()

        // Build update object with only provided fields
        const updateData: Partial<{
            content: string
            description: string | null
            checked: number
            dueDate: number | null
            updatedAt: number
        }> = {
            updatedAt: Date.now(),
        }

        if (typeof body.content === 'string') {
            updateData.content = body.content
        }
        if (body.description !== undefined) {
            updateData.description = body.description
        }
        if (typeof body.checked === 'number' || typeof body.checked === 'boolean') {
            updateData.checked = body.checked ? 1 : 0
        }
        if (body.dueDate !== undefined) {
            updateData.dueDate = body.dueDate
        }

        const result = await db
            .update(tasks)
            .set(updateData)
            .where(or(eq(tasks.id, taskId), eq(tasks.blockId, taskId)))
            .returning()

        if (result.length === 0) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        return NextResponse.json(serializeTask(result[0]))
    } catch (error) {
        console.error('Database error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return NextResponse.json(
            { error: 'Failed to update task', message: errorMessage },
            { status: 500 }
        )
    }
}

// DELETE /api/tasks/item/[taskId] - Delete a task
export async function DELETE(_request: NextRequest, context: RouteContext) {
    try {
        const db = getDatabase()
        const { taskId } = await context.params

        const result = await db
            .delete(tasks)
            .where(or(eq(tasks.id, taskId), eq(tasks.blockId, taskId)))
            .returning()

        if (result.length === 0) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Database error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return NextResponse.json(
            { error: 'Failed to delete task', message: errorMessage },
            { status: 500 }
        )
    }
}
