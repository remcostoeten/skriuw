import type { NoteFolder } from "@/domain/notes/models";
import type { FolderId, IsoTime, PersistedFolder } from "@/domain/persistence/types";

function toIsoTime(date: Date): IsoTime {
	return date.toISOString() as IsoTime;
}

export function toPersistedFolder(folder: NoteFolder, updatedAt = new Date()): PersistedFolder {
	return {
		id: folder.id as FolderId,
		name: folder.name,
		parentId: folder.parentId as FolderId | null,
		createdAt: toIsoTime(updatedAt),
		updatedAt: toIsoTime(updatedAt),
	};
}

export function fromPersistedFolder(folder: PersistedFolder, isOpen = false): NoteFolder {
	return {
		id: folder.id,
		name: folder.name,
		parentId: folder.parentId,
		isOpen,
	};
}
