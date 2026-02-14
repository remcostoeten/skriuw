'use server'

import { requireAuth } from '@/features/authentication/require-auth'
import { and, eq, getDatabase, isNull, notes } from '@skriuw/db'
import { z } from 'zod'

type DeleteNoteResult = {
	id: string
	success: true
}

export async function deleteNoteAction(input: unknown): Promise<DeleteNoteResult> {
	const user = await requireAuth()
	const parsed = z
		.object({ id: z.string().min(1) })
		.parse(typeof input === 'string' ? { id: input } : input)
	const db = getDatabase()
	const now = Date.now()

	const deleted = await db
		.update(notes)
		.set({ deletedAt: now, updatedAt: now })
		.where(and(eq(notes.id, parsed.id), eq(notes.userId, user.id), isNull(notes.deletedAt)))
		.returning()

	if (!deleted[0]) {
		throw new Error('Note not found')
	}

	return { id: deleted[0].id, success: true }
}
