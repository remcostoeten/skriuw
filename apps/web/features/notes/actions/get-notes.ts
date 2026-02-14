'use server'

import { requireAuth } from '@/features/authentication/require-auth'
import {
	getChildren,
	getNoteById,
	getNotes,
	getNoteTree,
	type NoteTreeItem
} from '@/features/notes/server/queries'
import type { Note } from '@skriuw/db'

type GetNotesInput = {
	id?: string
	parentId?: string
	tree?: boolean
}

export async function getNotesAction(
	input: GetNotesInput = {}
): Promise<Note[] | NoteTreeItem[] | Note | null> {
	const user = await requireAuth()

	if (input.id) {
		return getNoteById(user.id, input.id)
	}

	if (input.parentId) {
		return getChildren(user.id, input.parentId)
	}

	if (input.tree) {
		return getNoteTree(user.id)
	}

	return getNotes(user.id)
}
