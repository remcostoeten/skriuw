"use client";

import { useApiMutation } from "@/shared/api";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { showUserToast } from "@/shared/lib/user-toast";
import { notesKeys } from "./notes-keys";
import type { NoteFolder } from "@/types/notes";
import { collectFolderSubtreeIds, indexFoldersByParentId } from "@/domain/folders/traversal";
import { useNotesCacheScope } from "./use-notes-cache-scope";

export function useDeleteFolder() {
	const backend = useWorkspaceBackend();
	const scope = useNotesCacheScope();
	const foldersKey = notesKeys.folders(scope);

	return useApiMutation<string, void, NoteFolder[]>(backend.deleteFolder, {
		invalidateKeys: [notesKeys.files(), notesKeys.folders()],
		onError: () => {
			showUserToast("Couldn't delete folder", "error");
		},
		optimistic: {
			queryKey: foldersKey,
			updater: (current, id) => {
				const childrenByParentId = indexFoldersByParentId(current ?? []);
				const descendants = collectFolderSubtreeIds(
					id,
					(parentId) => childrenByParentId.get(parentId) ?? [],
				);

				return (current ?? []).filter((folder) => !descendants.has(folder.id));
			},
		},
	});
}
