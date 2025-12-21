import { getDatabase, notes, folders, seedTemplateNotes, seedTemplateFolders } from '@skriuw/db'
import { eq } from 'drizzle-orm'
import { seedUserWithIdentityGuide } from './seed-user-with-identity-guide'

/**
 * Seeds a new user with the template notes and folders defined by admins.
 * Creates copies of all seed templates for the user's account.
 */
export async function seedNewUser(userId: string): Promise<void> {
    const db = getDatabase()
    const now = Date.now()

    // Get all seed template folders
    const templateFolders = await db.select().from(seedTemplateFolders).orderBy(seedTemplateFolders.order)

    // Get all seed template notes
    const templateNotes = await db.select().from(seedTemplateNotes).orderBy(seedTemplateNotes.order)

    // Map old folder IDs to new folder IDs for parent references
    const folderIdMap = new Map<string, string>()

    // Create folders first (to get new IDs for parent references)
    for (const templateFolder of templateFolders) {
        const newId = crypto.randomUUID()
        folderIdMap.set(templateFolder.id, newId)

        // Resolve parent folder ID (may be null or reference another template folder)
        const newParentId = templateFolder.parentFolderId
            ? folderIdMap.get(templateFolder.parentFolderId) ?? null
            : null

        await db.insert(folders).values({
            id: newId,
            name: templateFolder.name,
            parentFolderId: newParentId,
            userId,
            pinned: 0,
            createdAt: now,
            updatedAt: now,
            type: 'folder',
        })
    }

    // Create notes with updated folder references
    for (const templateNote of templateNotes) {
        const newId = crypto.randomUUID()

        // Resolve parent folder ID
        const newParentId = templateNote.parentFolderId
            ? folderIdMap.get(templateNote.parentFolderId) ?? null
            : null

        await db.insert(notes).values({
            id: newId,
            name: templateNote.name,
            content: templateNote.content,
            parentFolderId: newParentId,
            userId,
            pinned: templateNote.pinned ?? 0,
            createdAt: now,
            updatedAt: now,
            type: 'note',
        })
    }

    // Seed the Identity Guard knowledge note for all new users
    await seedUserWithIdentityGuide(userId)
}

/**
 * Check if a user has been seeded (has any notes).
 * Used to determine if we should seed on first login.
 */
export async function userNeedsSeeding(userId: string): Promise<boolean> {
    const db = getDatabase()
    const existingNotes = await db
        .select({ id: notes.id })
        .from(notes)
        .where(eq(notes.userId, userId))
        .limit(1)

    return existingNotes.length === 0
}
