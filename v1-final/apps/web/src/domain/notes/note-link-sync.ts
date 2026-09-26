import type { Prisma } from "@/generated/prisma/client";
import type { NoteFile } from "@/domain/notes/models";
import {
	extractBarePersonNames,
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

type PersonNameRow = { id: string; name: string };

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

/** Bare `$Name` mentions in a note's searchable text (chips excluded). */
export function extractNoteBarePersonNames(
	note: Pick<NoteFile, "content" | "richContent">,
): string[] {
	return extractBarePersonNames(
		getNoteSearchableContent({ content: note.content, richContent: note.richContent ?? [] }),
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
// name that matches nobody, so every `$Name` typed in a note ends up on the
// people overview — mirrors the journal-side resolver in journal-link-sync.ts.
export async function ensurePersonIdsForBareNames(
	db: NoteLinkSyncDb,
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

// Builds the canonical persisted note_links rows for a note. One row is kept per
// distinct outgoing link or tag membership. `personIdsByName` additionally
// resolves bare `$Name` mentions into person rows; without it only
// `$[Name](person://id)` chips are indexed.
export function buildDesiredNoteLinkRows(
	userId: string,
	note: Pick<NoteFile, "id" | "content" | "richContent" | "tags">,
	personIdsByName?: Map<string, string>,
): Prisma.NoteLinkCreateManyInput[] {
	const rows = buildDesiredLinkTargets(note).map((target) => ({
		userId,
		sourceNoteId: note.id,
		targetNoteId: target.targetNoteId,
		targetLabel: target.targetLabel,
		kind: target.kind,
	}));

	if (personIdsByName && personIdsByName.size > 0) {
		const seen = new Set(
			rows.filter((row) => row.kind === "person").map((row) => row.targetLabel),
		);
		for (const name of extractNoteBarePersonNames(note)) {
			const personId = personIdsByName.get(name.toLowerCase());
			if (!personId || seen.has(personId)) continue;
			seen.add(personId);
			rows.push({
				userId,
				sourceNoteId: note.id,
				targetNoteId: null,
				targetLabel: personId,
				kind: "person",
			});
		}
	}

	return rows;
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

export type NoteLinkBackfillDb = NoteLinkSyncDb & {
	noteLink: {
		findMany(args: {
			where: { userId: string };
			select: { sourceNoteId: true; kind: true; targetLabel: true };
		}): Promise<Array<{ sourceNoteId: string; kind: string; targetLabel: string }>>;
	};
};

// Reconciles persisted note_links against what each note's content should
// produce, re-syncing any note with missing rows. Covers notes saved before
// bare `$Name` mention indexing shipped for notes — mirrors the journal-side
// backfill in journal-link-sync.ts.
export async function backfillMissingNoteLinks(
	db: NoteLinkBackfillDb,
	userId: string,
	notes: Array<Pick<NoteFile, "id" | "content" | "richContent" | "tags">>,
): Promise<number> {
	const persisted = await db.noteLink.findMany({
		where: { userId },
		select: { sourceNoteId: true, kind: true, targetLabel: true },
	});
	const persistedByNote = new Map<string, Set<string>>();
	for (const row of persisted) {
		const keys = persistedByNote.get(row.sourceNoteId) ?? new Set();
		keys.add(linkKey(row));
		persistedByNote.set(row.sourceNoteId, keys);
	}

	const bareNames = [...new Set(notes.flatMap(extractNoteBarePersonNames))];
	const personIdsByName = await ensurePersonIdsForBareNames(db, userId, bareNames);

	const missing = notes.filter((note) => {
		const desired = buildDesiredNoteLinkRows(userId, note, personIdsByName);
		if (desired.length === 0) return false;
		const existing = persistedByNote.get(note.id);
		return !existing || desired.some((row) => !existing.has(linkKey(row)));
	});
	await Promise.all(missing.map((note) => syncNoteLinks(db, userId, note)));
	return missing.length;
}

export async function syncNoteLinks(
	db: NoteLinkSyncDb,
	userId: string,
	note: Pick<NoteFile, "id" | "content" | "richContent" | "tags">,
): Promise<void> {
	const personIdsByName = await ensurePersonIdsForBareNames(
		db,
		userId,
		extractNoteBarePersonNames(note),
	);
	const desired = buildDesiredNoteLinkRows(userId, note, personIdsByName);
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
