import { NextResponse } from 'next/server'
import { getDatabase, schema } from '@skriuw/db'
import { eq, and, lt, inArray } from 'drizzle-orm'
import { Env as env } from '../../../../lib/env'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
	try {
		// Verify authorization via Bearer token or Vercel Cron header
		const authHeader = request.headers.get('authorization')
		const isVercelCron = request.headers.get('vercel-cron') === 'true'
		const isValidBearer = authHeader === `Bearer ${env.CRON_SECRET}`
		const isDevBearer =
			env.NODE_ENV === 'development' &&
			authHeader === `Bearer dev-cleanup-secret`

		if (!isVercelCron && !isValidBearer && !isDevBearer) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		return await cleanupProcess(false)
	} catch (error) {
		console.error('Cleanup failed:', error)
		return NextResponse.json(
			{ error: 'Cleanup failed', details: (error as Error).message },
			{ status: 500 }
		)
	}
}

export async function POST(request: Request) {
	try {
		// Verify authorization via Bearer token or Vercel Cron header
		const authHeader = request.headers.get('authorization')
		const isVercelCron = request.headers.get('vercel-cron') === 'true'
		const isValidBearer = authHeader === `Bearer ${env.CRON_SECRET}`
		const isDevBearer =
			env.NODE_ENV === 'development' &&
			authHeader === `Bearer dev-cleanup-secret`

		if (!isVercelCron && !isValidBearer && !isDevBearer) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const body = await request.json().catch(() => ({}))
		const dryRun = body.dryRun === true

		return await cleanupProcess(dryRun)
	} catch (error) {
		console.error('Cleanup failed:', error)
		return NextResponse.json(
			{ error: 'Cleanup failed', details: (error as Error).message },
			{ status: 500 }
		)
	}
}

async function cleanupProcess(dryRun: boolean) {
	try {
		const db = getDatabase()
		const now = new Date()
		const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

		// Find anonymous users created more than 24 hours ago
		const usersToDelete = await db.query.user.findMany({
			where: and(
				eq(schema.user.isAnonymous, true),
				lt(schema.user.createdAt, twentyFourHoursAgo)
			),
			columns: {
				id: true
			}
		})

		if (usersToDelete.length === 0) {
			return NextResponse.json({
				message: dryRun
					? 'No users to cleanup (dry run)'
					: 'No users to cleanup',
				deletedCount: 0,
				dryRun,
				timestamp: now.toISOString()
			})
		}

		// Delete users - cascading deletes will handle related data
		const ids = usersToDelete.map((u) => u.id)
		let deletedCount = 0

		if (!dryRun) {
			// Delete in batches of 100 to be safe
			const batchSize = 100

			for (let i = 0; i < ids.length; i += batchSize) {
				const batch = ids.slice(i, i + batchSize)
				await db
					.delete(schema.user)
					.where(inArray(schema.user.id, batch))
				deletedCount += batch.length
			}
		} else {
			deletedCount = ids.length // For dry run, just count what would be deleted
		}

		return NextResponse.json({
			message: dryRun ? 'Dry run completed' : 'Cleanup successful',
			deletedCount,
			dryRun,
			timestamp: now.toISOString()
		})
	} catch (error) {
		console.error('Cleanup failed:', error)
		return NextResponse.json(
			{ error: 'Cleanup failed', details: (error as Error).message },
			{ status: 500 }
		)
	}
}
