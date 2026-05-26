"use client";

import { useApiMutation } from "@/shared/api";
import { updateFolder, type UpdateFolderInput } from "@/domain/folders/actions";
import { notesKeys } from "./notes-keys";
import type { NoteFolder } from "@/types/notes";

export function useUpdateFolder() {
	return useApiMutation<UpdateFolderInput, NoteFolder | undefined, NoteFolder[]>(updateFolder, {
		invalidateKeys: [],
		optimistic: {
			queryKey: notesKeys.folders(),
			updater: (current, input) =>
				(current ?? []).map((folder) =>
					folder.id === input.id
						? {
								...folder,
								name: input.name ?? folder.name,
								parentId:
									input.parentId === undefined ? folder.parentId : input.parentId,
								sortOrder:
									input.sortOrder === undefined
										? folder.sortOrder
										: input.sortOrder,
							}
						: folder,
				),
		},
	});
}
