"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthedApiQuery } from "@/shared/api";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { fetchNote } from "@/domain/notes/actions";

export function useNote(noteId: string | null | undefined) {
	const id = noteId ?? "";
	const queryClient = useQueryClient();

	return useAuthedApiQuery<NoteFile | null>(
		notesKeys.detail(id),
		async () => {
			const cached = queryClient.getQueryData<NoteFile | null>(notesKeys.detail(id));
			if (cached !== undefined) return cached;

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
