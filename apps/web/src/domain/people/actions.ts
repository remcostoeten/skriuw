"use server";

import { getAuthenticatedUser } from "@/core/db";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { ChipRewriteResult, TaggedNoteSummary } from "@/core/workspace-backend/types";
import { rewriteNoteForPerson, type PersonChipRewrite } from "@/domain/notes/chip-rewrite";
import type { RichTextDocument } from "@/domain/notes/models";
import { syncNoteLinks } from "@/domain/notes/note-link-sync";
import {
	normalizeNoteProperties,
	type NotePropertyColor,
} from "@/domain/notes/properties";
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

// Reuse-by-name: creating a person whose name already exists returns the
// existing row instead of failing the @@unique([userId, name]) constraint, so
// the same "$mention" / property pick always resolves to one durable record.
export async function createPerson(input: CreatePersonInput): Promise<Person> {
	const validated = parseServerInput(createPersonInputSchema, input);
	const { prisma, user } = await getAuthenticatedUser();
	const row = await prisma.person.upsert({
		where: { userId_name: { userId: user.id, name: validated.name } },
		update: {},
		create: {
			id: validated.id,
			userId: user.id,
			name: validated.name,
			color: validated.color ?? null,
		},
		select: personSelect,
	});
	return toPerson(row);
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

type PersonDb = Pick<PrismaClient, "note" | "noteLink" | "person">;

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
	for (const record of records) {
		const patch = rewriteNoteForPerson(
			{
				richContent: (record.richContent as RichTextDocument | null) ?? [],
				properties: normalizeNoteProperties(record.properties),
			},
			rewrite,
		);
		if (!patch) continue;

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
		rewritten.push(record.id);
	}

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
		await tx.noteLink.deleteMany({
			where: { userId: user.id, kind: "person", targetLabel: id },
		});
		await tx.person.deleteMany({ where: { id, userId: user.id } });
		return { rewrittenNoteIds };
	});
}

export async function mergePersons(
	sourceId: string,
	targetId: string,
): Promise<ChipRewriteResult> {
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
		await tx.noteLink.deleteMany({
			where: { userId: user.id, kind: "person", targetLabel: sourceId },
		});
		await tx.person.deleteMany({ where: { id: sourceId, userId: user.id } });
		return { rewrittenNoteIds };
	});
}

export async function listPersonNotes(personId: string): Promise<TaggedNoteSummary[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const links = await prisma.noteLink.findMany({
		where: {
			userId: user.id,
			kind: "person",
			targetLabel: personId,
			sourceNote: { deletedAt: null },
		},
		select: { sourceNote: { select: { id: true, name: true, updatedAt: true } } },
	});

	const seen = new Set<string>();
	const notes: TaggedNoteSummary[] = [];
	for (const link of links) {
		const note = link.sourceNote;
		if (seen.has(note.id)) continue;
		seen.add(note.id);
		notes.push({ id: note.id, name: note.name, modifiedAt: note.updatedAt });
	}
	return notes.toSorted((left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime());
}
