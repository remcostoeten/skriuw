import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, notes, folders, getSafeTimestamp } from '@skriuw/db'
import { Item } from '@/features/notes/types'
import { allowReadAccess, requireMutation } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
    try {
        // Allow imports for both authenticated users and guests
        const userId = await allowReadAccess()

        const { items } = await request.json()
        const db = getDatabase()
        const now = getSafeTimestamp()

        // Recursive function to insert items
        async function insertItem(item: Item) {
            if (item.type === 'folder') {
                await db.insert(folders).values({
                    id: item.id,
                    name: item.name,
                    parentFolderId: item.parentFolderId || null,
                    pinned: item.pinned ? 1 : 0,
                    pinnedAt: item.pinnedAt || null,
                    createdAt: item.createdAt || now,
                    updatedAt: item.updatedAt || now,
                    type: 'folder',
                    userId, // Attach to authenticated user
                }).onConflictDoUpdate({
                    target: folders.id,
                    set: {
                        name: item.name,
                        parentFolderId: item.parentFolderId || null,
                        updatedAt: now,
                    }
                })

                if (item.children) {
                    for (const child of item.children) {
                        await insertItem(child)
                    }
                }
            } else {
                await db.insert(notes).values({
                    id: item.id,
                    name: item.name,
                    content: JSON.stringify(item.content),
                    parentFolderId: item.parentFolderId || null,
                    pinned: item.pinned ? 1 : 0,
                    pinnedAt: item.pinnedAt || null,
                    favorite: item.favorite ? 1 : 0,
                    createdAt: item.createdAt || now,
                    updatedAt: item.updatedAt || now,
                    type: 'note',
                    userId, // Attach to authenticated user
                }).onConflictDoUpdate({
                    target: notes.id,
                    set: {
                        name: item.name,
                        content: JSON.stringify(item.content),
                        parentFolderId: item.parentFolderId || null,
                        updatedAt: now,
                    }
                })
            }
        }

        for (const item of items) {
            await insertItem(item)
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Import failed:', error)
        return NextResponse.json(
            { error: 'Import failed', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        )
    }
}
