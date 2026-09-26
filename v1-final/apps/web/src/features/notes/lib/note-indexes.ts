import { NoteFile, NoteFolder } from "@/types/notes";

export type NoteIndexes = {
	activeFile: NoteFile | null;
	filesById: Map<string, NoteFile>;
	foldersById: Map<string, NoteFolder>;
	filesByParentId: Map<string | null, NoteFile[]>;
	foldersByParentId: Map<string | null, NoteFolder[]>;
	descendantCountByFolderId: Map<string, number>;
};

export function buildNoteIndexes(
	files: NoteFile[],
	folders: NoteFolder[],
	activeFileId: string | null,
): NoteIndexes {
	const filesById = new Map<string, NoteFile>();
	const foldersById = new Map<string, NoteFolder>();
	const filesByParentId = new Map<string | null, NoteFile[]>();
	const foldersByParentId = new Map<string | null, NoteFolder[]>();

	for (const file of files) {
		filesById.set(file.id, file);
		const siblings = filesByParentId.get(file.parentId) ?? [];
		siblings.push(file);
		filesByParentId.set(file.parentId, siblings);
	}

	for (const folder of folders) {
		foldersById.set(folder.id, folder);
		const siblings = foldersByParentId.get(folder.parentId) ?? [];
		siblings.push(folder);
		foldersByParentId.set(folder.parentId, siblings);
	}

	const descendantCountByFolderId = new Map<string, number>();

	// The folder-id subtree walk lives in `domain/folders/traversal.ts`; this
	// stays separate because it counts files + folders and memoizes every
	// folder in one O(n) pass. It carries the same `visited` cycle guard as the
	// shared walk, so a corrupt `parentId` chain terminates here too.
	const countDescendants = (folderId: string, visited: Set<string> = new Set()): number => {
		const cached = descendantCountByFolderId.get(folderId);
		if (cached !== undefined) {
			return cached;
		}

		if (visited.has(folderId)) {
			return 0;
		}
		visited.add(folderId);

		const childFiles = filesByParentId.get(folderId)?.length ?? 0;
		const childFolders = foldersByParentId.get(folderId) ?? [];
		const total =
			childFiles +
			childFolders.length +
			childFolders.reduce(
				(sum, childFolder) => sum + countDescendants(childFolder.id, visited),
				0,
			);

		descendantCountByFolderId.set(folderId, total);
		return total;
	};

	for (const folder of folders) {
		countDescendants(folder.id);
	}

	return {
		activeFile: activeFileId ? (filesById.get(activeFileId) ?? null) : null,
		filesById,
		foldersById,
		filesByParentId,
		foldersByParentId,
		descendantCountByFolderId,
	};
}
