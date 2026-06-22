"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useApiQuery } from "@/shared/api/use-api-query";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { useWorkspaceBackend } from "@/core/workspace-backend";

export function useNote(noteId: string | null | undefined) {
	const id = noteId ?? "";
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();

	return useApiQuery<NoteFile | null>(
		notesKeys.detail(id),
		async () => {
			const cached = queryClient.getQueryData<NoteFile | null>(notesKeys.detail(id));
			if (cached !== undefined) return cached;
			return backend.getNote(id);
		},
		{
			enabled: Boolean(id),
			placeholderData: keepPreviousData,
			staleTime: Infinity,
			retry: false,
		},
	);
}
