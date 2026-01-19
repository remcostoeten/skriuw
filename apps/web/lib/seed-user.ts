import { getDatabase, notes } from '@skriuw/db'
import { getWelcomeTunnelContent } from './seed-content/welcome-tunnel'

export async function seedNewUser(userId: string): Promise<void> {
    const db = getDatabase()
    const now = Date.now()
    const noteId = crypto.randomUUID()

    await db.insert(notes).values({
        id: noteId,
        name: 'Welcome to Skriuw',
        content: JSON.stringify(getWelcomeTunnelContent()),
        userId,
        parentFolderId: null,
        pinned: 1,
        pinnedAt: now,
        favorite: 0,
        createdAt: now,
        updatedAt: now,
        type: 'note'
    })
}

export async function userNeedsSeeding(userId: string): Promise<boolean> {
    return false
}
