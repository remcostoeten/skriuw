import { getAuthenticatedUser } from "@/core/db";
import type { JournalEntry, JournalTag } from "@/domain/journal/models";
import { deriveWorkspaceTags } from "@/domain/tags/workspace-tags";

export async function listWorkspaceTags(): Promise<JournalTag[]> {
	const { prisma, user } = await getAuthenticatedUser();

	const [persistedTags, entries, notes] = await Promise.all([
		prisma.journalTag.findMany({
			where: { userId: user.id, deletedAt: null },
			orderBy: { createdAt: "asc" },
			select: { id: true, name: true, color: true, usageCount: true },
		}),
		prisma.journalEntry.findMany({
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
		}),
		prisma.note.findMany({
			where: { userId: user.id, deletedAt: null },
			select: { tags: true, content: true },
		}),
	]);

	const journalEntries: JournalEntry[] = entries.map((entry) => ({
		id: entry.id,
		dateKey: entry.dateKey,
		content: entry.content,
		tags: entry.tags,
		mood: (entry.mood ?? undefined) as JournalEntry["mood"],
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
	}));

	const tags: JournalTag[] = persistedTags.map((tag) => ({
		id: tag.id,
		name: tag.name,
		color: tag.color,
		usageCount: tag.usageCount,
	}));

	return deriveWorkspaceTags(journalEntries, tags, []);
}
