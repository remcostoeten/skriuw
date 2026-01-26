import { auth } from '@/lib/auth'
import { getDatabase, eq, and, desc } from '@skriuw/db'
import { headers } from 'next/headers'
import { type PgTable } from 'drizzle-orm/pg-core'

/**
 * Validates authentication and returns the session.
 * Throws if unauthorized.
 */
export async function requireAuth() {
    const session = await auth.api.getSession({
        headers: await headers()
    })

    if (!session?.user) {
        throw new Error('Unauthorized')
    }

    return session
}

/**
 * Generic destroy operation for user-owned entities.
 * Enforces `where id = ? AND userId = ?`.
 */
export async function destroyOwned(table: any, id: string) {
    const session = await requireAuth()
    const db = getDatabase()

    return await db
        .delete(table)
        .where(
            and(
                eq(table.id, id),
                eq(table.userId, session.user.id)
            )
        )
}

/**
 * Generic read operation for user-owned entities.
 * Enforces `where userId = ?`.
 * Default sort: createdAt desc.
 */
export async function readOwned<T>(table: any) {
    const session = await requireAuth()
    const db = getDatabase()

    return await db
        .select()
        .from(table)
        .where(eq(table.userId, session.user.id))
        .orderBy(desc(table.createdAt))
}
