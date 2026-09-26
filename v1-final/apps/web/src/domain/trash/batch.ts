export type DeletedFolderRow = { id: string; name: string; parentId: string | null };
export type DeletedNoteRow = { id: string; name: string; parentId: string | null };

export type TrashBatchMembers = { folderIds: string[]; noteIds: string[] };

export function parseBatchId(batchId: string): { kind: "note" | "folder"; id: string } | null {
	const separator = batchId.indexOf(":");
	if (separator === -1) return null;
	const kind = batchId.slice(0, separator);
	const id = batchId.slice(separator + 1);
	if ((kind !== "note" && kind !== "folder") || !id) return null;
	return { kind, id };
}

export function noteBatchId(noteId: string): string {
	return `note:${noteId}`;
}

export function folderBatchId(folderId: string): string {
	return `folder:${folderId}`;
}

/** The deleted folders whose parent is not itself deleted — the subtree roots a user actually deleted. */
export function rootDeletedFolders<T extends DeletedFolderRow>(folders: T[]): T[] {
	const deletedIds = new Set(folders.map((folder) => folder.id));
	return folders.filter((folder) => !folder.parentId || !deletedIds.has(folder.parentId));
}

function descendantFolderIds(folders: DeletedFolderRow[], rootId: string): Set<string> {
	const ids = new Set<string>([rootId]);
	let added = true;
	while (added) {
		added = false;
		for (const folder of folders) {
			if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
				ids.add(folder.id);
				added = true;
			}
		}
	}
	return ids;
}

/**
 * Resolves which deleted folders + notes a batch id refers to. A `note:` batch
 * is the single note. A `folder:` batch is the deleted subtree rooted at that
 * folder plus every deleted note that lived inside it.
 */
export function resolveBatchMembers(
	folders: DeletedFolderRow[],
	notes: DeletedNoteRow[],
	batchId: string,
): TrashBatchMembers {
	const parsed = parseBatchId(batchId);
	if (!parsed) return { folderIds: [], noteIds: [] };

	if (parsed.kind === "note") {
		const note = notes.find((candidate) => candidate.id === parsed.id);
		return { folderIds: [], noteIds: note ? [note.id] : [] };
	}

	const folderIds = descendantFolderIds(folders, parsed.id);
	if (!folders.some((folder) => folder.id === parsed.id)) {
		return { folderIds: [], noteIds: [] };
	}
	const noteIds = notes.flatMap((note) =>
		note.parentId && folderIds.has(note.parentId) ? [note.id] : [],
	);
	return { folderIds: [...folderIds], noteIds };
}
