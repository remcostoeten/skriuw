"use server";

import { getAuthenticatedUser } from "@/core/db";
import { resolveBatchMembers } from "@/domain/trash/batch";
import { listTrashBatches } from "@/domain/trash/queries";
import type { TrashBatch } from "@/core/workspace-backend/types";

export async function fetchTrashBatches(): Promise<TrashBatch[]> {
	return listTrashBatches();
}

type DeletedRows = {
	folders: { id: string; name: string; parentId: string | null }[];
	notes: { id: string; name: string; parentId: string | null }[];
};

async function loadDeletedRows(
	prisma: Awaited<ReturnType<typeof getAuthenticatedUser>>["prisma"],
	userId: string,
): Promise<DeletedRows> {
	const [folders, notes] = await Promise.all([
		prisma.folder.findMany({
			where: { userId, deletedAt: { not: null } },
			select: { id: true, name: true, parentId: true },
		}),
		prisma.note.findMany({
			where: { userId, deletedAt: { not: null } },
			select: { id: true, name: true, parentId: true },
		}),
	]);
	return { folders, notes };
}

export async function restoreTrashBatch(batchId: string): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	const { folders, notes } = await loadDeletedRows(prisma, user.id);
	const { folderIds, noteIds } = resolveBatchMembers(folders, notes, batchId);
	if (folderIds.length === 0 && noteIds.length === 0) return;

	await prisma.$transaction(async (tx) => {
		if (folderIds.length > 0) {
			await tx.folder.updateMany({
				where: { userId: user.id, id: { in: folderIds } },
				data: { deletedAt: null },
			});
		}
		if (noteIds.length > 0) {
			await tx.note.updateMany({
				where: { userId: user.id, id: { in: noteIds } },
				data: { deletedAt: null },
			});
		}

		const activeFolders = await tx.folder.findMany({
			where: { userId: user.id, deletedAt: null },
			select: { id: true },
		});
		const activeFolderIds = new Set(activeFolders.map((folder) => folder.id));

		const restoredFolders = await tx.folder.findMany({
			where: { userId: user.id, id: { in: folderIds } },
			select: { id: true, parentId: true },
		});
		const folderOrphans = restoredFolders
			.filter((folder) => folder.parentId && !activeFolderIds.has(folder.parentId))
			.map((folder) => folder.id);
		if (folderOrphans.length > 0) {
			await tx.folder.updateMany({
				where: { id: { in: folderOrphans } },
				data: { parentId: null },
			});
		}

		const restoredNotes = await tx.note.findMany({
			where: { userId: user.id, id: { in: noteIds } },
			select: { id: true, parentId: true },
		});
		const noteOrphans = restoredNotes
			.filter((note) => note.parentId && !activeFolderIds.has(note.parentId))
			.map((note) => note.id);
		if (noteOrphans.length > 0) {
			await tx.note.updateMany({
				where: { id: { in: noteOrphans } },
				data: { parentId: null },
			});
		}
	});
}

export async function purgeTrashBatch(batchId: string): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	const { folders, notes } = await loadDeletedRows(prisma, user.id);
	const { folderIds, noteIds } = resolveBatchMembers(folders, notes, batchId);
	if (folderIds.length === 0 && noteIds.length === 0) return;

	await prisma.$transaction([
		prisma.note.deleteMany({ where: { userId: user.id, id: { in: noteIds } } }),
		prisma.folder.deleteMany({ where: { userId: user.id, id: { in: folderIds } } }),
	]);
}

export async function emptyTrash(): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	await prisma.$transaction([
		prisma.note.deleteMany({ where: { userId: user.id, deletedAt: { not: null } } }),
		prisma.folder.deleteMany({ where: { userId: user.id, deletedAt: { not: null } } }),
	]);
}
