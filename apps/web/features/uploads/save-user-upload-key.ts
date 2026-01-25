'use server'

import { getDatabase, settings, eq, and } from '@skriuw/db'

import { encryptSecret } from '@/lib/crypto/secret'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { nanoid } from 'nanoid'

const UPLOAD_KEY_SETTING = 'uploadthing_token'

export async function saveUserUploadKey(token: string): Promise<{ success: boolean; error?: string }> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' }
    }

    const db = getDatabase()
    const userId = session.user.id
    const now = Date.now()

    try {
        const encrypted = encryptSecret(token)

        const existing = await db
            .select({ id: settings.id })
            .from(settings)
            .where(and(eq(settings.userId, userId), eq(settings.key, UPLOAD_KEY_SETTING)))
            .limit(1)

        if (existing.length > 0) {
            await db
                .update(settings)
                .set({ value: encrypted, updatedAt: now })
                .where(eq(settings.id, existing[0].id))
        } else {
            await db.insert(settings).values({
                id: nanoid(),
                key: UPLOAD_KEY_SETTING,
                value: encrypted,
                userId,
                createdAt: now,
                updatedAt: now
            })
        }

        return { success: true }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { success: false, error: message }
    }
}

export async function clearUserUploadKey(): Promise<{ success: boolean; error?: string }> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' }
    }

    const db = getDatabase()

    try {
        await db
            .delete(settings)
            .where(and(eq(settings.userId, session.user.id), eq(settings.key, UPLOAD_KEY_SETTING)))

        return { success: true }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { success: false, error: message }
    }
}
