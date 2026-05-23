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

export async function listJournalTags(): Promise<JournalTag[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const records = await prisma.journalTag.findMany({
		where: { userId: user.id, deletedAt: null },
		orderBy: { createdAt: "asc" },
		select: { id: true, name: true, color: true, usageCount: true },
	});
	return records.map(recordToTag);
}
