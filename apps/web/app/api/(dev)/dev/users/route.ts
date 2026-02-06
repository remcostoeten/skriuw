import { getDatabase, schema } from '@skriuw/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
	try {
		const db = getDatabase()
		const now = new Date()
		const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

		// Get all users with counts
		const allUsers = await db.query.user.findMany({
			columns: {
				id: true,
				isAnonymous: true,
				createdAt: true,
				email: true,
				name: true
			},
			orderBy: (user, { desc }) => [desc(user.createdAt)]
		})

		// Calculate statistics
		const totalUsers = allUsers.length
		const anonymousUsers = allUsers.filter((u) => u.isAnonymous).length
		const anonymousUsersOld = allUsers.filter(
			(u) => u.isAnonymous && new Date(u.createdAt) < twentyFourHoursAgo
		).length

		return NextResponse.json({
			users: allUsers,
			stats: {
				totalUsers,
				anonymousUsers,
				anonymousUsersOld
			}
		})
	} catch (error) {
		console.error('Failed to fetch users:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch users', details: (error as Error).message },
			{ status: 500 }
		)
	}
}
