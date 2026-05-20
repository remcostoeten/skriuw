"use client";

import { useApiMutation } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { deleteNote } from "@/domain/notes/api";
import { notesKeys } from "./use-notes";
import type { NoteFile } from "@/types/notes";

export function useDeleteNote() {
	const queryClient = useQueryClient();

	return useApiMutation<string, void, NoteFile[]>(deleteNote, {
		onSuccess: (_data, id) => {
			queryClient.removeQueries({ queryKey: notesKeys.detail(id) });
			void queryClient.invalidateQueries({ queryKey: notesKeys.backlinksAll() });
		},
		optimistic: {
			queryKey: notesKeys.files(),
			updater: (current, id) => (current ?? []).filter((note) => note.id !== id),
		},
	});
}
