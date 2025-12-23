import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../lib/storage/adapters/server-db'
import {
	requireMutation,
	allowReadAccess,
	GUEST_USER_ID
} from '../../../lib/api-auth'
import type { Item, Note, Folder } from '@/features/notes/types/index'

function createPublicId() {
	return `pub_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

async function hasCloudStorage(userId: string): Promise<boolean> {
	const connectors = await db.findAll<{ id: string }>('storageConnectors', userId)
	return connectors.length > 0
}

function sortItems(items: Item[]): Item[] {
	const comparator = (a: Item, b: Item) => {
		if (a.pinned !== b.pinned)
			return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
		if (a.updatedAt !== b.updatedAt)
			return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
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
	folders.forEach((f) => folderMap.set(f.id, { ...f, children: [] }))

	const roots: Item[] = []

	folders.forEach((f) => {
		const folder = folderMap.get(f.id)!
		if (f.parentFolderId && folderMap.has(f.parentFolderId)) {
			folderMap.get(f.parentFolderId)!.children.push(folder)
		} else {
			roots.push(folder)
		}
	})

	notes.forEach((n) => {
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
		// Allow read access for everyone (guests get GUEST_USER_ID)
		const userId = await allowReadAccess()
		const isGuest = userId === GUEST_USER_ID

		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		// For guests, return demo/seed data (scoped to GUEST_USER_ID)
		// For authenticated users, return their own data
		const [notes, folders] = await Promise.all([
			db.findAll<Note>('notes', userId),
			db.findAll<Folder>('folders', userId)
		])

		// If guest and no data exists, they'll see empty - seed data should be pre-created
		if (id) {
			const item = [...notes, ...folders].find((i) => i.id === id)
			if (!item)
				return NextResponse.json(
					{ error: 'Item not found' },
					{ status: 404 }
				)
			return NextResponse.json(item)
		}

		return NextResponse.json(buildTree(notes, folders))
	} catch (error) {
		console.error('API Error:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch items' },
			{ status: 500 }
		)
	}
}

export async function POST(request: NextRequest) {
	try {
		// Require authentication for mutations
		const auth = await requireMutation()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const body = await request.json()
		if (!body.name)
			return NextResponse.json(
				{ error: 'Name is required' },
				{ status: 400 }
			)

		const now = Date.now()
		const type = body.type === 'folder' ? 'folder' : 'note'
		const table = type === 'folder' ? 'folders' : 'notes'

		const data = {
			...body,
			type,
			createdAt: now,
			updatedAt: now
		}

		// Pass userId to attach to the created entity
		const created = await db.create(table, data, userId)
		return NextResponse.json(created, { status: 201 })
	} catch (error) {
		console.error('API Error:', error)
		return NextResponse.json(
			{ error: 'Failed to create item' },
			{ status: 500 }
		)
	}
}

export async function PUT(request: NextRequest) {
	try {
		// Require authentication for mutations
		const auth = await requireMutation()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

	const body = await request.json()
	const { id, ...updates } = body
	if (!id)
		return NextResponse.json(
			{ error: 'ID is required' },
			{ status: 400 }
		)

	updates.updatedAt = Date.now()

	if (typeof updates.isPublic === 'boolean') {
		const existing = await db.findById<Note>('notes', id, userId)
		if (!existing) {
			return NextResponse.json(
				{ error: 'Item not found' },
				{ status: 404 }
			)
		}

		if (updates.isPublic) {
			const cloudEnabled = await hasCloudStorage(userId)
			if (!cloudEnabled) {
				return NextResponse.json(
					{ error: 'Enable cloud storage to share notes publicly' },
					{ status: 400 }
				)
			}
			if (!existing.publicId) {
				updates.publicId = createPublicId()
			}
		} else {
			updates.isPublic = false
		}
	}

	// Pass userId to ensure user can only update their own items
	let result = await db.update('notes', id, updates, userId)
	if (!result) result = await db.update('folders', id, updates, userId)
	if (!result)
			return NextResponse.json(
				{ error: 'Item not found' },
				{ status: 404 }
			)

		return NextResponse.json(result)
	} catch (error) {
		console.error('API Error:', error)
		return NextResponse.json(
			{ error: 'Failed to update item' },
			{ status: 500 }
		)
	}
}

export async function DELETE(request: NextRequest) {
	try {
		// Require authentication for mutations
		const auth = await requireMutation()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')
		if (!id)
			return NextResponse.json(
				{ error: 'ID is required' },
				{ status: 400 }
			)

		// Pass userId to ensure user can only delete their own items
		let deleted = await db.delete('notes', id, userId)
		if (!deleted) deleted = await db.delete('folders', id, userId)
		if (!deleted)
			return NextResponse.json(
				{ error: 'Item not found' },
				{ status: 404 }
			)

		return NextResponse.json({ id, success: true })
	} catch (error) {
		console.error('API Error:', error)
		return NextResponse.json(
			{ error: 'Failed to delete item' },
			{ status: 500 }
		)
	}
}
