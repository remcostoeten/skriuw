import { getAuthenticatedUser } from "@/core/db";
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

export async function listFolders(): Promise<NoteFolder[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const records = await prisma.folder.findMany({
		where: { userId: user.id, deletedAt: null },
		orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
		select: { id: true, name: true, parentId: true, sortOrder: true },
	});
	return records.map(recordToFolder);
}
