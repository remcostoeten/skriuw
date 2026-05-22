"use server";

import { prisma } from "@/core/db";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { buildWebStarterContent } from "@/domain/seed/starter-content";
import { Prisma } from "@/generated/prisma/client";

export async function ensureCloudStarterContentSeeded(userId: string): Promise<void> {
	const [existingNote, existingFolder] = await Promise.all([
		prisma.note.findFirst({
			where: { userId, deletedAt: null },
			select: { id: true },
		}),
		prisma.folder.findFirst({
			where: { userId, deletedAt: null },
			select: { id: true },
		}),
	]);

	if (existingNote || existingFolder) {
		return;
	}

	const starter = buildWebStarterContent();

	await prisma.$transaction(async (tx) => {
		if (starter.folders.length > 0) {
			await tx.folder.createMany({
				data: starter.folders.map((folder) => ({
					id: folder.id,
					userId,
					name: folder.name,
					parentId: folder.parentId ?? null,
					...(folder.createdAt ? { createdAt: new Date(folder.createdAt) } : {}),
					...(folder.updatedAt ? { updatedAt: new Date(folder.updatedAt) } : {}),
				})),
				skipDuplicates: true,
			});
		}

		if (starter.notes.length > 0) {
			await tx.note.createMany({
				data: starter.notes.map((note) => ({
					id: note.id,
					userId,
					name: note.name,
					content: note.content,
					richContent: markdownToRichDocument(note.content) as Prisma.InputJsonValue,
					preferredEditorMode: note.preferredEditorMode ?? "block",
					parentId: note.parentId ?? null,
					journalMeta: note.journalMeta
						? (note.journalMeta as Prisma.InputJsonValue)
						: Prisma.JsonNull,
					...(note.createdAt ? { createdAt: new Date(note.createdAt) } : {}),
					...(note.updatedAt ? { updatedAt: new Date(note.updatedAt) } : {}),
				})),
				skipDuplicates: true,
			});
		}

		if (starter.tags.length > 0) {
			await tx.journalTag.createMany({
				data: starter.tags.map((tag) => ({
					id: tag.id,
					userId,
					name: tag.name,
					color: tag.color,
					usageCount: tag.usageCount ?? 0,
					lastUsedAt: tag.lastUsedAt ? new Date(tag.lastUsedAt) : null,
					...(tag.createdAt ? { createdAt: new Date(tag.createdAt) } : {}),
					...(tag.updatedAt ? { updatedAt: new Date(tag.updatedAt) } : {}),
				})),
				skipDuplicates: true,
			});
		}

		if (starter.journalEntries.length > 0) {
			await tx.journalEntry.createMany({
				data: starter.journalEntries.map((entry) => ({
					id: entry.id,
					userId,
					dateKey: entry.dateKey,
					content: entry.content,
					mood: entry.mood ?? null,
					tags: entry.tags ?? [],
					...(entry.createdAt ? { createdAt: new Date(entry.createdAt) } : {}),
					...(entry.updatedAt ? { updatedAt: new Date(entry.updatedAt) } : {}),
				})),
				skipDuplicates: true,
			});
		}
	});
}
