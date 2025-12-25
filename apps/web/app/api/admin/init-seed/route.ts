import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../lib/storage/adapters/server-db'
import { seedTemplateNotes, seedTemplateFolders, notes, folders, user } from '@skriuw/db'
import { sampleNotes, sampleFolders } from '@/app/api/(dev)/dev/seeds'
import { GUEST_USER_ID } from '../../../../lib/api-auth'
import { eq } from 'drizzle-orm'

// This endpoint is administrative - normally you'd protect this with an admin check
// For now, we'll leave it open for development or check for a specific header/secret if needed.
// Given strict instructions, let's assume this is a DEV/ADMIN tool.

async function resetSeedTemplates() {
    const drizzleDb = db.raw()
    const now = Date.now()

    // 1. Clear existing templates
    await drizzleDb.delete(seedTemplateNotes)
    await drizzleDb.delete(seedTemplateFolders)

    const folderMap = new Map<string, string>() // Name -> ID

    // 2. Insert Folders
    let folderOrder = 0
    for (const folderData of sampleFolders) {
        const folderId = crypto.randomUUID()
        folderMap.set(folderData.name, folderId)

        await drizzleDb.insert(seedTemplateFolders).values({
            id: folderId,
            name: folderData.name,
            order: folderOrder++,
            createdAt: now,
            updatedAt: now,
        })

        if (folderData.children) {
            let childOrder = 0
            for (const childName of folderData.children) {
                const childId = crypto.randomUUID()
                folderMap.set(childName, childId) // Allow flat lookup for simplicity

                await drizzleDb.insert(seedTemplateFolders).values({
                    id: childId,
                    name: childName,
                    parentFolderId: folderId,
                    order: childOrder++,
                    createdAt: now,
                    updatedAt: now,
                })
            }
        }
    }

    // 3. Insert Notes
    let noteOrder = 0
    for (const noteData of sampleNotes) {
        const noteId = crypto.randomUUID()

        // Note: sampleNotes currently doesn't have parent folder info in the array
        // If we wanted to put them in folders, we'd need to modify sampleNotes structure
        // For now, we'll put them in root

        await drizzleDb.insert(seedTemplateNotes).values({
            id: noteId,
            name: noteData.name,
            content: JSON.stringify(noteData.content),
            pinned: noteData.pinned ? 1 : 0,
            order: noteOrder++,
            createdAt: now,
            updatedAt: now,
        })
    }
}

async function seedGuestUser() {
    const drizzleDb = db.raw()
    const now = Date.now()
    const guestId = GUEST_USER_ID

    // 0. Ensure Guest User exists (for FK constraints)
    await drizzleDb.insert(user).values({
        id: guestId,
        name: 'Guest User',
        email: 'guest@skriuw.local',
        emailVerified: true,
        isAnonymous: true,
        createdAt: new Date(now),
        updatedAt: new Date(now),
    }).onConflictDoNothing()

    // 1. Wipe existing guest data
    await drizzleDb.delete(notes).where(eq(notes.userId, guestId))
    await drizzleDb.delete(folders).where(eq(folders.userId, guestId))

    // 2. Get fresh templates
    const templatesF = await drizzleDb.select().from(seedTemplateFolders).orderBy(seedTemplateFolders.order)
    const templatesN = await drizzleDb.select().from(seedTemplateNotes).orderBy(seedTemplateNotes.order)

    const idMap = new Map<string, string>()

    // 3. Clone Folders
    for (const tmpl of templatesF) {
        const newId = crypto.randomUUID()
        idMap.set(tmpl.id, newId)

        const newParentId = tmpl.parentFolderId ? idMap.get(tmpl.parentFolderId) ?? null : null

        await drizzleDb.insert(folders).values({
            id: newId,
            name: tmpl.name,
            parentFolderId: newParentId,
            userId: guestId,
            createdAt: now,
            updatedAt: now,
            type: 'folder'
        })
    }

    // 4. Clone Notes
    for (const tmpl of templatesN) {
        const newId = crypto.randomUUID()

        const newParentId = tmpl.parentFolderId ? idMap.get(tmpl.parentFolderId) ?? null : null

        await drizzleDb.insert(notes).values({
            id: newId,
            name: tmpl.name,
            content: tmpl.content, // Already stringified JSON
            parentFolderId: newParentId,
            userId: guestId,
            pinned: tmpl.pinned ?? 0,
            createdAt: now,
            updatedAt: now,
            type: 'note'
        })
    }
}

export async function POST(request: NextRequest) {
    try {
        await resetSeedTemplates()
        await seedGuestUser()

        return NextResponse.json({
            success: true,
            message: 'Templates reset and GUEST_USER_ID seeded.'
        })
    } catch (error) {
        console.error('Seed error:', error)
        return NextResponse.json({
            error: 'Failed to seed templates',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
