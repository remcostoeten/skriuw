"use client";

import { useApiMutation } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { notesKeys } from "./notes-keys";
import type { NoteFile } from "@/types/notes";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { useNotesCacheScope } from "./use-notes-cache-scope";

export function useRestoreNoteVersion() {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();
	const filesKey = notesKeys.files(useNotesCacheScope());

	return useApiMutation<string, { note?: NoteFile; versionCreated: boolean }, NoteFile[]>(
		(versionId) => backend.restoreNoteVersion(versionId),
		{
			onSuccess: (result) => {
				if (result.note) {
					queryClient.setQueryData(notesKeys.detail(result.note.id), result.note);
					queryClient.setQueryData<NoteFile[]>(filesKey, (current = []) =>
						current.map((item) => (item.id === result.note?.id ? result.note! : item)),
					);
					void queryClient.invalidateQueries({ queryKey: notesKeys.backlinksAll() });
					void queryClient.invalidateQueries({
						queryKey: notesKeys.versions(result.note.id),
					});
					return;
				}
				void queryClient.invalidateQueries({ queryKey: notesKeys.versionsAll() });
			},
		},
	);
}
