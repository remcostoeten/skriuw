import type { Prisma } from "@/generated/prisma/client";
import type { RichTextDocument } from "@/domain/notes/models";
import { buildDesiredLinkTargets } from "@/domain/notes/note-link-sync";
import { extractBarePersonNames, getNoteSearchableContent } from "@/domain/notes/note-links";

type BatchPayload = { count: number };

export type PersistedJournalLinkRow = {
	id: string;
	kind: string;
	targetLabel: string;
	targetNoteId: string | null;
};

type PersonNameRow = { id: string; name: string };

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
	person: {
		findMany(args: {
			where: { userId: string };
			select: { id: true; name: true };
		}): Promise<PersonNameRow[]>;
		create(args: {
			data: { userId: string; name: string };
			select: { id: true; name: true };
		}): Promise<PersonNameRow>;
	};
};

export type JournalLinkSource = {
	id: string;
	content: string;
	richContent?: RichTextDocument | null;
	tags?: string[];
};

export type JournalLinkBackfillDb = JournalLinkSyncDb & {
	journalLink: {
		findMany(args: {
			where: { userId: string };
			select: { sourceJournalId: true; kind: true; targetLabel: true };
		}): Promise<Array<{ sourceJournalId: string; kind: string; targetLabel: string }>>;
	};
};

function linkKey(link: Pick<PersistedJournalLinkRow, "kind" | "targetLabel">): string {
	return `${link.kind}:${link.targetLabel}`;
}

/** Bare `$Name` mentions in a journal entry's searchable text (chips excluded). */
export function extractJournalBarePersonNames(entry: JournalLinkSource): string[] {
	return extractBarePersonNames(
		getNoteSearchableContent({ content: entry.content, richContent: entry.richContent ?? [] }),
	);
}

/**
 * Lowercased name → person id lookup for resolving bare `$Name` mentions.
 * Full names always win; a first name resolves only when exactly one person
 * carries it, so `$Remco` finds "Remco Stoeten" without guessing between
 * two Remcos.
 */
export function buildPersonNameResolutionMap(people: PersonNameRow[]): Map<string, string> {
	const byFullName = new Map<string, string>();
	const byFirstName = new Map<string, string | null>();

	for (const person of people) {
		const fullName = person.name.trim().toLowerCase();
		if (!fullName) continue;
		if (!byFullName.has(fullName)) byFullName.set(fullName, person.id);

		const firstName = fullName.split(/\s+/)[0];
		if (!firstName || firstName === fullName) continue;
		byFirstName.set(firstName, byFirstName.has(firstName) ? null : person.id);
	}

	for (const [firstName, personId] of byFirstName) {
		if (personId && !byFullName.has(firstName)) byFullName.set(firstName, personId);
	}

	return byFullName;
}

// Resolves bare names against existing people and creates a Person row for any
// name that matches nobody, so every `$Name` typed in a journal ends up on the
// people overview.
async function ensurePersonIdsForBareNames(
	db: JournalLinkSyncDb,
	userId: string,
	names: string[],
): Promise<Map<string, string>> {
	if (names.length === 0) return new Map();

	const people = await db.person.findMany({
		where: { userId },
		select: { id: true, name: true },
	});
	const resolution = buildPersonNameResolutionMap(people);

	for (const name of names) {
		const key = name.toLowerCase();
		if (resolution.has(key)) continue;
		try {
			const created = await db.person.create({
				data: { userId, name },
				select: { id: true, name: true },
			});
			resolution.set(key, created.id);
		} catch {
			// A concurrent save raced us on the (userId, name) unique constraint;
			// re-read so the mention still resolves to whichever row won.
			const winner = (
				await db.person.findMany({ where: { userId }, select: { id: true, name: true } })
			).find((person) => person.name.trim().toLowerCase() === key);
			if (winner) resolution.set(key, winner.id);
		}
	}

	return resolution;
}

// Builds the canonical persisted journal_links rows for a journal entry — the
// journal counterpart of buildDesiredNoteLinkRows, sharing the same extractor.
// `personIdsByName` additionally resolves bare `$Name` mentions into person
// rows; without it only `$[Name](person://id)` chips are indexed.
export function buildDesiredJournalLinkRows(
	userId: string,
	entry: JournalLinkSource,
	personIdsByName?: Map<string, string>,
): Prisma.JournalLinkCreateManyInput[] {
	const rows = buildDesiredLinkTargets({
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

	if (personIdsByName && personIdsByName.size > 0) {
		const seen = new Set(
			rows.filter((row) => row.kind === "person").map((row) => row.targetLabel),
		);
		for (const name of extractJournalBarePersonNames(entry)) {
			const personId = personIdsByName.get(name.toLowerCase());
			if (!personId || seen.has(personId)) continue;
			seen.add(personId);
			rows.push({
				userId,
				sourceJournalId: entry.id,
				targetNoteId: null,
				targetLabel: personId,
				kind: "person",
			});
		}
	}

	return rows;
}

// Reconciles persisted journal_links against what each entry's content should
// produce, re-syncing any entry with missing rows. Covers both entries saved
// before journal link indexing shipped and entries whose bare `$Name` mentions
// predate bare-mention indexing.
export async function backfillMissingJournalLinks(
	db: JournalLinkBackfillDb,
	userId: string,
	entries: JournalLinkSource[],
): Promise<number> {
	const persisted = await db.journalLink.findMany({
		where: { userId },
		select: { sourceJournalId: true, kind: true, targetLabel: true },
	});
	const persistedByEntry = new Map<string, Set<string>>();
	for (const row of persisted) {
		const keys = persistedByEntry.get(row.sourceJournalId) ?? new Set();
		keys.add(linkKey(row));
		persistedByEntry.set(row.sourceJournalId, keys);
	}

	const bareNames = [...new Set(entries.flatMap(extractJournalBarePersonNames))];
	const personIdsByName = await ensurePersonIdsForBareNames(db, userId, bareNames);

	const missing = entries.filter((entry) => {
		const desired = buildDesiredJournalLinkRows(userId, entry, personIdsByName);
		if (desired.length === 0) return false;
		const existing = persistedByEntry.get(entry.id);
		return !existing || desired.some((row) => !existing.has(linkKey(row)));
	});
	await Promise.all(missing.map((entry) => syncJournalLinks(db, userId, entry)));
	return missing.length;
}

export async function syncJournalLinks(
	db: JournalLinkSyncDb,
	userId: string,
	entry: JournalLinkSource,
): Promise<void> {
	const personIdsByName = await ensurePersonIdsForBareNames(
		db,
		userId,
		extractJournalBarePersonNames(entry),
	);
	const desired = buildDesiredJournalLinkRows(userId, entry, personIdsByName);
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
