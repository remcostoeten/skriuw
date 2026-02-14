'use server'

import { requireAuth } from '@/features/authentication/require-auth'
import { CreateNoteSchema, type CreateNoteInput } from '@skriuw/core'
import { folders, getDatabase, notes } from '@skriuw/db'
import type { Folder, Note } from '@skriuw/db'

function serializeNoteContent(content: unknown): string {
	if (typeof content === 'string') return content
	return JSON.stringify(content ?? [])
}

function createPublicId() {
	return `pub_${crypto.randomUUID().replace(/-/g, '')}`
}

export async function createNoteAction(input: unknown): Promise<Note | Folder> {
	const user = await requireAuth()
	const payload: CreateNoteInput = CreateNoteSchema.parse(input)
	const db = getDatabase()
	const now = Date.now()

	if (payload.type === 'folder') {
		const created = await db
			.insert(folders)
			.values({
				id: crypto.randomUUID(),
				type: 'folder',
				name: payload.name,
				parentFolderId: payload.parentFolderId ?? null,
				userId: user.id,
				pinned: payload.pinned ? 1 : 0,
				pinnedAt: payload.pinned ? now : null,
				createdAt: now,
				updatedAt: now
			})
			.returning()

		if (!created[0]) {
			throw new Error('Failed to create folder')
		}

		return created[0]
	}

	const created = await db
		.insert(notes)
		.values({
			id: crypto.randomUUID(),
			type: 'note',
			name: payload.name,
			content: serializeNoteContent(payload.content),
			parentFolderId: payload.parentFolderId ?? null,
			icon: payload.icon ?? null,
			coverImage: payload.coverImage ?? null,
			tags: payload.tags ?? null,
			userId: user.id,
			pinned: payload.pinned ? 1 : 0,
			pinnedAt: payload.pinned ? now : null,
			favorite: payload.favorite ? 1 : 0,
			isPublic: payload.isPublic ?? false,
			publicId: payload.isPublic ? createPublicId() : null,
			publicViews: 0,
			createdAt: now,
			updatedAt: now
		})
		.returning()

	if (!created[0]) {
		throw new Error('Failed to create note')
	}

	return created[0]
}
