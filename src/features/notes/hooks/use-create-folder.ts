"use client";

import { useApiMutation } from "@/shared/api";
import type { CreateFolderInput } from "@/domain/folders/actions";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { notesKeys } from "./notes-keys";
import type { NoteFolder } from "@/types/notes";

export function useCreateFolder() {
	const backend = useWorkspaceBackend();

	return useApiMutation<CreateFolderInput, NoteFolder, NoteFolder[]>(backend.createFolder, {
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
