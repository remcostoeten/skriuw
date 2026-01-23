import { getDatabase, notes, folders, tasks, settings, shortcuts, schema } from "@skriuw/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic'

function isDev() {
	return process.env.NODE_ENV === 'development'
}

type RouteContext = {
	params: Promise<{ userId: string }>
}

// DELETE /api/dev/users/[userId] - Delete a user and all their data
export async function DELETE(request: NextRequest, context: RouteContext) {
	if (!isDev()) {
		return NextResponse.json(
			{ error: 'Dev endpoints are only available in development mode' },
			{ status: 403 }
		)
	}

	const { userId } = await context.params

	if (!userId) {
		return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
	}

	try {
		const db = getDatabase()

		// Check if user exists
		const existingUser = await db.query.user.findFirst({
			where: eq(schema.user.id, userId)
		})

		if (!existingUser) {
			return NextResponse.json({ error: 'User not found' }, { status: 404 })
		}

		// Delete the user - cascade will handle related data due to onDelete: 'cascade' in schema
		await db.delete(schema.user).where(eq(schema.user.id, userId))

		return NextResponse.json({
			success: true,
			message: `User ${userId.slice(-8)} and all related data deleted`,
			deletedUser: {
				id: userId,
				email: existingUser.email,
				isAnonymous: existingUser.isAnonymous
			}
		})
	} catch (error) {
		console.error('Failed to delete user:', error)
		return NextResponse.json(
			{
				error: 'Failed to delete user',
				details: (error as Error).message
			},
			{ status: 500 }
		)
	}
}

// POST /api/dev/users/[userId] - Reset user data (keep user, delete all their content)
export async function POST(request: NextRequest, context: RouteContext) {
	if (!isDev()) {
		return NextResponse.json(
			{ error: 'Dev endpoints are only available in development mode' },
			{ status: 403 }
		)
	}

	const { userId } = await context.params

	if (!userId) {
		return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
	}

	try {
		const db = getDatabase()
		const body = await request.json().catch(() => ({}))
		const action = body.action as string

		// Check if user exists
		const existingUser = await db.query.user.findFirst({
			where: eq(schema.user.id, userId)
		})

		if (!existingUser) {
			return NextResponse.json({ error: 'User not found' }, { status: 404 })
		}

		if (action === 'reset') {
			// Delete all user data but keep the user account
			const deletedCounts = {
				tasks: 0,
				notes: 0,
				folders: 0,
				settings: 0,
				shortcuts: 0
			}

			// Delete tasks first (they reference notes)
			const deletedTasks = await db.delete(tasks).where(eq(tasks.userId, userId)).returning()
			deletedCounts.tasks = deletedTasks.length

			// Delete notes
			const deletedNotes = await db.delete(notes).where(eq(notes.userId, userId)).returning()
			deletedCounts.notes = deletedNotes.length

			// Delete folders
			const deletedFolders = await db
				.delete(folders)
				.where(eq(folders.userId, userId))
				.returning()
			deletedCounts.folders = deletedFolders.length

			// Delete settings
			const deletedSettings = await db
				.delete(settings)
				.where(eq(settings.userId, userId))
				.returning()
			deletedCounts.settings = deletedSettings.length

			// Delete shortcuts
			const deletedShortcuts = await db
				.delete(shortcuts)
				.where(eq(shortcuts.userId, userId))
				.returning()
			deletedCounts.shortcuts = deletedShortcuts.length

			const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0)

			return NextResponse.json({
				success: true,
				action: 'reset',
				message: `Reset user ${userId.slice(-8)} - deleted ${totalDeleted} items`,
				deletedCounts,
				user: {
					id: userId,
					email: existingUser.email,
					isAnonymous: existingUser.isAnonymous
				}
			})
		}

		return NextResponse.json({ error: 'Invalid action. Use action: "reset"' }, { status: 400 })
	} catch (error) {
		console.error('Failed to manage user:', error)
		return NextResponse.json(
			{
				error: 'Failed to manage user',
				details: (error as Error).message
			},
			{ status: 500 }
		)
	}
}
