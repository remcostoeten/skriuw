import { auth } from '@/lib/auth'
import {
	getDatabase,
	seedTemplateFolders,
	seedTemplateNotes,
	folders,
	notes,
	eq
} from '@skriuw/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
	const session = await auth?.api.getSession({ headers: request.headers })
	if (!session?.user?.id) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const userId = session.user.id
	const db = getDatabase()

	try {
		const [existingNote, existingFolder] = await Promise.all([
			db.select({ id: notes.id }).from(notes).where(eq(notes.userId, userId)).limit(1),
			db.select({ id: folders.id }).from(folders).where(eq(folders.userId, userId)).limit(1)
		])

		// Idempotent behavior: never overwrite existing user data.
		if (existingNote.length > 0 || existingFolder.length > 0) {
			return NextResponse.json({ seeded: false, reason: 'already_seeded' })
		}

		const [templateFolders, templateNotes] = await Promise.all([
			db.select().from(seedTemplateFolders).orderBy(seedTemplateFolders.order),
			db.select().from(seedTemplateNotes).orderBy(seedTemplateNotes.order)
		])

		if (templateFolders.length === 0 && templateNotes.length === 0) {
			return NextResponse.json({ seeded: false, reason: 'no_templates' })
		}

		const now = Date.now()
		const folderIdMap = new Map<string, string>()

		await db.transaction(async (tx) => {
			for (let i = 0; i < templateFolders.length; i++) {
				const template = templateFolders[i]
				const newFolderId = crypto.randomUUID()
				folderIdMap.set(template.id, newFolderId)

				const parentFolderId = template.parentFolderId
					? (folderIdMap.get(template.parentFolderId) ?? null)
					: null
				const timestamp = now + i

				await tx.insert(folders).values({
					id: newFolderId,
					name: template.name,
					parentFolderId,
					userId,
					pinned: 0,
					pinnedAt: null,
					createdAt: timestamp,
					updatedAt: timestamp,
					type: 'folder'
				})
			}

			for (let i = 0; i < templateNotes.length; i++) {
				const template = templateNotes[i]
				const parentFolderId = template.parentFolderId
					? (folderIdMap.get(template.parentFolderId) ?? null)
					: null
				const timestamp = now + templateFolders.length + i
				const pinned = template.pinned === 1

				await tx.insert(notes).values({
					id: crypto.randomUUID(),
					name: template.name,
					content: template.content,
					parentFolderId,
					userId,
					pinned: pinned ? 1 : 0,
					pinnedAt: pinned ? timestamp : null,
					favorite: 0,
					createdAt: timestamp,
					updatedAt: timestamp,
					type: 'note'
				})
			}
		})

		return NextResponse.json({
			seeded: true,
			created: {
				folders: templateFolders.length,
				notes: templateNotes.length
			}
		})
	} catch (error) {
		console.error('Failed to seed user from templates', error)
		return NextResponse.json(
			{
				seeded: false,
				error: 'Failed to seed user',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		)
	}
}
