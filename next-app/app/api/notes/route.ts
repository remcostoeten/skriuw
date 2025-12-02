import { NextRequest, NextResponse } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import { getDatabase, notes, folders, tasks } from '@/lib/db'
import { getSafeTimestamp } from '@/lib/db/timestamps'
import type { Item, Note, Folder } from '@/features/notes/types'

type NoteRow = typeof notes.$inferSelect
type FolderRow = typeof folders.$inferSelect

function createParagraphFromText(text: string): Note['content'] {
	const trimmed = text.trim()

	return [
		{
			id: `legacy-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			type: 'paragraph',
			props: {
				backgroundColor: 'default',
				textColor: 'default',
				textAlignment: 'left',
			},
			content: trimmed
				? [
						{
							type: 'text',
							text: trimmed,
							styles: {},
						},
					]
				: [],
			children: [],
		},
	]
}

function parseContent(raw: string | null): Note['content'] {
	if (!raw) return []

	const trimmed = raw.trim()
	if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
		return []
	}

	const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[')
	if (!looksLikeJson) {
		return createParagraphFromText(trimmed)
	}

	try {
		const parsed = JSON.parse(trimmed)

		if (Array.isArray(parsed)) {
			return parsed
		}

		if (parsed && typeof parsed === 'object') {
			return [parsed as Note['content'][number]]
		}

		if (typeof parsed === 'string') {
			return createParagraphFromText(parsed)
		}

		return []
	} catch (error) {
		console.warn('Failed to parse note content, falling back to paragraph block:', error)
		return createParagraphFromText(trimmed)
	}
}

function deserializeNote(row: NoteRow): Note {
	return {
		id: row.id,
		name: row.name,
		content: parseContent(row.content),
		parentFolderId: row.parentFolderId ?? undefined,
		pinned: row.pinned === 1,
		pinnedAt: row.pinnedAt ?? undefined,
		favorite: row.favorite === 1,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		type: 'note',
	}
}

function deserializeFolder(row: FolderRow): Folder {
	return {
		id: row.id,
		name: row.name,
		type: 'folder',
		parentFolderId: row.parentFolderId ?? undefined,
		pinned: row.pinned === 1,
		pinnedAt: row.pinnedAt ?? undefined,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		children: [],
	}
}

function sortItems(items: Item[]): Item[] {
	const comparator = (a: Item, b: Item) => {
		const pinnedA = a.pinned ? 1 : 0
		const pinnedB = b.pinned ? 1 : 0
		if (pinnedA !== pinnedB) return pinnedB - pinnedA

		const updatedA = a.updatedAt ?? 0
		const updatedB = b.updatedAt ?? 0
		if (updatedA !== updatedB) return updatedB - updatedA

		return a.name.localeCompare(b.name)
	}

	const sorted = [...items].sort(comparator)
	for (const item of sorted) {
		if (item.type === 'folder' && item.children) {
			item.children = sortItems(item.children)
		}
	}
	return sorted
}

function buildItemTree(noteRows: NoteRow[], folderRows: FolderRow[]) {
	const folderMap = new Map<string, Folder>()
	const itemMap = new Map<string, Item>()
	const roots: Item[] = []

	folderRows.forEach((row) => {
		const folder = deserializeFolder(row)
		folderMap.set(folder.id, folder)
		itemMap.set(folder.id, folder)
	})

	const noteItems = noteRows.map((row) => {
		const note = deserializeNote(row)
		itemMap.set(note.id, note)
		return note
	})

	const attach = (parentId: string | null | undefined, child: Item) => {
		if (parentId && folderMap.has(parentId)) {
			folderMap.get(parentId)!.children.push(child)
		} else {
			roots.push(child)
		}
	}

	folderRows.forEach((row) => {
		const folder = folderMap.get(row.id)
		if (folder) {
			attach(row.parentFolderId, folder)
		}
	})

	noteItems.forEach((note) => {
		attach(note.parentFolderId, note)
	})

	return {
		items: sortItems(roots),
		map: itemMap,
	}
}

function generateId(prefix: 'note' | 'folder') {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

async function getAllRows(db: ReturnType<typeof getDatabase>) {
	const [noteRows, folderRows] = await Promise.all([
		db.select().from(notes),
		db.select().from(folders),
	])
	return { noteRows, folderRows }
}

// GET /api/notes - Returns the full item tree or a single item
export async function GET(request: NextRequest) {
	try {
		const db = getDatabase()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		const { noteRows, folderRows } = await getAllRows(db)
		const tree = buildItemTree(noteRows, folderRows)

		if (id) {
			const item = tree.map.get(id)
			if (!item) {
				return NextResponse.json({ error: 'Item not found' }, { status: 404 })
			}
			return NextResponse.json(item)
		}

		return NextResponse.json(tree.items)
	} catch (error) {
		console.error('Database error:', error)
		const errorMessage = error instanceof Error ? error.message : String(error)

		if (errorMessage.includes('does not exist') || errorMessage.includes('relation')) {
			return NextResponse.json(
				{
					error: 'Database schema not initialized',
					message: 'Run: pnpm db:push',
					hint: 'The schema needs to be pushed to the database.',
				},
				{ status: 500 }
			)
		}

		return NextResponse.json(
			{ error: 'Failed to fetch items', message: errorMessage },
			{ status: 500 }
		)
	}
}

// POST /api/notes - Creates a note or folder
export async function POST(request: NextRequest) {
	try {
		const db = getDatabase()
		const body = await request.json()
		const type = body.type === 'folder' ? 'folder' : 'note'
		const now = getSafeTimestamp()

		if (!body.name || typeof body.name !== 'string') {
			return NextResponse.json({ error: 'Name is required' }, { status: 400 })
		}

		if (type === 'folder') {
			const id = body.id ?? generateId('folder')
			const [created] = await db
				.insert(folders)
				.values({
					id,
					name: body.name,
					parentFolderId: body.parentFolderId ?? null,
					pinned: body.pinned ? 1 : 0,
					pinnedAt: body.pinned ? now : null,
					createdAt: now,
					updatedAt: now,
					type: 'folder',
				})
				.returning()

			return NextResponse.json(deserializeFolder(created), { status: 201 })
		}

		const id = body.id ?? generateId('note')
		const [created] = await db
			.insert(notes)
			.values({
				id,
				name: body.name,
				content: JSON.stringify(body.content ?? []),
				parentFolderId: body.parentFolderId ?? null,
				pinned: body.pinned ? 1 : 0,
				pinnedAt: body.pinned ? now : null,
				favorite: body.favorite ? 1 : 0,
				createdAt: now,
				updatedAt: now,
				type: 'note',
			})
			.returning()

		return NextResponse.json(deserializeNote(created), { status: 201 })
	} catch (error) {
		console.error('Database error:', error)
		const errorMessage = error instanceof Error ? error.message : String(error)
		return NextResponse.json(
			{ error: 'Failed to create item', message: errorMessage },
			{ status: 500 }
		)
	}
}

// PUT /api/notes - Updates a note or folder
export async function PUT(request: NextRequest) {
	try {
		const db = getDatabase()
		const body = await request.json()
		const { id, ...updates } = body

		if (!id || typeof id !== 'string') {
			return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
		}

		const now = getSafeTimestamp()
		const noteUpdate: Partial<typeof notes.$inferInsert> = {}
		const folderUpdate: Partial<typeof folders.$inferInsert> = {}

		if (updates.name !== undefined) {
			noteUpdate.name = updates.name
			folderUpdate.name = updates.name
		}

		if (updates.content !== undefined) {
			noteUpdate.content = JSON.stringify(updates.content ?? [])
		}

		if (updates.parentFolderId !== undefined) {
			noteUpdate.parentFolderId = updates.parentFolderId ?? null
			folderUpdate.parentFolderId = updates.parentFolderId ?? null
		}

		if (updates.pinned !== undefined) {
			const pinned = Boolean(updates.pinned)
			noteUpdate.pinned = pinned ? 1 : 0
			noteUpdate.pinnedAt = pinned ? now : null
			folderUpdate.pinned = pinned ? 1 : 0
			folderUpdate.pinnedAt = pinned ? now : null
		}

		if (updates.favorite !== undefined) {
			noteUpdate.favorite = updates.favorite ? 1 : 0
		}

		if (Object.keys(noteUpdate).length > 0) {
			noteUpdate.updatedAt = now
		}
		if (Object.keys(folderUpdate).length > 0) {
			folderUpdate.updatedAt = now
		}

		let updatedItem: Item | undefined

		if (Object.keys(noteUpdate).length > 0) {
			const updated = await db.update(notes).set(noteUpdate).where(eq(notes.id, id)).returning()

			if (updated.length > 0) {
				updatedItem = deserializeNote(updated[0])
			}
		}

		if (!updatedItem && Object.keys(folderUpdate).length > 0) {
			const updated = await db
				.update(folders)
				.set(folderUpdate)
				.where(eq(folders.id, id))
				.returning()

			if (updated.length > 0) {
				updatedItem = deserializeFolder(updated[0])
			}
		}

		if (!updatedItem) {
			return NextResponse.json({ error: 'Item not found' }, { status: 404 })
		}

		return NextResponse.json(updatedItem)
	} catch (error) {
		console.error('Database error:', error)
		const errorMessage = error instanceof Error ? error.message : String(error)
		return NextResponse.json(
			{ error: 'Failed to update item', message: errorMessage },
			{ status: 500 }
		)
	}
}

async function deleteFolderWithDescendants(db: ReturnType<typeof getDatabase>, folderId: string) {
	const { noteRows, folderRows } = await getAllRows(db)
	const descendantFolders = new Set<string>([folderId])
	const descendantNotes = new Set<string>()

	const collect = (currentId: string) => {
		folderRows
			.filter((folder) => folder.parentFolderId === currentId)
			.forEach((folder) => {
				if (!descendantFolders.has(folder.id)) {
					descendantFolders.add(folder.id)
					collect(folder.id)
				}
			})

		noteRows
			.filter((note) => note.parentFolderId === currentId)
			.forEach((note) => descendantNotes.add(note.id))
	}

	collect(folderId)

	const noteIds = Array.from(descendantNotes)
	if (noteIds.length > 0) {
		await db.delete(tasks).where(inArray(tasks.noteId, noteIds))

		await db.delete(notes).where(inArray(notes.id, noteIds))
	}

	await db.delete(folders).where(inArray(folders.id, Array.from(descendantFolders)))
}

// DELETE /api/notes?id=xxx - Delete a note or folder
export async function DELETE(request: NextRequest) {
	try {
		const db = getDatabase()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
		}

		const deletedNote = await db.delete(notes).where(eq(notes.id, id)).returning()

		if (deletedNote.length > 0) {
			await db.delete(tasks).where(eq(tasks.noteId, id))
			return NextResponse.json(deserializeNote(deletedNote[0]))
		}

		const folderRecord = await db.select().from(folders).where(eq(folders.id, id)).limit(1)

		if (folderRecord.length === 0) {
			return NextResponse.json({ error: 'Item not found' }, { status: 404 })
		}

		await deleteFolderWithDescendants(db, id)

		return NextResponse.json(deserializeFolder(folderRecord[0]))
	} catch (error) {
		console.error('Database error:', error)
		const errorMessage = error instanceof Error ? error.message : String(error)
		return NextResponse.json(
			{ error: 'Failed to delete item', message: errorMessage },
			{ status: 500 }
		)
	}
}
