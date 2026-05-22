"use server";

import { getAuthenticatedUser } from "@/core/db";
import type { NoteFolder } from "@/domain/notes/models";

type FolderRecord = {
	id: string;
	name: string;
	parentId: string | null;
};

function recordToFolder(record: FolderRecord): NoteFolder {
	return {
		id: record.id,
		name: record.name,
		parentId: record.parentId,
		isOpen: false,
	};
}

export async function listFolders(): Promise<NoteFolder[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const records = await prisma.folder.findMany({
		where: { userId: user.id, deletedAt: null },
		orderBy: { createdAt: "asc" },
		select: { id: true, name: true, parentId: true },
	});
	return records.map(recordToFolder);
}

export type CreateFolderInput = {
	id?: string;
	name: string;
	parentId?: string | null;
};

export async function createFolder(input: CreateFolderInput): Promise<NoteFolder> {
	const { prisma, user } = await getAuthenticatedUser();
	const id = input.id ?? crypto.randomUUID();

	const record = await prisma.folder.upsert({
		where: { id },
		create: {
			id,
			userId: user.id,
			name: input.name,
			parentId: input.parentId ?? null,
		},
		update: {
			name: input.name,
			parentId: input.parentId ?? null,
		},
		select: { id: true, name: true, parentId: true },
	});

	return recordToFolder(record);
}

export type UpdateFolderInput = {
	id: string;
	name?: string;
	parentId?: string | null;
};

export async function updateFolder(input: UpdateFolderInput): Promise<NoteFolder | undefined> {
	const { prisma, user } = await getAuthenticatedUser();

	const { count } = await prisma.folder.updateMany({
		where: { id: input.id, userId: user.id, deletedAt: null },
		data: {
			...(input.name !== undefined && { name: input.name }),
			...(input.parentId !== undefined && { parentId: input.parentId }),
		},
	});
	if (count === 0) return undefined;

	const record = await prisma.folder.findFirst({
		where: { id: input.id, userId: user.id, deletedAt: null },
		select: { id: true, name: true, parentId: true },
	});
	return record ? recordToFolder(record) : undefined;
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
