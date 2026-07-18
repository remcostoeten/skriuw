import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { syncNoteLinks } from "@/domain/notes/note-link-sync";
import { syncJournalLinks } from "@/domain/journal/journal-link-sync";

export type DesktopPushPayload = {
	lastSyncedAt?: string;
	folders: Array<{ id: string; name: string; parentId: string | null; sortOrder: number }>;
	notes: Array<{
		id: string;
		name: string;
		content: string;
		richContent: unknown;
		preferredEditorMode: string;
		parentId: string | null;
		sortOrder: number;
		tags: string[];
		properties: unknown;
		icon?: string;
		cover?: string;
		annotationScene?: string;
		createdAt: string;
		modifiedAt: string;
	}>;
	journalEntries: Array<{
		id: string;
		dateKey: string;
		title?: string;
		content: string;
		richContent?: unknown;
		tags: string[];
		mood?: string;
		createdAt: string;
		updatedAt: string;
	}>;
	deletedIds: { notes: string[]; folders: string[]; journalEntries: string[] };
};

export type DesktopPushResult = {
	created: number;
	updated: number;
	deleted: number;
	conflicts: number;
	syncedAt: string;
};

function validDate(value: string | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date : null;
}

function changedAfter(date: Date, boundary: Date | null): boolean {
	return boundary === null || date.getTime() > boundary.getTime();
}

function conflictName(name: string): string {
	const base = name.replace(/\.md$/i, "");
	return `${base} (conflict from Desktop ${new Date().toISOString().slice(0, 10)}).md`;
}

