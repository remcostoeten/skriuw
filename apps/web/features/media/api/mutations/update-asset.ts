'use server'

import { files, getDatabase, eq, and } from '@skriuw/db'
import { requireMutation } from '@/lib/api-auth'

export async function updateAsset(id: string, data: { name?: string; isPublic?: boolean }) {
    const auth = await requireMutation()
    if (!auth.authenticated) throw new Error('Unauthorized')

    const { userId } = auth
    const db = getDatabase()

    await db
        .update(files)
        .set({
            ...data,
            // Only update metadata, not the core file info
        })
        .where(and(eq(files.id, id), eq(files.userId, userId)))
}
