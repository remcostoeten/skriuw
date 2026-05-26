"use client";

import { useApiMutation } from "@/shared/api";
import { createFolder, type CreateFolderInput } from "@/domain/folders/actions";
import { notesKeys } from "./notes-keys";
import type { NoteFolder } from "@/types/notes";

export function useCreateFolder() {
	return useApiMutation<CreateFolderInput, NoteFolder, NoteFolder[]>(createFolder, {
		optimistic: {
			queryKey: notesKeys.folders(),
			updater: (current, input) => {
				const optimisticFolder: NoteFolder = {
					id: input.id ?? crypto.randomUUID(),
					name: input.name,
					parentId: input.parentId ?? null,
					sortOrder: input.sortOrder ?? current?.length ?? 0,
					isOpen: true,
				};

				return [...(current ?? []), optimisticFolder];
			},
		},
	});
}