/** Applies one opted-in desktop snapshot. Concurrent note edits are preserved as conflict copies. */
export async function pushDesktopWorkspace(
	prisma: PrismaClient,
	userId: string,
	payload: DesktopPushPayload,
): Promise<DesktopPushResult> {
	const boundary = validDate(payload.lastSyncedAt);
	const counters = { created: 0, updated: 0, deleted: 0, conflicts: 0 };

	await prisma.$transaction(async (tx) => {
		const folders = payload.folders.slice(0, 10_000);
		for (const folder of folders) {
			const existing = await tx.folder.findFirst({ where: { id: folder.id, userId } });
			const data = {
				name: folder.name.slice(0, 200),
				parentId: null,
				sortOrder: folder.sortOrder,
				deletedAt: null,
			};
			if (existing) await tx.folder.update({ where: { id: folder.id }, data });
			else {
				try {
					await tx.folder.create({ data: { id: folder.id, userId, ...data } });
				} catch (error) {
					const owner = await tx.folder.findUnique({
						where: { id: folder.id },
						select: { userId: true, deletedAt: true, name: true },
					});
					console.error("[sync/push] folder id conflict", {
						folderId: folder.id,
						pushingUserId: userId,
						existingOwner: owner,
					});
					throw error;
				}
			}
		}
		const folderIds = new Set(folders.map((folder) => folder.id));
		for (const folder of folders) {
			if (!folder.parentId || !folderIds.has(folder.parentId)) continue;
			await tx.folder.updateMany({
				where: { id: folder.id, userId },
				data: { parentId: folder.parentId },
			});
		}

		for (const note of payload.notes.slice(0, 25_000)) {
			const localModified = validDate(note.modifiedAt) ?? new Date();
			const existing = await tx.note.findFirst({
				where: { id: note.id, userId },
				select: { id: true, content: true, updatedAt: true, deletedAt: true },
			});
			const data = {
				name: note.name.endsWith(".md") ? note.name : `${note.name}.md`,
				content: note.content,
				richContent: note.richContent as Prisma.InputJsonValue,
				preferredEditorMode: note.preferredEditorMode === "raw" ? "raw" : "block",
				parentId: note.parentId,
				sortOrder: note.sortOrder,
				tags: note.tags.slice(0, 64),
				properties: note.properties as Prisma.InputJsonValue,
				icon: note.icon ?? null,
				cover: note.cover ?? null,
				annotationScene: note.annotationScene ?? null,
				deletedAt: null,
			};

			if (!existing) {
				await tx.note.create({
					data: {
						id: note.id,
						userId,
						...data,
						createdAt: validDate(note.createdAt) ?? localModified,
						updatedAt: localModified,
					},
				});
				counters.created++;
			} else if (
				existing.content !== note.content &&
				changedAfter(existing.updatedAt, boundary) &&
				changedAfter(localModified, boundary)
			) {
				await tx.note.create({
					data: {
						...data,
						id: crypto.randomUUID(),
						userId,
						name: conflictName(data.name),
						createdAt: localModified,
						updatedAt: localModified,
					},
				});
				counters.conflicts++;
			} else if (localModified.getTime() >= existing.updatedAt.getTime()) {
				await tx.note.update({
					where: { id: note.id },
					data: { ...data, updatedAt: localModified },
				});
				counters.updated++;
			}

			const persisted = await tx.note.findFirst({
				where: { id: note.id, userId, deletedAt: null },
				select: { id: true, content: true, richContent: true, tags: true },
			});
			if (persisted) {
				await syncNoteLinks(tx, userId, {
					id: persisted.id,
					content: persisted.content,
					richContent: persisted.richContent as never,
					tags: persisted.tags,
				});
			}
		}

		for (const entry of payload.journalEntries.slice(0, 10_000)) {
			const localUpdated = validDate(entry.updatedAt) ?? new Date();
			const existing = await tx.journalEntry.findFirst({
				where: { id: entry.id, userId },
				select: { id: true, content: true, updatedAt: true },
			});
			const data = {
				dateKey: entry.dateKey,
				title: entry.title ?? null,
				content: entry.content,
				richContent: (entry.richContent ?? []) as Prisma.InputJsonValue,
				tags: entry.tags.slice(0, 64),
				mood: entry.mood ?? null,
				deletedAt: null,
			};
			if (!existing) {
				const occupied = await tx.journalEntry.count({
					where: { userId, dateKey: entry.dateKey, deletedAt: null },
				});
				if (!occupied) {
					await tx.journalEntry.create({
						data: { id: entry.id, userId, ...data, updatedAt: localUpdated },
					});
					counters.created++;
				}
			} else if (
				existing.content !== entry.content &&
				changedAfter(existing.updatedAt, boundary) &&
				changedAfter(localUpdated, boundary)
			) {
				await tx.note.create({
					data: {
						userId,
						name: `Journal ${entry.dateKey} (conflict from Desktop).md`,
						content: entry.content,
						richContent: (entry.richContent ?? []) as Prisma.InputJsonValue,
						preferredEditorMode: "raw",
						tags: entry.tags,
						createdAt: localUpdated,
						updatedAt: localUpdated,
					},
				});
				counters.conflicts++;
			} else if (localUpdated.getTime() >= existing.updatedAt.getTime()) {
				await tx.journalEntry.update({
					where: { id: entry.id },
					data: { ...data, updatedAt: localUpdated },
				});
				counters.updated++;
			}
			const persisted = await tx.journalEntry.findFirst({
				where: { id: entry.id, userId, deletedAt: null },
				select: { id: true, content: true, richContent: true, tags: true },
			});
			if (persisted) {
				await syncJournalLinks(tx, userId, {
					id: persisted.id,
					content: persisted.content,
					richContent: persisted.richContent as never,
					tags: persisted.tags,
				});
			}
		}

		for (const id of payload.deletedIds.notes.slice(0, 25_000)) {
			const result = await tx.note.updateMany({
				where: {
					id,
					userId,
					deletedAt: null,
					...(boundary ? { updatedAt: { lte: boundary } } : {}),
				},
				data: { deletedAt: new Date() },
			});
			counters.deleted += result.count;
		}
		for (const id of payload.deletedIds.journalEntries.slice(0, 10_000)) {
			const result = await tx.journalEntry.updateMany({
				where: {
					id,
					userId,
					deletedAt: null,
					...(boundary ? { updatedAt: { lte: boundary } } : {}),
				},
				data: { deletedAt: new Date() },
			});
			counters.deleted += result.count;
		}
		for (const id of payload.deletedIds.folders.slice(0, 10_000)) {
			const result = await tx.folder.updateMany({
				where: {
					id,
					userId,
					deletedAt: null,
					...(boundary ? { updatedAt: { lte: boundary } } : {}),
				},
				data: { deletedAt: new Date() },
			});
			counters.deleted += result.count;
		}
	});

	return { ...counters, syncedAt: new Date().toISOString() };
}
