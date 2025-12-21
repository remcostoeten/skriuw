import { getDatabase, notes } from '@skriuw/db'
import { eq } from 'drizzle-orm'
import { identityGuardNoteContent } from './seed-content/identity-guard-content'

/**
 * Seeds the Identity Guard knowledge note to a specific user
 * Call this after user registration or when creating a new user
 */
export async function seedUserWithIdentityGuide(userId: string): Promise<boolean> {
  try {
    const db = getDatabase()
    const now = Date.now()

    // Check if user already has an Identity Guard note
    const existingNote = await db
      .select({ id: notes.id })
      .from(notes)
      .where(eq(notes.name, 'Identity Guard Pattern'))
      .limit(1)

    if (existingNote.length > 0) {
      console.log(`⏭️  User ${userId} already has Identity Guard note`)
      return true
    }

    // Create the Identity Guard note for this user
    const noteId = crypto.randomUUID()

    await db.insert(notes).values({
      id: noteId,
      name: 'Identity Guard Pattern',
      content: JSON.stringify(identityGuardNoteContent),
      userId,
      parentFolderId: null, // Root level note
      pinned: 1, // Pin it so it's visible
      pinnedAt: now,
      favorite: 1, // Mark as favorite for easy access
      createdAt: now,
      updatedAt: now,
      type: 'note'
    })

    console.log(`✅ Seeded Identity Guard note for user: ${userId}`)
    return true

  } catch (error) {
    console.error(`❌ Failed to seed Identity Guard note for user ${userId}:`, error)
    return false
  }
}

/**
 * Check if a user already has the Identity Guard note
 */
export async function userHasIdentityGuide(userId: string): Promise<boolean> {
  try {
    const db = getDatabase()

    const existingNote = await db
      .select({ id: notes.id })
      .from(notes)
      .where(eq(notes.name, 'Identity Guard Pattern'))
      .limit(1)

    return existingNote.length > 0

  } catch (error) {
    console.error(`Failed to check if user ${userId} has Identity Guard note:`, error)
    return false
  }
}