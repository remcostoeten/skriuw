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
