"use client";

import { useApiMutation } from "@/shared/api";
import type { UpdateFolderInput } from "@/domain/folders/actions";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { showUserToast } from "@/shared/lib/user-toast";
import { notesKeys } from "./notes-keys";
import type { NoteFolder } from "@/types/notes";
import { useNotesCacheScope } from "./use-notes-cache-scope";

export function useUpdateFolder() {
	const backend = useWorkspaceBackend();
	const foldersKey = notesKeys.folders(useNotesCacheScope());

	return useApiMutation<UpdateFolderInput, NoteFolder | undefined, NoteFolder[]>(
		backend.updateFolder,
		{
			invalidateKeys: [],
			onError: () => {
				showUserToast("Couldn't save folder", "error");
			},
			optimistic: {
				queryKey: foldersKey,
				updater: (current, input) =>
					(current ?? []).map((folder) =>
						folder.id === input.id
							? {
									...folder,
									name: input.name ?? folder.name,
									parentId:
										input.parentId === undefined
											? folder.parentId
											: input.parentId,
									sortOrder:
										input.sortOrder === undefined
											? folder.sortOrder
											: input.sortOrder,
								}
							: folder,
					),
			},
		},
	);
}
