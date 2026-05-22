"use server";

import { getAuthenticatedUser } from "@/core/db";
import type { JournalEntry, JournalTag, MoodLevel } from "@/domain/journal/models";

type EntryRecord = {
	id: string;
	dateKey: string;
	content: string;
	mood: string | null;
	tags: string[];
	createdAt: Date;
	updatedAt: Date;
};

type TagRecord = {
	id: string;
	name: string;
	color: string;
	usageCount: number;
};

function recordToEntry(record: EntryRecord): JournalEntry {
	return {
		id: record.id,
		dateKey: record.dateKey,
		content: record.content,
		tags: record.tags,
		mood: (record.mood ?? undefined) as MoodLevel | undefined,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

function recordToTag(record: TagRecord): JournalTag {
	return {
		id: record.id,
		name: record.name,
		color: record.color,
		usageCount: record.usageCount,
	};
}

export async function listJournalEntries(): Promise<JournalEntry[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const records = await prisma.journalEntry.findMany({
		where: { userId: user.id, deletedAt: null },
		orderBy: { createdAt: "asc" },
		select: {
			id: true,
			dateKey: true,
			content: true,
			mood: true,
			tags: true,
			createdAt: true,
			updatedAt: true,
		},
	});
	return records.map(recordToEntry);
}

export type CreateJournalEntryInput = {
	id?: string;
	dateKey: string;
	content: string;
	tags?: string[];
	mood?: MoodLevel;
};

export async function createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
	const { prisma, user } = await getAuthenticatedUser();
	const id = input.id ?? crypto.randomUUID();
	const record = await prisma.journalEntry.upsert({
		where: { id },
		create: {
			id,
			userId: user.id,
			dateKey: input.dateKey,
			content: input.content,
			mood: input.mood ?? null,
			tags: input.tags ?? [],
		},
		update: {
			dateKey: input.dateKey,
			content: input.content,
			mood: input.mood ?? null,
			tags: input.tags ?? [],
		},
		select: {
			id: true,
			dateKey: true,
			content: true,
			mood: true,
			tags: true,
			createdAt: true,
			updatedAt: true,
		},
	});
	return recordToEntry(record);
}

export type UpdateJournalEntryInput = {
	id: string;
	content?: string;
	tags?: string[];
	mood?: MoodLevel | null;
};

export async function updateJournalEntry(
	input: UpdateJournalEntryInput,
): Promise<JournalEntry | undefined> {
	const { prisma, user } = await getAuthenticatedUser();

	const { count } = await prisma.journalEntry.updateMany({
		where: { id: input.id, userId: user.id, deletedAt: null },
		data: {
			...(input.content !== undefined && { content: input.content }),
			...(input.tags !== undefined && { tags: input.tags }),
			...(input.mood !== undefined && { mood: input.mood }),
		},
	});
	if (count === 0) return undefined;

	const record = await prisma.journalEntry.findFirst({
		where: { id: input.id, userId: user.id, deletedAt: null },
		select: {
			id: true,
			dateKey: true,
			content: true,
			mood: true,
			tags: true,
			createdAt: true,
			updatedAt: true,
		},
	});
	return record ? recordToEntry(record) : undefined;
}

export async function deleteJournalEntry(id: string): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	await prisma.journalEntry.updateMany({
		where: { id, userId: user.id },
		data: { deletedAt: new Date() },
	});
}

export async function listJournalTags(): Promise<JournalTag[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const records = await prisma.journalTag.findMany({
		where: { userId: user.id, deletedAt: null },
		orderBy: { createdAt: "asc" },
		select: { id: true, name: true, color: true, usageCount: true },
	});
	return records.map(recordToTag);
}

export type CreateJournalTagInput = {
	name: string;
	color: string;
};

export async function createJournalTag(input: CreateJournalTagInput): Promise<JournalTag> {
	const { prisma, user } = await getAuthenticatedUser();
	const record = await prisma.journalTag.create({
		data: {
			userId: user.id,
			name: input.name,
			color: input.color,
		},
		select: { id: true, name: true, color: true, usageCount: true },
	});
	return recordToTag(record);
}

export async function deleteJournalTag(id: string): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	const tag = await prisma.journalTag.findFirst({
		where: { id, userId: user.id, deletedAt: null },
		select: { name: true },
	});
	if (!tag) return;

	const entries = await prisma.journalEntry.findMany({
		where: { userId: user.id, deletedAt: null, tags: { has: tag.name } },
		select: { id: true, tags: true },
	});

	const now = new Date();
	await prisma.$transaction([
		...entries.map((entry) =>
			prisma.journalEntry.update({
				where: { id: entry.id },
				data: { tags: entry.tags.filter((t) => t !== tag.name) },
			}),
		),
		prisma.journalTag.update({
			where: { id },
			data: { deletedAt: now },
		}),
	]);
}
