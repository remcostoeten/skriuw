import { NextRequest, NextResponse } from 'next/server'
import { eq, or, and } from 'drizzle-orm'
import { getDatabase, tasks } from '@skriuw/db'
import { requireAuth, allowReadAccess, GUEST_USER_ID } from '@/lib/api-auth'

type RouteContext = {
    params: Promise<{ taskId: string }>
}

interface TaskBreadcrumb {
    id: string
    blockId: string
    content: string
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

async function getAncestorChain(
    db: ReturnType<typeof getDatabase>,
    taskId: string | null | undefined,
    userId: string,
    maxDepth = 10
): Promise<TaskBreadcrumb[]> {
    const ancestors: TaskBreadcrumb[] = []
    let currentId = taskId

    while (currentId && ancestors.length < maxDepth) {
        const idCondition = or(eq(tasks.id, currentId), eq(tasks.blockId, currentId))
        const condition = userId === GUEST_USER_ID
            ? idCondition
            : and(idCondition, eq(tasks.userId, userId))

        const result = await db
            .select({
                id: tasks.id,
                blockId: tasks.blockId,
                content: tasks.content,
                parentTaskId: tasks.parentTaskId,
            })
            .from(tasks)
            .where(condition)
            .limit(1)

        if (result.length === 0) break

        const parent = result[0]
        ancestors.unshift({
            id: parent.id,
            blockId: parent.blockId,
            content: parent.content,
        })
        currentId = parent.parentTaskId
    }

    return ancestors
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        // Allow read access (guests get guest-scoped data)
        const userId = await allowReadAccess()

        const db = getDatabase()
        const { taskId } = await context.params
        const { searchParams } = new URL(request.url)
        const withAncestors = searchParams.get('withAncestors') === 'true'

        const idCondition = or(eq(tasks.id, taskId), eq(tasks.blockId, taskId))
        const condition = userId === GUEST_USER_ID
            ? idCondition
            : and(idCondition, eq(tasks.userId, userId))

        const result = await db
            .select()
            .from(tasks)
            .where(condition)
            .limit(1)

        if (result.length === 0) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        const task = serializeTask(result[0])

        if (withAncestors) {
            const allAncestors = await getAncestorChain(db, result[0].parentTaskId, userId)
            return NextResponse.json({
                ...task,
                ancestors: allAncestors,
            })
        }

        return NextResponse.json(task)
    } catch (error) {
        console.error('Database error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return NextResponse.json(
            { error: 'Failed to fetch task', message: errorMessage },
            { status: 500 }
        )
    }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    try {
        // Require authentication for mutations
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response
        const { userId } = auth

        const db = getDatabase()
        const { taskId } = await context.params
        const body = await request.json()

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

        // Only update tasks owned by this user
        const result = await db
            .update(tasks)
            .set(updateData)
            .where(and(
                or(eq(tasks.id, taskId), eq(tasks.blockId, taskId)),
                eq(tasks.userId, userId)
            ))
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

export async function DELETE(_request: NextRequest, context: RouteContext) {
    try {
        // Require authentication for mutations
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response
        const { userId } = auth

        const db = getDatabase()
        const { taskId } = await context.params

        // Only delete tasks owned by this user
        const result = await db
            .delete(tasks)
            .where(and(
                or(eq(tasks.id, taskId), eq(tasks.blockId, taskId)),
                eq(tasks.userId, userId)
            ))
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
