"use client";

import { useApiMutation } from "@/shared/api";
import type { CreateFolderInput } from "@/domain/folders/actions";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { showUserToast } from "@/shared/lib/user-toast";
import { notesKeys } from "./notes-keys";
import type { NoteFolder } from "@/types/notes";

export function useCreateFolder() {
	const backend = useWorkspaceBackend();

	return useApiMutation<CreateFolderInput, NoteFolder, NoteFolder[]>(backend.createFolder, {
		onError: () => {
			showUserToast("Couldn't create folder", "error");
		},
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
