import { getDatabase, tasks } from '@skriuw/db'
import { TaskUpdateSchema } from '@skriuw/core'
import { and, eq, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireMutation } from '@/lib/api-auth'
import { z } from 'zod'

type RouteContext = {
	params: Promise<{ taskId: string }>
}

type TaskBreadcrumb = {
	id: string
	blockId: string
	content: string
}

function invalidPayload(error: z.ZodError) {
	return NextResponse.json(
		{
			error: 'Invalid payload',
			details: error.flatten()
		},
		{ status: 400 }
	)
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
		updatedAt: row.updatedAt
	}
}

async function getAncestorChain(
	db: ReturnType<typeof getDatabase>,
	userId: string,
	taskId: string | null | undefined,
	maxDepth = 10
): Promise<TaskBreadcrumb[]> {
	const ancestors: TaskBreadcrumb[] = []
	let currentId = taskId

	while (currentId && ancestors.length < maxDepth) {
		const result = await db
			.select({
				id: tasks.id,
				blockId: tasks.blockId,
				content: tasks.content,
				parentTaskId: tasks.parentTaskId
			})
			.from(tasks)
			.where(
				and(
					eq(tasks.userId, userId),
					or(eq(tasks.id, currentId), eq(tasks.blockId, currentId))
				)
			)
			.limit(1)

		if (result.length === 0) break

		const parent = result[0]
		ancestors.unshift({
			id: parent.id,
			blockId: parent.blockId,
			content: parent.content
		})
		currentId = parent.parentTaskId
	}

	return ancestors
}

export async function GET(request: NextRequest, context: RouteContext) {
	try {
		const auth = await requireAuth()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const db = getDatabase()
		const { taskId } = await context.params
		const { searchParams } = new URL(request.url)
		const withAncestors = searchParams.get('withAncestors') === 'true'

		const result = await db
			.select()
			.from(tasks)
			.where(
				and(eq(tasks.userId, userId), or(eq(tasks.id, taskId), eq(tasks.blockId, taskId)))
			)
			.limit(1)

		if (result.length === 0) {
			return NextResponse.json({ error: 'Task not found' }, { status: 404 })
		}

		const task = serializeTask(result[0])

		if (withAncestors) {
			const allAncestors = await getAncestorChain(db, userId, result[0].parentTaskId)
			return NextResponse.json({
				...task,
				ancestors: allAncestors
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
		const auth = await requireMutation()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const db = getDatabase()
		const { taskId } = await context.params
		const body = await request.json()
		const parsed = TaskUpdateSchema.safeParse(body)
		if (!parsed.success) return invalidPayload(parsed.error)
		const payload = parsed.data

		const updateData: Partial<{
			content: string
			description: string | null
			checked: number
			dueDate: number | null
			updatedAt: number
		}> = {
			updatedAt: Date.now()
		}

		if (typeof payload.content === 'string') {
			updateData.content = payload.content
		}
		if (payload.description !== undefined) {
			updateData.description = payload.description
		}
		if (typeof payload.checked === 'number' || typeof payload.checked === 'boolean') {
			updateData.checked = payload.checked ? 1 : 0
		}
		if (payload.dueDate !== undefined) {
			updateData.dueDate = payload.dueDate
		}

		const result = await db
			.update(tasks)
			.set(updateData)
			.where(
				and(eq(tasks.userId, userId), or(eq(tasks.id, taskId), eq(tasks.blockId, taskId)))
			)
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
		const auth = await requireMutation()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const db = getDatabase()
		const { taskId } = await context.params

		const result = await db
			.delete(tasks)
			.where(
				and(eq(tasks.userId, userId), or(eq(tasks.id, taskId), eq(tasks.blockId, taskId)))
			)
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
