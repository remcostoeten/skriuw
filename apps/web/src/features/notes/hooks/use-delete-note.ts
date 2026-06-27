"use client";

import { useApiMutation } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { showUserToast } from "@/shared/lib/user-toast";
import { notesKeys } from "./notes-keys";
import type { NoteFile } from "@/types/notes";

export function useDeleteNote() {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();

	return useApiMutation<string, void, NoteFile[]>(backend.deleteNote, {
		onSuccess: (_data, id) => {
			queryClient.removeQueries({ queryKey: notesKeys.detail(id) });
			void queryClient.invalidateQueries({ queryKey: notesKeys.backlinksAll() });
		},
		onError: () => {
			showUserToast("Couldn't delete note", "error");
		},
		optimistic: {
			queryKey: notesKeys.files(),
			updater: (current, id) => (current ?? []).filter((note) => note.id !== id),
		},
	});
}
