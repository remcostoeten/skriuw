import { getAuthenticatedUser } from "@/core/db";
import type { TrashBatch } from "@/core/workspace-backend/types";
import {
	folderBatchId,
	noteBatchId,
	rootDeletedFolders,
	resolveBatchMembers,
	type DeletedFolderRow,
	type DeletedNoteRow,
} from "@/domain/trash/batch";

type DeletedNote = DeletedNoteRow & { deletedAt: Date };
type DeletedFolder = DeletedFolderRow & { deletedAt: Date };

export async function listTrashBatches(): Promise<TrashBatch[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const [notes, folders] = (await Promise.all([
		prisma.note.findMany({
			where: { userId: user.id, deletedAt: { not: null } },
			select: { id: true, name: true, parentId: true, deletedAt: true },
		}),
		prisma.folder.findMany({
			where: { userId: user.id, deletedAt: { not: null } },
			select: { id: true, name: true, parentId: true, deletedAt: true },
		}),
	])) as [DeletedNote[], DeletedFolder[]];

	const deletedFolderIds = new Set(folders.map((folder) => folder.id));
	const batches: TrashBatch[] = [];

	for (const folder of rootDeletedFolders(folders)) {
		const id = folderBatchId(folder.id);
		const members = resolveBatchMembers(folders, notes, id);
		batches.push({
			id,
			deletedAt: folder.deletedAt,
			kind: "folder",
			primary: { id: folder.id, name: folder.name },
			noteCount: members.noteIds.length,
			folderCount: members.folderIds.length,
		});
	}

	for (const note of notes) {
		if (note.parentId && deletedFolderIds.has(note.parentId)) continue;
		batches.push({
			id: noteBatchId(note.id),
			deletedAt: note.deletedAt,
			kind: "note",
			primary: { id: note.id, name: note.name },
			noteCount: 1,
			folderCount: 0,
		});
	}

	return batches.sort((left, right) => right.deletedAt.getTime() - left.deletedAt.getTime());
}
