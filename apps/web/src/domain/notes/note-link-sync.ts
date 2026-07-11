import type { Prisma } from "@/generated/prisma/client";
import type { NoteFile } from "@/domain/notes/models";
import {
	extractMarkdownPersonIds,
	extractNoteLinks,
	extractNoteTags,
	getNoteSearchableContent,
	normalizeNoteTitle,
} from "@/domain/notes/note-links";
import { extractRichDocumentPersonIds } from "@/domain/notes/rich-document";

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
			where: { id: { in: string[] }; userId: string; sourceNoteId: string };
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

// A single desired link, independent of whether the source is a note or a
// journal entry. `key` (`kind:targetLabel`) dedupes within one source.
export type DesiredLinkTarget = {
	key: string;
	kind: string;
	targetLabel: string;
	targetNoteId: string | null;
};

// The source-agnostic core: extracts the distinct tag/person/note-link edges
// carried by a body + rich content + tags array. Reused by both the note and
// journal link indexers so the two stay in lockstep.
export function buildDesiredLinkTargets(
	source: Pick<NoteFile, "id" | "content" | "richContent" | "tags">,
): DesiredLinkTarget[] {
	const rows = new Map<string, DesiredLinkTarget>();

	for (const link of extractNoteLinks(source)) {
		const targetLabel = normalizeNoteTitle(link.targetLabel);
		if (!targetLabel) continue;
		const key = `${link.kind}:${targetLabel}`;
		rows.set(key, {
			key,
			kind: link.kind,
			targetLabel,
			targetNoteId: link.targetNoteId ?? null,
		});
	}

	const tagNames = new Set<string>([
		...extractNoteTags(getNoteSearchableContent(source)),
		...(source.tags ?? []).map((tag) => tag.trim().replace(/^#/, "").toLowerCase()),
	]);
	for (const tag of tagNames) {
		if (!tag) continue;
		rows.set(`tag:${tag}`, {
			key: `tag:${tag}`,
			kind: "tag",
			targetLabel: tag,
			targetNoteId: null,
		});
	}

	const personIds = new Set<string>([
		...extractRichDocumentPersonIds(source.richContent),
		...extractMarkdownPersonIds(getNoteSearchableContent(source)),
	]);
	for (const personId of personIds) {
		if (!personId) continue;
		rows.set(`person:${personId}`, {
			key: `person:${personId}`,
			kind: "person",
			targetLabel: personId,
			targetNoteId: null,
		});
	}

	return [...rows.values()];
}

// Builds the canonical persisted note_links rows for a note. One row is kept per
// distinct outgoing link or tag membership.
export function buildDesiredNoteLinkRows(
	userId: string,
	note: Pick<NoteFile, "id" | "content" | "richContent" | "tags">,
): Prisma.NoteLinkCreateManyInput[] {
	return buildDesiredLinkTargets(note).map((target) => ({
		userId,
		sourceNoteId: note.id,
		targetNoteId: target.targetNoteId,
		targetLabel: target.targetLabel,
		kind: target.kind,
	}));
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

	// One query per distinct resolved target instead of one per link row.
	const updatedIdsByTarget = new Map<string | null, string[]>();
	for (const { existing: row, next } of diff.updated) {
		const target = next.targetNoteId ?? null;
		const ids = updatedIdsByTarget.get(target) ?? [];
		ids.push(row.id);
		updatedIdsByTarget.set(target, ids);
	}
	await Promise.all(
		Array.from(updatedIdsByTarget, ([targetNoteId, ids]) =>
			db.noteLink.updateMany({
				where: { id: { in: ids }, userId, sourceNoteId: note.id },
				data: { targetNoteId },
			}),
		),
	);

	if (diff.created.length > 0) {
		await db.noteLink.createMany({ data: diff.created, skipDuplicates: true });
	}
}
