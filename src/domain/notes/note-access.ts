import "server-only";

import type { Note, PrismaClient } from "@/generated/prisma/client";
import type { NoteAccessRole } from "@/domain/notes/models";

type NoteAccessDb = Pick<PrismaClient, "note" | "noteCollaborator">;

export type ResolvedNoteAccess = {
	/** The note's actual owner — versions and links are always bookkept under this id. */
	ownerId: string;
	/** The requesting user's role on this note. */
	role: NoteAccessRole;
};

/**
 * Resolve a user's role on a note: "owner" if they own it, otherwise the
 * collaborator permission ("editor" | "viewer"), or null when they have no
 * access at all. Soft-deleted notes resolve to null. This is the single
 * authorization gate shared by the collaborator-aware read and write paths so
 * the rules can't drift between them.
 */
export async function resolveNoteAccess(
	db: NoteAccessDb,
	userId: string,
	noteId: string,
): Promise<ResolvedNoteAccess | null> {
	const note = await db.note.findFirst({
		where: { id: noteId, deletedAt: null },
		select: { userId: true },
	});
	if (!note) return null;
	if (note.userId === userId) return { ownerId: note.userId, role: "owner" };

	const collab = await db.noteCollaborator.findUnique({
		where: { noteId_userId: { noteId, userId } },
		select: { permission: true },
	});
	if (!collab) return null;

	return {
		ownerId: note.userId,
		role: collab.permission === "editor" ? "editor" : "viewer",
	};
}

export type ResolvedNoteWithAccess = {
	/** The full note row, loaded once so callers don't re-query. */
	record: Note;
	ownerId: string;
	role: NoteAccessRole;
};

/**
 * Like {@link resolveNoteAccess}, but returns the full note row alongside the
 * resolved access so collaborator-aware readers (`getNote`/`fetchNote`) don't
 * re-inline the owner-check + collaborator lookup + permission mapping. Returns
 * null when the note is missing/soft-deleted or the user has no access.
 */
export async function resolveReadableNote(
	db: NoteAccessDb,
	userId: string,
	noteId: string,
): Promise<ResolvedNoteWithAccess | null> {
	const record = await db.note.findFirst({
		where: { id: noteId, deletedAt: null },
	});
	if (!record) return null;
	if (record.userId === userId) return { record, ownerId: userId, role: "owner" };

	const collab = await db.noteCollaborator.findUnique({
		where: { noteId_userId: { noteId, userId } },
		select: { permission: true },
	});
	if (!collab) return null;

	return {
		record,
		ownerId: record.userId,
		role: collab.permission === "editor" ? "editor" : "viewer",
	};
}
