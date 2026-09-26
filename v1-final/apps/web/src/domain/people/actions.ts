"use server";

import { getAuthenticatedUser } from "@/core/db";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { ChipRewriteResult, TaggedNoteSummary } from "@/core/workspace-backend/types";
import { isUniqueConstraintError } from "@/core/persistence/guards";
import { rewriteNoteForPerson, type PersonChipRewrite } from "@/domain/notes/chip-rewrite";
import type { RichTextDocument } from "@/domain/notes/models";
import { syncNoteLinks } from "@/domain/notes/note-link-sync";
import { syncJournalLinks } from "@/domain/journal/journal-link-sync";
import { normalizeNoteProperties, type NotePropertyColor } from "@/domain/notes/properties";
import { parseServerInput } from "@/domain/validation/schemas";
import type { Person } from "./models";
import {
	type CreatePersonInput,
	type UpdatePersonInput,
	createPersonInputSchema,
	updatePersonInputSchema,
} from "./validation";

type PersonRow = { id: string; name: string; color: string | null };

function toPerson(row: PersonRow): Person {
	return {
		id: row.id,
		name: row.name,
		color: (row.color as NotePropertyColor | null) ?? null,
	};
}

const personSelect = { id: true, name: true, color: true } as const;

export async function listPeople(): Promise<Person[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const rows = await prisma.person.findMany({
		where: { userId: user.id },
		orderBy: { name: "asc" },
		select: personSelect,
	});
	return rows.map(toPerson);
}

// Reuse-by-name (case-insensitive): creating a person whose name already exists
// under any casing returns the existing row instead of spawning a duplicate, so
// `$johndoe` and `$Johndoe` always resolve to the one durable record (keeping the
// first-stored casing as the canonical display name).
export async function createPerson(input: CreatePersonInput): Promise<Person> {
	const validated = parseServerInput(createPersonInputSchema, input);
	const { prisma, user } = await getAuthenticatedUser();

	const existing = await prisma.person.findFirst({
		where: { userId: user.id, name: { equals: validated.name, mode: "insensitive" } },
		select: personSelect,
	});
	if (existing) return toPerson(existing);

	try {
		const row = await prisma.person.create({
			data: {
				id: validated.id,
				userId: user.id,
				name: validated.name,
				color: validated.color ?? null,
			},
			select: personSelect,
		});
		return toPerson(row);
	} catch (error) {
		// A concurrent create of the same (case-insensitive) name raced us; return
		// whichever row won so the caller still resolves to one person.
		if (!isUniqueConstraintError(error)) throw error;
		const winner = await prisma.person.findFirst({
			where: { userId: user.id, name: { equals: validated.name, mode: "insensitive" } },
			select: personSelect,
		});
		if (winner) return toPerson(winner);
		throw error;
	}
}

export async function updatePerson(input: UpdatePersonInput): Promise<Person> {
	const validated = parseServerInput(updatePersonInputSchema, input);
	const { prisma, user } = await getAuthenticatedUser();
	const row = await prisma.person.update({
		where: { id: validated.id, userId: user.id },
		data: {
			...(validated.name !== undefined ? { name: validated.name } : {}),
			...(validated.color !== undefined ? { color: validated.color } : {}),
		},
		select: personSelect,
	});
	return toPerson(row);
}

type PersonDb = Pick<PrismaClient, "note" | "noteLink" | "person" | "journalEntry" | "journalLink">;

// Journal counterpart of rewritePersonAcrossNotes. Journals carry `$` chips in
// their rich content (indexed as journal_links) but have no person-type
// properties, so only the chip rewrite applies.
async function rewritePersonAcrossJournals(
	tx: PersonDb,
	userId: string,
	rewrite: PersonChipRewrite,
): Promise<string[]> {
	const links = await tx.journalLink.findMany({
		where: {
			userId,
			kind: "person",
			targetLabel: rewrite.fromId,
			sourceJournal: { deletedAt: null },
		},
		select: { sourceJournalId: true },
	});
	const ids = [...new Set(links.map((link) => link.sourceJournalId))];
	if (ids.length === 0) return [];

	const records = await tx.journalEntry.findMany({
		where: { id: { in: ids }, userId, deletedAt: null },
		select: { id: true, content: true, richContent: true, tags: true },
	});

	const rewritten: string[] = [];
	const results = await Promise.all(
		records.map(async (record) => {
			const patch = rewriteNoteForPerson(
				{
					richContent: (record.richContent as RichTextDocument | null) ?? [],
					properties: normalizeNoteProperties(null),
				},
				rewrite,
			);
			if (!patch || patch.richContent === undefined) return null;

			const updated = await tx.journalEntry.update({
				where: { id: record.id, deletedAt: null },
				data: { richContent: patch.richContent as Prisma.InputJsonValue },
				select: { id: true, content: true, richContent: true, tags: true },
			});
			await syncJournalLinks(tx, userId, {
				id: updated.id,
				content: updated.content,
				richContent: (updated.richContent as RichTextDocument | null) ?? [],
				tags: updated.tags,
			});
			return record.id;
		}),
	);
	rewritten.push(...results.filter((id): id is string => id !== null));
	return rewritten;
}

