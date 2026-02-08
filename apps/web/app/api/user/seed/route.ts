import { auth } from '@/lib/auth'
import {
	getDatabase,
	seedTemplateFolders,
	seedTemplateNotes,
	folders,
	notes,
	eq,
	sql
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
		const result = await db.transaction(async (tx) => {
			// Prevent double-seeding for concurrent requests/tabs for the same user.
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`)

			const [existingNote, existingFolder] = await Promise.all([
				tx.select({ id: notes.id }).from(notes).where(eq(notes.userId, userId)).limit(1),
				tx.select({ id: folders.id }).from(folders).where(eq(folders.userId, userId)).limit(1)
			])

			// Idempotent behavior: never overwrite existing user data.
			if (existingNote.length > 0 || existingFolder.length > 0) {
				return { seeded: false as const, reason: 'already_seeded' as const }
			}

			const [templateFolders, templateNotes] = await Promise.all([
				tx.select().from(seedTemplateFolders).orderBy(seedTemplateFolders.order),
				tx.select().from(seedTemplateNotes).orderBy(seedTemplateNotes.order)
			])

			if (templateFolders.length === 0 && templateNotes.length === 0) {
				return { seeded: false as const, reason: 'no_templates' as const }
			}

			const now = Date.now()
			const folderIdMap = new Map<string, string>()

			for (let i = 0; i < templateFolders.length; i++) {
				const template = templateFolders[i]
				const newFolderId = crypto.randomUUID()
				folderIdMap.set(template.id, newFolderId)

				const timestamp = now + i

				await tx.insert(folders).values({
					id: newFolderId,
					name: template.name,
					parentFolderId: null,
					userId,
					pinned: 0,
					pinnedAt: null,
					createdAt: timestamp,
					updatedAt: timestamp,
					type: 'folder'
				})
			}

			for (let i = 0; i < templateFolders.length; i++) {
				const template = templateFolders[i]
				const newFolderId = folderIdMap.get(template.id)
				if (!newFolderId) continue

				const parentFolderId = template.parentFolderId
					? (folderIdMap.get(template.parentFolderId) ?? null)
					: null

				await tx.update(folders).set({ parentFolderId }).where(eq(folders.id, newFolderId))
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

			return {
				seeded: true as const,
				created: {
					folders: templateFolders.length,
					notes: templateNotes.length
				}
			}
		})

		return NextResponse.json(result)
	} catch (error) {
		console.error('Failed to seed user from templates', error)
		return NextResponse.json(
			{ seeded: false, error: 'Failed to seed user' },
			{ status: 500 }
		)
	}
}
