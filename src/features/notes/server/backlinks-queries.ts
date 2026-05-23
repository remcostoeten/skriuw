import { getAuthenticatedUser } from "@/core/db";
import type { FolderId, IsoTime, MarkdownContent, NoteId, TagName } from "@/core/persistence-types";
import { buildNoteBacklinks, type ResolvedNoteLink } from "@/features/notes/lib/note-links";
import type { NoteFile } from "@/types/notes";

export async function listNoteBacklinks(noteId: string): Promise<ResolvedNoteLink[]> {
	const { prisma, user } = await getAuthenticatedUser();

	const records = await prisma.note.findMany({
		where: { userId: user.id, deletedAt: null },
		select: {
			id: true,
			name: true,
			content: true,
			preferredEditorMode: true,
			parentId: true,
			tags: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	const files: NoteFile[] = records.map((record) => ({
		id: record.id as NoteId,
		name: record.name,
		content: record.content as MarkdownContent,
		richContent: [],
		preferredEditorMode: (record.preferredEditorMode as "raw" | "block" | null) ?? "block",
		parentId: record.parentId as FolderId | null,
		tags: record.tags.map((tag) => tag as TagName),
		createdAt: new Date(record.createdAt.toISOString() as IsoTime),
		modifiedAt: new Date(record.updatedAt.toISOString() as IsoTime),
	}));

	const activeNote = files.find((file) => file.id === noteId);
	if (!activeNote) return [];

	return buildNoteBacklinks(activeNote, files);
}