async function rewritePersonAcrossNotes(
	tx: PersonDb,
	userId: string,
	rewrite: PersonChipRewrite,
): Promise<string[]> {
	// Chip mentions are indexed as NoteLink rows, but person-type properties
	// (Owner/Attendees) are not — scan every live note with properties too.
	const [links, propertyCandidates] = await Promise.all([
		tx.noteLink.findMany({
			where: {
				userId,
				kind: "person",
				targetLabel: rewrite.fromId,
				sourceNote: { deletedAt: null },
			},
			select: { sourceNoteId: true },
		}),
		tx.note.findMany({
			where: { userId, deletedAt: null, properties: { not: Prisma.DbNull } },
			select: { id: true },
		}),
	]);
	const ids = [
		...new Set([
			...links.map((link) => link.sourceNoteId),
			...propertyCandidates.map((note) => note.id),
		]),
	];
	if (ids.length === 0) return [];

	const records = await tx.note.findMany({
		where: { id: { in: ids }, userId, deletedAt: null },
		select: { id: true, content: true, richContent: true, tags: true, properties: true },
	});

	const rewritten: string[] = [];
	const results = await Promise.all(
		records.map(async (record) => {
			const patch = rewriteNoteForPerson(
				{
					richContent: (record.richContent as RichTextDocument | null) ?? [],
					properties: normalizeNoteProperties(record.properties),
				},
				rewrite,
			);
			if (!patch) return null;

			const data: Prisma.NoteUncheckedUpdateInput = {};
			if (patch.richContent !== undefined) {
				data.richContent = patch.richContent as Prisma.InputJsonValue;
			}
			if (patch.properties !== undefined) {
				data.properties = patch.properties as unknown as Prisma.InputJsonValue;
			}

			const updated = await tx.note.update({
				where: { id: record.id, deletedAt: null },
				data,
				select: { id: true, content: true, richContent: true, tags: true },
			});
			await syncNoteLinks(tx, userId, {
				id: updated.id,
				content: updated.content,
				richContent: (updated.richContent as RichTextDocument | null) ?? [],
				tags: updated.tags,
			});
			return record.id;
		}),
	);
	rewritten.push(...results.filter((id): id is string => id !== null));
	return rewritten;
}

// Removes every `$` chip pointing at the person (leaving the name as plain
// text) before deleting the row, so no note is left with a dead chip that
// falls back to a stale cached name.
export async function deletePerson(id: string): Promise<ChipRewriteResult> {
	const { prisma, user } = await getAuthenticatedUser();
	return prisma.$transaction(async (tx) => {
		const person = await tx.person.findFirst({
			where: { id, userId: user.id },
			select: personSelect,
		});
		if (!person) return { rewrittenNoteIds: [] };

		const rewrittenNoteIds = await rewritePersonAcrossNotes(tx, user.id, {
			fromId: id,
			toId: null,
			removalText: person.name,
		});
		await rewritePersonAcrossJournals(tx, user.id, {
			fromId: id,
			toId: null,
			removalText: person.name,
		});
		await Promise.all([
			tx.noteLink.deleteMany({
				where: { userId: user.id, kind: "person", targetLabel: id },
			}),
			tx.journalLink.deleteMany({
				where: { userId: user.id, kind: "person", targetLabel: id },
			}),
			tx.person.deleteMany({ where: { id, userId: user.id } }),
		]);
		return { rewrittenNoteIds };
	});
}

export async function mergePersons(sourceId: string, targetId: string): Promise<ChipRewriteResult> {
	if (sourceId === targetId) return { rewrittenNoteIds: [] };

	const { prisma, user } = await getAuthenticatedUser();
	return prisma.$transaction(async (tx) => {
		const [source, target] = await Promise.all([
			tx.person.findFirst({ where: { id: sourceId, userId: user.id }, select: personSelect }),
			tx.person.findFirst({ where: { id: targetId, userId: user.id }, select: personSelect }),
		]);
		if (!source || !target) return { rewrittenNoteIds: [] };

		const rewrittenNoteIds = await rewritePersonAcrossNotes(tx, user.id, {
			fromId: sourceId,
			toId: targetId,
			toName: target.name,
		});
		await rewritePersonAcrossJournals(tx, user.id, {
			fromId: sourceId,
			toId: targetId,
			toName: target.name,
		});
		await Promise.all([
			tx.noteLink.deleteMany({
				where: { userId: user.id, kind: "person", targetLabel: sourceId },
			}),
			tx.journalLink.deleteMany({
				where: { userId: user.id, kind: "person", targetLabel: sourceId },
			}),
			tx.person.deleteMany({ where: { id: sourceId, userId: user.id } }),
		]);
		return { rewrittenNoteIds };
	});
}

export async function listPersonNotes(personId: string): Promise<TaggedNoteSummary[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const [noteLinks, journalLinks] = await Promise.all([
		prisma.noteLink.findMany({
			where: {
				userId: user.id,
				kind: "person",
				targetLabel: personId,
				sourceNote: { deletedAt: null },
			},
			select: { sourceNote: { select: { id: true, name: true, updatedAt: true } } },
		}),
		prisma.journalLink.findMany({
			where: {
				userId: user.id,
				kind: "person",
				targetLabel: personId,
				sourceJournal: { deletedAt: null },
			},
			select: {
				sourceJournal: {
					select: { id: true, title: true, dateKey: true, updatedAt: true },
				},
			},
		}),
	]);

	const seen = new Set<string>();
	const items: TaggedNoteSummary[] = [];
	for (const link of noteLinks) {
		const note = link.sourceNote;
		if (seen.has(note.id)) continue;
		seen.add(note.id);
		items.push({ id: note.id, name: note.name, modifiedAt: note.updatedAt, kind: "note" });
	}
	for (const link of journalLinks) {
		const entry = link.sourceJournal;
		if (seen.has(entry.id)) continue;
		seen.add(entry.id);
		items.push({
			id: entry.id,
			name: entry.title?.trim() || entry.dateKey,
			modifiedAt: entry.updatedAt,
			kind: "journal",
			dateKey: entry.dateKey,
		});
	}
	return items.toSorted((left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime());
}
