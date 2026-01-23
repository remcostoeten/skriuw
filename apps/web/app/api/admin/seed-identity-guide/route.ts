import { identityGuardNoteContent } from "@/lib/seed-content/identity-guard-content";
import { getDatabase, notes, user } from "@skriuw/db";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Seeds the Identity Guard knowledge note to all users in the database
 * This ensures every user has access to the documentation about the identity guard pattern
 */
export async function POST() {
	try {
		const db = getDatabase()
		const now = Date.now()

		// Get all users
		const allUsers = await db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				isAnonymous: user.isAnonymous
			})
			.from(user)

		if (allUsers.length === 0) {
			return NextResponse.json(
				{
					success: false,
					message: 'No users found in database'
				},
				{ status: 404 }
			)
		}

		const results = {
			totalUsers: allUsers.length,
			seededUsers: 0,
			skippedUsers: 0,
			errors: [] as string[]
		}

		// Seed each user with the Identity Guard note
		for (const currentUser of allUsers) {
			try {
				// Check if user already has an Identity Guard note
				const existingNote = await db
					.select({ id: notes.id })
					.from(notes)
					.where(
						and(
							eq(notes.userId, currentUser.id),
							eq(notes.name, 'Identity Guard Pattern')
						)
					)
					.limit(1)

				if (existingNote.length > 0) {
					results.skippedUsers++
					console.log(
						`⏭️  Skipped user ${currentUser.email} - already has Identity Guard note`
					)
					continue
				}

				// Create the Identity Guard note for this user
				const noteId = crypto.randomUUID()

				await db.insert(notes).values({
					id: noteId,
					name: 'Identity Guard Pattern',
					content: JSON.stringify(identityGuardNoteContent),
					userId: currentUser.id,
					parentFolderId: null, // Root level note
					pinned: 1, // Pin it so it's visible
					pinnedAt: now,
					favorite: 1, // Mark as favorite for easy access
					createdAt: now,
					updatedAt: now,
					type: 'note'
				})

				results.seededUsers++
				console.log(
					`✅ Seeded Identity Guard note for user: ${currentUser.email} (${currentUser.isAnonymous ? 'anonymous' : 'authenticated'})`
				)
			} catch (userError) {
				const errorMsg = `Failed to seed user ${currentUser.email}: ${userError instanceof Error ? userError.message : 'Unknown error'}`
				results.errors.push(errorMsg)
				console.error(`❌ ${errorMsg}`)
			}
		}

		const summary = `
Identity Guard Seeding Complete:
📊 Total users: ${results.totalUsers}
✅ Successfully seeded: ${results.seededUsers}
⏭️  Skipped (already exists): ${results.skippedUsers}
❌ Errors: ${results.errors.length}
${results.errors.length > 0 ? '\nErrors:\n' + results.errors.join('\n') : ''}
    `.trim()

		console.log(summary)

		return NextResponse.json({
			success: results.errors.length === 0,
			message: 'Identity Guard seeding completed',
			data: results,
			summary
		})
	} catch (error) {
		console.error('Failed to seed Identity Guard note:', error)
		return NextResponse.json(
			{
				success: false,
				message: 'Failed to seed Identity Guard note',
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		)
	}
}

/**
 * Get statistics about Identity Guard note seeding
 */
export async function GET() {
	try {
		const db = getDatabase()

		// Count total users
		const totalUsers = await db.select({ count: user.id }).from(user)

		// Count users with Identity Guard note
		const usersWithIdentityGuard = await db
			.select({ count: notes.userId })
			.from(notes)
			.where(eq(notes.name, 'Identity Guard Pattern'))
			.groupBy(notes.userId)

		// Get the actual note count
		const identityGuardNotes = await db
			.select({
				count: notes.id,
				userId: notes.userId,
				userName: user.name,
				userEmail: user.email,
				userIsAnonymous: user.isAnonymous,
				createdAt: notes.createdAt,
				pinned: notes.pinned,
				favorite: notes.favorite
			})
			.from(notes)
			.leftJoin(user, eq(notes.userId, user.id))
			.where(eq(notes.name, 'Identity Guard Pattern'))

		return NextResponse.json({
			totalUsers: totalUsers.length,
			usersWithIdentityGuardNote: usersWithIdentityGuard.length,
			totalIdentityGuardNotes: identityGuardNotes.length,
			notes: identityGuardNotes.map((note) => ({
				userId: note.userId,
				userName: note.userName,
				userEmail: note.userEmail,
				isAnonymous: note.userIsAnonymous,
				createdAt: note.createdAt,
				isPinned: note.pinned === 1,
				isFavorite: note.favorite === 1
			}))
		})
	} catch (error) {
		console.error('Failed to get Identity Guard seeding stats:', error)
		return NextResponse.json(
			{
				success: false,
				message: 'Failed to get seeding statistics',
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		)
	}
}
