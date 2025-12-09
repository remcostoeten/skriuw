import { NextResponse } from 'next/server'
import { getDatabase, schema } from '@skriuw/db'
import { eq, and, lt, inArray } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        // Verify authorization (e.g. via Vercel Cron header or secret)
        const authHeader = request.headers.get('authorization')
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            // Allow if it's a Vercel Cron request
            // const isVercelCron = request.headers.get('vercel-cron') === 'true';
            // if (!isVercelCron) {
            //     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            // }
        }

        const db = getDatabase()
        const now = new Date()
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

        // Find anonymous users created more than 24 hours ago
        // We check for isAnonymous = true and createdAt < 24h ago
        const usersToDelete = await db.query.user.findMany({
            where: and(
                eq(schema.user.isAnonymous, true),
                lt(schema.user.createdAt, twentyFourHoursAgo)
            ),
            columns: {
                id: true,
            },
        })

        if (usersToDelete.length === 0) {
            return NextResponse.json({ message: 'No users to cleanup', count: 0 })
        }

        // Delete users - cascading deletes will handle related data
        // We do this in a transaction or batch if possible, but for now simple loop or IN clause
        // Drizzle delete with IN clause:
        const ids = usersToDelete.map(u => u.id)

        // Delete in batches of 100 to be safe
        const batchSize = 100
        let deletedCount = 0

        for (let i = 0; i < ids.length; i += batchSize) {
            const batch = ids.slice(i, i + batchSize)
            await db.delete(schema.user).where(inArray(schema.user.id, batch))
            deletedCount += batch.length
        }

        return NextResponse.json({
            message: 'Cleanup successful',
            deletedCount,
            timestamp: now.toISOString(),
        })
    } catch (error) {
        console.error('Cleanup failed:', error)
        return NextResponse.json(
            { error: 'Cleanup failed', details: (error as Error).message },
            { status: 500 }
        )
    }
}
