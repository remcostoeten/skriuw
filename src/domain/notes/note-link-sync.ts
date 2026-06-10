import type { Prisma } from "@/generated/prisma/client";
import type { NoteFile } from "@/domain/notes/models";
import {
	extractNoteLinks,
	extractNoteTags,
	getNoteSearchableContent,
	normalizeNoteTitle,
} from "@/domain/notes/note-links";

type BatchPayload = { count: number };

export type PersistedNoteLinkRow = {
	id: string;
	kind: string;
	targetLabel: string;
	targetNoteId: string | null;
};

export type NoteLinkSyncDb = {
	noteLink: {
		findMany(args: {
			where: { userId: string; sourceNoteId: string };
			select: { id: true; kind: true; targetLabel: true; targetNoteId: true };
		}): Promise<PersistedNoteLinkRow[]>;
		deleteMany(args: {
			where: {
				userId: string;
				sourceNoteId: string;
				OR: Array<{ kind: string; targetLabel: string }>;
			};
		}): Promise<BatchPayload>;
		updateMany(args: {
			where: { id: string; userId: string; sourceNoteId: string };
			data: { targetNoteId: string | null };
		}): Promise<BatchPayload>;
		createMany(args: {
			data: Prisma.NoteLinkCreateManyInput[];
			skipDuplicates?: boolean;
		}): Promise<BatchPayload>;
	};
};

export type NoteLinkDiff = {
	removed: PersistedNoteLinkRow[];
	updated: Array<{
		existing: PersistedNoteLinkRow;
		next: Prisma.NoteLinkCreateManyInput;
	}>;
	created: Prisma.NoteLinkCreateManyInput[];
};

function linkKey(link: Pick<PersistedNoteLinkRow, "kind" | "targetLabel">): string {
	return `${link.kind}:${link.targetLabel}`;
}

// Builds the canonical persisted note_links rows for a note. One row is kept per
// distinct outgoing link or tag membership.
export function buildDesiredNoteLinkRows(
	userId: string,
	note: Pick<NoteFile, "id" | "content" | "richContent" | "tags">,
): Prisma.NoteLinkCreateManyInput[] {
	const rows = new Map<string, Prisma.NoteLinkCreateManyInput>();

	for (const link of extractNoteLinks(note)) {
		const targetLabel = normalizeNoteTitle(link.targetLabel);
		if (!targetLabel) continue;
		rows.set(`${link.kind}:${targetLabel}`, {
			userId,
			sourceNoteId: note.id,
			targetNoteId: link.targetNoteId ?? null,
			targetLabel,
			kind: link.kind,
		});
	}

	const tagNames = new Set<string>([
		...extractNoteTags(getNoteSearchableContent(note)),
		...(note.tags ?? []).map((tag) => tag.trim().replace(/^#/, "").toLowerCase()),
	]);
	for (const tag of tagNames) {
		if (!tag) continue;
		rows.set(`tag:${tag}`, {
			userId,
			sourceNoteId: note.id,
			targetNoteId: null,
			targetLabel: tag,
			kind: "tag",
		});
	}

	return [...rows.values()];
}

export function diffNoteLinkRows(
	existing: PersistedNoteLinkRow[],
	desired: Prisma.NoteLinkCreateManyInput[],
): NoteLinkDiff {
	const desiredByKey = new Map(desired.map((row) => [linkKey(row), row]));
	const existingByKey = new Map(existing.map((row) => [linkKey(row), row]));
	const removed: PersistedNoteLinkRow[] = [];
	const updated: NoteLinkDiff["updated"] = [];
	const created: Prisma.NoteLinkCreateManyInput[] = [];

	for (const row of existing) {
		const next = desiredByKey.get(linkKey(row));
		if (!next) {
			removed.push(row);
			continue;
		}
		if ((next.targetNoteId ?? null) !== row.targetNoteId) {
			updated.push({ existing: row, next });
		}
	}

	for (const row of desired) {
		if (!existingByKey.has(linkKey(row))) {
			created.push(row);
		}
	}

	return { removed, updated, created };
}

export async function syncNoteLinks(
	db: NoteLinkSyncDb,
	userId: string,
	note: Pick<NoteFile, "id" | "content" | "richContent" | "tags">,
): Promise<void> {
	const desired = buildDesiredNoteLinkRows(userId, note);
	const existing = await db.noteLink.findMany({
		where: { userId, sourceNoteId: note.id },
		select: { id: true, kind: true, targetLabel: true, targetNoteId: true },
	});
	const diff = diffNoteLinkRows(existing, desired);

	if (diff.removed.length > 0) {
		await db.noteLink.deleteMany({
			where: {
				userId,
				sourceNoteId: note.id,
				OR: diff.removed.map((row) => ({
					kind: row.kind,
					targetLabel: row.targetLabel,
				})),
			},
		});
	}

	for (const { existing: row, next } of diff.updated) {
		await db.noteLink.updateMany({
			where: { id: row.id, userId, sourceNoteId: note.id },
			data: { targetNoteId: next.targetNoteId ?? null },
		});
	}

	if (diff.created.length > 0) {
		await db.noteLink.createMany({ data: diff.created, skipDuplicates: true });
	}
}
