import { Elysia, t } from 'elysia'
import { authPlugin } from '../middleware/auth'
import { db } from '../db'
import { GUEST_USER_ID } from '@skriuw/shared'
import type { Item, Note, Folder } from './types'

// ============================================================================
// TYPES
// ============================================================================

export type { Note, Folder, Item }

// ============================================================================
// HELPERS
// ============================================================================

function createPublicId() {
	return `pub_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

async function hasCloudStorage(userId: string): Promise<boolean> {
	const connectors = await db.findAllConnectors<{ id: string }>(userId)
	return connectors.length > 0
}

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

function buildTree(noteItems: Note[], folderItems: Folder[]): Item[] {
	const folderMap = new Map<string, Folder & { children: Item[] }>()
	folderItems.forEach((f) => folderMap.set(f.id, { ...f, children: [] }))

	const roots: Item[] = []

	folderItems.forEach((f) => {
		const folder = folderMap.get(f.id)!
		if (f.parentFolderId && folderMap.has(f.parentFolderId)) {
			folderMap.get(f.parentFolderId)!.children.push(folder)
		} else {
			roots.push(folder)
		}
	})

	noteItems.forEach((n) => {
		if (n.parentFolderId && folderMap.has(n.parentFolderId)) {
			folderMap.get(n.parentFolderId)!.children.push(n)
		} else {
			roots.push(n)
		}
	})

	return sortItems(roots)
}

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

export const notesRoutes = new Elysia({ prefix: '/notes' })
	.use(authPlugin)

	// ------------------------------------------------------------------
	// GET /notes         — list all notes+folders for the current user
	// GET /notes?id=xxx  — fetch a single item by id
	// ------------------------------------------------------------------
	.get(
		'/',
		async ({ userId, query, set }) => {
			try {
				// Guests may read (scoped to GUEST_USER_ID)
				const effectiveUserId = userId ?? GUEST_USER_ID

				const [noteItems, folderItems] = await Promise.all([
					db.findAll<Note>('notes', effectiveUserId),
					db.findAll<Folder>('folders', effectiveUserId),
				])

				const id = query.id
				if (id) {
					const item = [...noteItems, ...folderItems].find((i) => i.id === id)
					if (!item) {
						set.status = 404
						return { error: 'Item not found' }
					}
					return item
				}

				return buildTree(noteItems, folderItems)
			} catch (err) {
				console.error('GET /notes error:', err)
				set.status = 500
				return { error: 'Failed to fetch items' }
			}
		},
		{
			query: t.Object({
				id: t.Optional(t.String()),
			}),
		},
	)

	// ------------------------------------------------------------------
	// POST /notes — create a new note or folder
	// ------------------------------------------------------------------
	.post(
		'/',
		async ({ userId, session, body, set }) => {
			try {
				if (!session?.user?.id || session.user.isAnonymous) {
					set.status = 401
					return { error: 'Authentication required for mutations' }
				}
				if (!userId) {
					set.status = 401
					return { error: 'Unauthorized' }
				}

				if (!body.name) {
					set.status = 400
					return { error: 'Name is required' }
				}

				const now = Date.now()
				const type = body.type === 'folder' ? 'folder' : 'note'
				const table = type === 'folder' ? 'folders' : 'notes'

				const data = {
					...body,
					type,
					createdAt: now,
					updatedAt: now,
				}

				const created = await db.create(table, data, userId)
				set.status = 201
				return created
			} catch (err) {
				console.error('POST /notes error:', err)
				set.status = 500
				return { error: 'Failed to create item' }
			}
		},
		{
			body: t.Object({
				name: t.String(),
				type: t.Optional(t.Union([t.Literal('note'), t.Literal('folder')])),
				parentFolderId: t.Optional(t.Nullable(t.String())),
				icon: t.Optional(t.Nullable(t.String())),
				coverImage: t.Optional(t.Nullable(t.String())),
			}),
		},
	)

	// ------------------------------------------------------------------
	// PUT /notes — update an existing note or folder
	// ------------------------------------------------------------------
	.put(
		'/',
		async ({ userId, session, body, set }) => {
			try {
				if (!session?.user?.id || session.user.isAnonymous) {
					set.status = 401
					return { error: 'Authentication required for mutations' }
				}
				if (!userId) {
					set.status = 401
					return { error: 'Unauthorized' }
				}

				const { id, ...updates } = body
				if (!id) {
					set.status = 400
					return { error: 'ID is required' }
				}

				const mutableUpdates = updates as Record<string, unknown>
				mutableUpdates.updatedAt = Date.now()

				if (typeof mutableUpdates.isPublic === 'boolean') {
					const existing = await db.findById<Note>('notes', id, userId)
					if (!existing) {
						set.status = 404
						return { error: 'Item not found' }
					}

					if (mutableUpdates.isPublic) {
						const cloudEnabled = await hasCloudStorage(userId)
						if (!cloudEnabled) {
							set.status = 400
							return { error: 'Enable cloud storage to share notes publicly' }
						}
						if (!existing.publicId) {
							mutableUpdates.publicId = createPublicId()
						}
					} else {
						mutableUpdates.isPublic = false
					}
				}

				let result = await db.update('notes', id, mutableUpdates, userId)
				if (!result) result = await db.update('folders', id, mutableUpdates, userId)
				if (!result) {
					set.status = 404
					return { error: 'Item not found' }
				}

				return result
			} catch (err) {
				console.error('PUT /notes error:', err)
				set.status = 500
				return { error: 'Failed to update item' }
			}
		},
		{
			body: t.Object({
				id: t.String(),
				name: t.Optional(t.String()),
				content: t.Optional(t.Any()),
				icon: t.Optional(t.Nullable(t.String())),
				coverImage: t.Optional(t.Nullable(t.String())),
				pinned: t.Optional(t.Boolean()),
				favorite: t.Optional(t.Boolean()),
				isPublic: t.Optional(t.Boolean()),
				parentFolderId: t.Optional(t.Nullable(t.String())),
				tags: t.Optional(t.Array(t.String())),
			}),
		},
	)

	// ------------------------------------------------------------------
	// DELETE /notes?id=xxx — delete a note or folder
	// ------------------------------------------------------------------
	.delete(
		'/',
		async ({ userId, session, query, set }) => {
			try {
				if (!session?.user?.id || session.user.isAnonymous) {
					set.status = 401
					return { error: 'Authentication required for mutations' }
				}
				if (!userId) {
					set.status = 401
					return { error: 'Unauthorized' }
				}

				const id = query.id
				if (!id) {
					set.status = 400
					return { error: 'ID is required' }
				}

				let deleted = await db.delete('notes', id, userId)
				if (!deleted) deleted = await db.delete('folders', id, userId)
				if (!deleted) {
					set.status = 404
					return { error: 'Item not found' }
				}

				return { id, success: true }
			} catch (err) {
				console.error('DELETE /notes error:', err)
				set.status = 500
				return { error: 'Failed to delete item' }
			}
		},
		{
			query: t.Object({
				id: t.Optional(t.String()),
			}),
		},
	)
