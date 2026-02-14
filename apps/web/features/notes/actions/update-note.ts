'use server'

import { requireAuth } from '@/features/authentication/require-auth'
import { UpdateNoteSchema, type UpdateNoteInput } from '@skriuw/core'
import { and, eq, getDatabase, isNull, notes } from '@skriuw/db'
import type { Note } from '@skriuw/db'

function serializeNoteContent(content: unknown): string {
	if (typeof content === 'string') return content
	return JSON.stringify(content ?? [])
}

function createPublicId() {
	return `pub_${crypto.randomUUID().replace(/-/g, '')}`
}

export async function updateNoteAction(input: unknown): Promise<Note> {
	const user = await requireAuth()
	const payload: UpdateNoteInput = UpdateNoteSchema.parse(input)
	const db = getDatabase()
	const now = Date.now()

	const [existing] = await db
		.select()
		.from(notes)
		.where(and(eq(notes.id, payload.id), eq(notes.userId, user.id), isNull(notes.deletedAt)))
		.limit(1)

	if (!existing) {
		throw new Error('Note not found')
	}

	const updates: Partial<typeof notes.$inferInsert> = {
		updatedAt: payload.updatedAt ?? now
	}

	if (payload.name !== undefined) updates.name = payload.name
	if (payload.content !== undefined) updates.content = serializeNoteContent(payload.content)
	if (payload.parentFolderId !== undefined) updates.parentFolderId = payload.parentFolderId
	if (payload.icon !== undefined) updates.icon = payload.icon
	if (payload.coverImage !== undefined) updates.coverImage = payload.coverImage
	if (payload.tags !== undefined) updates.tags = payload.tags

	if (payload.pinned !== undefined) {
		updates.pinned = payload.pinned ? 1 : 0
		updates.pinnedAt = payload.pinned ? (payload.pinnedAt ?? now) : null
	}

	if (payload.pinnedAt !== undefined) {
		updates.pinnedAt = payload.pinnedAt
	}

	if (payload.favorite !== undefined) {
		updates.favorite = payload.favorite ? 1 : 0
	}

	if (payload.publicViews !== undefined) updates.publicViews = payload.publicViews

	if (payload.isPublic !== undefined) {
		updates.isPublic = payload.isPublic
		if (payload.isPublic && !existing.publicId && payload.publicId === undefined) {
			updates.publicId = createPublicId()
		}
	}

	if (payload.publicId !== undefined) {
		updates.publicId = payload.publicId
	}

	const updated = await db
		.update(notes)
		.set(updates)
		.where(and(eq(notes.id, payload.id), eq(notes.userId, user.id), isNull(notes.deletedAt)))
		.returning()

	if (!updated[0]) {
		throw new Error('Failed to update note')
	}

	return updated[0]
}
