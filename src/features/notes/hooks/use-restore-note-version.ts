"use client";

import { useApiMutation } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { restoreNoteVersion } from "@/domain/notes/api";
import { notesKeys } from "./notes-keys";
import type { NoteFile } from "@/types/notes";

export function useRestoreNoteVersion() {
	const queryClient = useQueryClient();

	return useApiMutation<string, { note?: NoteFile; versionCreated: boolean }, NoteFile[]>(
		restoreNoteVersion,
		{
			onSuccess: (result) => {
				if (result.note) {
					queryClient.setQueryData(notesKeys.detail(result.note.id), result.note);
					queryClient.setQueryData<NoteFile[]>(notesKeys.files(), (current = []) =>
						current.map((item) => (item.id === result.note?.id ? result.note! : item)),
					);
					void queryClient.invalidateQueries({ queryKey: notesKeys.backlinksAll() });
					void queryClient.invalidateQueries({ queryKey: notesKeys.versions(result.note.id) });
					return;
				}
				void queryClient.invalidateQueries({ queryKey: notesKeys.versionsAll() });
			},
		},
	);
}
