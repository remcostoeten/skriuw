import { getAuthenticatedUser } from "@/core/db";
import type { MarkdownContent } from "@/core/persistence-types";
import { isGuestScopedId } from "@/domain/notes/note-id";
import {
	getNoteTitle,
	normalizeNoteTitle,
	type NoteLinkKind,
	type ResolvedNoteLink,
} from "@/domain/notes/note-links";

// Backlinks are resolved from the persisted `note_links` table (indexed on
// [userId, targetNoteId]) instead of scanning every note's `content` for "[["
// and transferring full note bodies. Wiki links are stored with
// targetNoteId=null + a normalized targetLabel, so we also match the active
// note's title keys (filename + heading). Note: a wiki link whose title is
// shared by multiple notes resolves to each of them here (the previous
// content-scan treated such ambiguous links as unresolved); this only affects
// duplicate-title notes and surfaces more backlinks rather than fewer.
export async function listNoteBacklinks(noteId: string): Promise<ResolvedNoteLink[]> {
	if (isGuestScopedId(noteId)) return [];
	const { prisma, user } = await getAuthenticatedUser();

	const activeNote = await prisma.note.findFirst({
		where: { userId: user.id, id: noteId, deletedAt: null },
		select: { name: true, content: true },
	});
	if (!activeNote) return [];

	const titleKeys = [
		normalizeNoteTitle(activeNote.name),
		normalizeNoteTitle(
			getNoteTitle({ name: activeNote.name, content: activeNote.content as MarkdownContent }),
		),
	].filter((key, index, all) => Boolean(key) && all.indexOf(key) === index);

	const rows = await prisma.noteLink.findMany({
		where: {
			userId: user.id,
			kind: { not: "tag" },
			sourceNoteId: { not: noteId },
			OR: [
				{ targetNoteId: noteId },
				...(titleKeys.length > 0
					? [{ targetNoteId: null, targetLabel: { in: titleKeys } }]
					: []),
			],
		},
		select: { sourceNoteId: true, targetLabel: true, kind: true },
	});

	// One backlink entry per referencing note.
	const seen = new Set<string>();
	const backlinks: ResolvedNoteLink[] = [];
	for (const row of rows) {
		if (seen.has(row.sourceNoteId)) continue;
		seen.add(row.sourceNoteId);
		backlinks.push({
			raw: row.targetLabel,
			kind: row.kind as NoteLinkKind,
			sourceNoteId: row.sourceNoteId,
			targetLabel: row.targetLabel,
			targetNoteId: noteId,
			status: "resolved",
		});
	}

	return backlinks;
}
