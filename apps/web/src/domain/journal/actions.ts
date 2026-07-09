"use server";

import { getAuthenticatedUser } from "@/core/db";
import type { Prisma } from "@/generated/prisma/client";
import { assertResourceIdAvailable, isRecordNotFoundError } from "@/core/persistence/guards";
import { syncJournalLinks } from "@/domain/journal/journal-link-sync";
import type { JournalEntry, JournalTag, MoodLevel } from "@/domain/journal/models";
import type { RichTextDocument } from "@/domain/notes/models";

type EntryRecord = {
	id: string;
	dateKey: string;
	title: string | null;
	content: string;
	richContent: unknown;
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
		title: record.title ?? undefined,
		content: record.content,
		richContent: (record.richContent as RichTextDocument | null) ?? undefined,
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

export type CreateJournalEntryInput = {
	id?: string;
	dateKey: string;
	title?: string | null;
	content: string;
	richContent?: RichTextDocument | null;
	tags?: string[];
	mood?: MoodLevel;
};

const ENTRY_SELECT = {
	id: true,
	dateKey: true,
	title: true,
	content: true,
	richContent: true,
	mood: true,
	tags: true,
	createdAt: true,
	updatedAt: true,
} as const;

export async function listJournalEntries(): Promise<JournalEntry[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const records = await prisma.journalEntry.findMany({
		where: { userId: user.id, deletedAt: null },
		orderBy: { createdAt: "asc" },
		select: ENTRY_SELECT,
	});
	return records.map(recordToEntry);
}

export async function createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
	const { prisma, user } = await getAuthenticatedUser();
	const id = input.id ?? crypto.randomUUID();
	const updateData = {
		dateKey: input.dateKey,
		title: input.title ?? null,
		content: input.content,
		richContent: (input.richContent ?? undefined) as Prisma.InputJsonValue | undefined,
		mood: input.mood ?? null,
		tags: input.tags ?? [],
	};

	async function persistLinks(entry: JournalEntry): Promise<void> {
		await syncJournalLinks(prisma, user.id, {
			id: entry.id,
			content: entry.content,
			richContent: entry.richContent ?? [],
			tags: entry.tags,
		});
	}

	try {
		const record = await prisma.journalEntry.update({
			where: { id, userId: user.id, deletedAt: null },
			data: updateData,
			select: ENTRY_SELECT,
		});
		const entry = recordToEntry(record);
		await persistLinks(entry);
		return entry;
	} catch (error) {
		if (!isRecordNotFoundError(error)) throw error;
	}

	await assertResourceIdAvailable(prisma, "journalEntry", id, user.id);

	const record = await prisma.journalEntry.create({
		data: {
			id,
			userId: user.id,
			...updateData,
		},
		select: ENTRY_SELECT,
	});
	const entry = recordToEntry(record);
	await persistLinks(entry);
	return entry;
}

export type UpdateJournalEntryInput = {
	id: string;
	title?: string | null;
	content?: string;
	richContent?: RichTextDocument | null;
	tags?: string[];
	mood?: MoodLevel | null;
};

export async function updateJournalEntry(
	input: UpdateJournalEntryInput,
): Promise<JournalEntry | undefined> {
	const { prisma, user } = await getAuthenticatedUser();

	try {
		const record = await prisma.journalEntry.update({
			where: { id: input.id, userId: user.id, deletedAt: null },
			data: {
				...(input.title !== undefined && { title: input.title }),
				...(input.content !== undefined && { content: input.content }),
				...(input.richContent !== undefined && {
					richContent: (input.richContent ?? undefined) as
						| Prisma.InputJsonValue
						| undefined,
				}),
				...(input.tags !== undefined && { tags: input.tags }),
				...(input.mood !== undefined && { mood: input.mood }),
			},
			select: ENTRY_SELECT,
		});
		const entry = recordToEntry(record);
		if (
			input.content !== undefined ||
			input.richContent !== undefined ||
			input.tags !== undefined
		) {
			await syncJournalLinks(prisma, user.id, {
				id: entry.id,
				content: entry.content,
				richContent: entry.richContent ?? [],
				tags: entry.tags,
			});
		}
		return entry;
	} catch (error) {
		if (isRecordNotFoundError(error)) return undefined;
		throw error;
	}
}

export async function deleteJournalEntry(id: string): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	await prisma.journalEntry.updateMany({
		where: { id, userId: user.id },
		data: { deletedAt: new Date() },
	});
}

export type CreateJournalTagInput = {
	name: string;
	color: string;
};

export async function listJournalTags(): Promise<JournalTag[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const records = await prisma.journalTag.findMany({
		where: { userId: user.id, deletedAt: null },
		orderBy: { createdAt: "asc" },
		select: { id: true, name: true, color: true, usageCount: true },
	});
	return records.map(recordToTag);
}

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
		select: { id: true, content: true, richContent: true, tags: true },
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

	for (const entry of entries) {
		await syncJournalLinks(prisma, user.id, {
			id: entry.id,
			content: entry.content,
			richContent: (entry.richContent as RichTextDocument | null) ?? [],
			tags: entry.tags.filter((t) => t !== tag.name),
		});
	}
}
