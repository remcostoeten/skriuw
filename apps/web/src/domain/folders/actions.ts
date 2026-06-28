"use server";

import { getAuthenticatedUser } from "@/core/db";
import {
	assertOwnedParentFolder,
	assertResourceIdAvailable,
	isRecordNotFoundError,
} from "@/domain/persistence/guards";
import {
	createFolderInputSchema,
	parseServerInput,
	updateFolderInputSchema,
} from "@/domain/validation/schemas";
import type { NoteFolder } from "@/domain/notes/models";

type FolderRecord = {
	id: string;
	name: string;
	parentId: string | null;
	sortOrder: number;
};

function recordToFolder(record: FolderRecord): NoteFolder {
	return {
		id: record.id,
		name: record.name,
		parentId: record.parentId,
		sortOrder: record.sortOrder,
		isOpen: false,
	};
}

export type CreateFolderInput = {
	id?: string;
	name: string;
	parentId?: string | null;
	sortOrder?: number;
};

export async function listFolders(): Promise<NoteFolder[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const records = await prisma.folder.findMany({
		where: { userId: user.id, deletedAt: null },
		orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
		select: { id: true, name: true, parentId: true, sortOrder: true },
	});
	return records.map(recordToFolder);
}

export async function createFolder(input: CreateFolderInput): Promise<NoteFolder> {
	const validated = parseServerInput(createFolderInputSchema, input);
	const { prisma, user } = await getAuthenticatedUser();
	const id = validated.id ?? crypto.randomUUID();
	const parentId = validated.parentId ?? null;
	await assertOwnedParentFolder(prisma, user.id, parentId);
	const [lastFolder, lastNote] = await Promise.all([
		prisma.folder.aggregate({
			where: { userId: user.id, deletedAt: null, parentId },
			_max: { sortOrder: true },
		}),
		prisma.note.aggregate({
			where: { userId: user.id, deletedAt: null, parentId },
			_max: { sortOrder: true },
		}),
	]);
	const sortOrder =
		validated.sortOrder ??
		Math.max(lastFolder._max.sortOrder ?? -1, lastNote._max.sortOrder ?? -1) + 1;

	const updateData = {
		name: validated.name,
		parentId,
		sortOrder,
	};

	try {
		const record = await prisma.folder.update({
			where: { id, userId: user.id, deletedAt: null },
			data: updateData,
			select: { id: true, name: true, parentId: true, sortOrder: true },
		});
		return recordToFolder(record);
	} catch (error) {
		if (!isRecordNotFoundError(error)) throw error;
	}

	await assertResourceIdAvailable(prisma, "folder", id, user.id);

	const record = await prisma.folder.create({
		data: {
			id,
			userId: user.id,
			...updateData,
		},
		select: { id: true, name: true, parentId: true, sortOrder: true },
	});

	return recordToFolder(record);
}

export type UpdateFolderInput = {
	id: string;
	name?: string;
	parentId?: string | null;
	sortOrder?: number;
};

export async function updateFolder(input: UpdateFolderInput): Promise<NoteFolder | undefined> {
	const validated = parseServerInput(updateFolderInputSchema, input);
	const { prisma, user } = await getAuthenticatedUser();
	if (validated.parentId !== undefined) {
		await assertOwnedParentFolder(prisma, user.id, validated.parentId);
	}

	try {
		const record = await prisma.folder.update({
			where: { id: validated.id, userId: user.id, deletedAt: null },
			data: {
				...(validated.name !== undefined && { name: validated.name }),
				...(validated.parentId !== undefined && { parentId: validated.parentId }),
				...(validated.sortOrder !== undefined && { sortOrder: validated.sortOrder }),
			},
			select: { id: true, name: true, parentId: true, sortOrder: true },
		});
		return recordToFolder(record);
	} catch (error) {
		if (isRecordNotFoundError(error)) return undefined;
		throw error;
	}
}

export async function deleteFolder(id: string): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();

	const allFolders = await prisma.folder.findMany({
		where: { userId: user.id, deletedAt: null },
		select: { id: true, parentId: true },
	});

	const descendants = new Set<string>([id]);
	const stack = [id];
	while (stack.length > 0) {
		const current = stack.pop();
		for (const folder of allFolders) {
			if (folder.parentId === current && !descendants.has(folder.id)) {
				descendants.add(folder.id);
				stack.push(folder.id);
			}
		}
	}

	const folderIds = Array.from(descendants);
	const notes = await prisma.note.findMany({
		where: { userId: user.id, deletedAt: null, parentId: { in: folderIds } },
		select: { id: true },
	});
	const noteIds = notes.map((n) => n.id);

	const now = new Date();
	await prisma.$transaction([
		prisma.folder.updateMany({
			where: { userId: user.id, id: { in: folderIds } },
			data: { deletedAt: now },
		}),
		...(noteIds.length > 0
			? [
					prisma.note.updateMany({
						where: { userId: user.id, id: { in: noteIds } },
						data: { deletedAt: now },
					}),
				]
			: []),
	]);
}
