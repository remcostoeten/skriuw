import type { Prisma } from "@/generated/prisma/client";
import type { RichTextDocument } from "@/domain/notes/models";
import { buildDesiredLinkTargets } from "@/domain/notes/note-link-sync";

type BatchPayload = { count: number };

export type PersistedJournalLinkRow = {
	id: string;
	kind: string;
	targetLabel: string;
	targetNoteId: string | null;
};

export type JournalLinkSyncDb = {
	journalLink: {
		findMany(args: {
			where: { userId: string; sourceJournalId: string };
			select: { id: true; kind: true; targetLabel: true; targetNoteId: true };
		}): Promise<PersistedJournalLinkRow[]>;
		deleteMany(args: {
			where: {
				userId: string;
				sourceJournalId: string;
				OR: Array<{ kind: string; targetLabel: string }>;
			};
		}): Promise<BatchPayload>;
		updateMany(args: {
			where: { id: { in: string[] }; userId: string; sourceJournalId: string };
			data: { targetNoteId: string | null };
		}): Promise<BatchPayload>;
		createMany(args: {
			data: Prisma.JournalLinkCreateManyInput[];
			skipDuplicates?: boolean;
		}): Promise<BatchPayload>;
	};
};

export type JournalLinkSource = {
	id: string;
	content: string;
	richContent?: RichTextDocument | null;
	tags?: string[];
};

function linkKey(link: Pick<PersistedJournalLinkRow, "kind" | "targetLabel">): string {
	return `${link.kind}:${link.targetLabel}`;
}

// Builds the canonical persisted journal_links rows for a journal entry — the
// journal counterpart of buildDesiredNoteLinkRows, sharing the same extractor.
export function buildDesiredJournalLinkRows(
	userId: string,
	entry: JournalLinkSource,
): Prisma.JournalLinkCreateManyInput[] {
	return buildDesiredLinkTargets({
		id: entry.id,
		content: entry.content,
		richContent: entry.richContent ?? [],
		tags: entry.tags ?? [],
	}).map((target) => ({
		userId,
		sourceJournalId: entry.id,
		targetNoteId: target.targetNoteId,
		targetLabel: target.targetLabel,
		kind: target.kind,
	}));
}

export async function syncJournalLinks(
	db: JournalLinkSyncDb,
	userId: string,
	entry: JournalLinkSource,
): Promise<void> {
	const desired = buildDesiredJournalLinkRows(userId, entry);
	const existing = await db.journalLink.findMany({
		where: { userId, sourceJournalId: entry.id },
		select: { id: true, kind: true, targetLabel: true, targetNoteId: true },
	});

	const desiredByKey = new Map(desired.map((row) => [`${row.kind}:${row.targetLabel}`, row]));
	const existingByKey = new Map(existing.map((row) => [linkKey(row), row]));

	const removed = existing.filter((row) => !desiredByKey.has(linkKey(row)));
	if (removed.length > 0) {
		await db.journalLink.deleteMany({
			where: {
				userId,
				sourceJournalId: entry.id,
				OR: removed.map((row) => ({ kind: row.kind, targetLabel: row.targetLabel })),
			},
		});
	}

	const updatedIdsByTarget = new Map<string | null, string[]>();
	for (const row of existing) {
		const next = desiredByKey.get(linkKey(row));
		if (!next) continue;
		const target = next.targetNoteId ?? null;
		if (target === row.targetNoteId) continue;
		const ids = updatedIdsByTarget.get(target) ?? [];
		ids.push(row.id);
		updatedIdsByTarget.set(target, ids);
	}
	await Promise.all(
		Array.from(updatedIdsByTarget, ([targetNoteId, ids]) =>
			db.journalLink.updateMany({
				where: { id: { in: ids }, userId, sourceJournalId: entry.id },
				data: { targetNoteId },
			}),
		),
	);

	const created = desired.filter((row) => !existingByKey.has(`${row.kind}:${row.targetLabel}`));
	if (created.length > 0) {
		await db.journalLink.createMany({ data: created, skipDuplicates: true });
	}
}
