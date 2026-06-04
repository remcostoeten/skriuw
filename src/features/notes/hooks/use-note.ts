"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useApiQuery } from "@/shared/api/use-api-query";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { fetchNote } from "@/domain/notes/actions";
import { useIsGuestWorkspace } from "@/core/workspace-backend";

export function useNote(noteId: string | null | undefined) {
	const id = noteId ?? "";
	const queryClient = useQueryClient();
	const isGuest = useIsGuestWorkspace();

	return useApiQuery<NoteFile | null>(
		notesKeys.detail(id),
		async () => {
			const cached = queryClient.getQueryData<NoteFile | null>(notesKeys.detail(id));
			if (cached !== undefined) return cached;
			if (isGuest) return null;

			return fetchNote(id);
		},
		{
			enabled: Boolean(id),
			placeholderData: keepPreviousData,
			staleTime: Infinity,
			retry: false,
		},
	);
}
