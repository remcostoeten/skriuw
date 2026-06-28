"use client";

import { useApiMutation } from "@/shared/api";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { showUserToast } from "@/shared/lib/user-toast";
import { notesKeys } from "./notes-keys";
import type { NoteFolder } from "@/types/notes";
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
				const descendants = new Set<string>([id]);
				const stack = [id];

				while (stack.length > 0) {
					const current_id = stack.pop();
					for (const folder of current ?? []) {
						if (folder.parentId === current_id && !descendants.has(folder.id)) {
							descendants.add(folder.id);
							stack.push(folder.id);
						}
					}
				}

				return (current ?? []).filter((folder) => !descendants.has(folder.id));
			},
		},
	});
}
