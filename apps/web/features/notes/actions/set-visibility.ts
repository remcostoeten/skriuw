'use server'

import { requireAuth } from '@/features/authentication/require-auth'
import { and, eq, getDatabase, isNull, notes } from '@skriuw/db'
import type { Note } from '@skriuw/db'
import { z } from 'zod'

function createPublicId() {
	return `pub_${crypto.randomUUID().replace(/-/g, '')}`
}

export async function setVisibilityAction(input: unknown): Promise<Note> {
	const user = await requireAuth()
	const parsed = z.object({ id: z.string().min(1), isPublic: z.boolean() }).parse(input)

	const db = getDatabase()

	const [existing] = await db
		.select()
		.from(notes)
		.where(and(eq(notes.id, parsed.id), eq(notes.userId, user.id), isNull(notes.deletedAt)))
		.limit(1)

	if (!existing) {
		throw new Error('Note not found')
	}

	const updated = await db
		.update(notes)
		.set({
			isPublic: parsed.isPublic,
			publicId: parsed.isPublic ? (existing.publicId ?? createPublicId()) : existing.publicId,
			updatedAt: Date.now()
		})
		.where(and(eq(notes.id, parsed.id), eq(notes.userId, user.id), isNull(notes.deletedAt)))
		.returning()

	if (!updated[0]) {
		throw new Error('Failed to update note visibility')
	}

	return updated[0]
}
