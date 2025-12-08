import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../lib/storage/adapters/server-db'
import type { Item, Note, Folder } from '../../../features/notes/types/index'

function sortItems(items: Item[]): Item[] {
	const comparator = (a: Item, b: Item) => {
		if (a.pinned !== b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
		if (a.updatedAt !== b.updatedAt) return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
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

function buildTree(notes: Note[], folders: Folder[]): Item[] {
	const folderMap = new Map<string, Folder>()
	folders.forEach(f => folderMap.set(f.id, { ...f, children: [] }))

	const roots: Item[] = []

	folders.forEach(f => {
		const folder = folderMap.get(f.id)!
		if (f.parentFolderId && folderMap.has(f.parentFolderId)) {
			folderMap.get(f.parentFolderId)!.children.push(folder)
		} else {
			roots.push(folder)
		}
	})

	notes.forEach(n => {
		if (n.parentFolderId && folderMap.has(n.parentFolderId)) {
			folderMap.get(n.parentFolderId)!.children.push(n)
		} else {
			roots.push(n)
		}
	})

	return sortItems(roots)
}

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		const [notes, folders] = await Promise.all([
			db.findAll<Note>('notes'),
			db.findAll<Folder>('folders')
		])

		if (id) {
			const item = [...notes, ...folders].find(i => i.id === id)
			if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
			return NextResponse.json(item)
		}

		return NextResponse.json(buildTree(notes, folders))
	} catch (error) {
		console.error('API Error:', error)
		return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json()
		if (!body.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

		const now = Date.now()
		const type = body.type === 'folder' ? 'folder' : 'note'
		const table = type === 'folder' ? 'folders' : 'notes'

		const data = {
			...body,
			type,
			createdAt: now,
			updatedAt: now,
		}

		const created = await db.create(table, data)
		return NextResponse.json(created, { status: 201 })
	} catch (error) {
		console.error('API Error:', error)
		return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
	}
}

export async function PUT(request: NextRequest) {
	try {
		const body = await request.json()
		const { id, ...updates } = body
		if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

		updates.updatedAt = Date.now()

		let result = await db.update('notes', id, updates)
		if (!result) result = await db.update('folders', id, updates)
		if (!result) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

		return NextResponse.json(result)
	} catch (error) {
		console.error('API Error:', error)
		return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
	}
}

export async function DELETE(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')
		if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

		let deleted = await db.delete('notes', id)
		if (!deleted) deleted = await db.delete('folders', id)
		if (!deleted) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

		return NextResponse.json({ id, success: true })
	} catch (error) {
		console.error('API Error:', error)
		return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
	}
}
