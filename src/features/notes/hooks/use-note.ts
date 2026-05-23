"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useApiQuery } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { createCacheQueryFn } from "@/shared/api/cache-query";

export function useNote(noteId: string | null | undefined) {
	const auth = useAuthSnapshot();
	const id = noteId ?? "";
	const queryClient = useQueryClient();

	// `placeholderData: keepPreviousData` keeps the previously loaded note's data
	// available while a new note is fetched. This means `isPending` stays `false`
	// during navigation between notes, preventing the entire layout from flashing
	// into loading-skeleton state. Consumers can check `isPlaceholderData` if they
	// need to know that the surfaced data is stale.
	return useApiQuery<NoteFile | null>(
		notesKeys.detail(id),
		createCacheQueryFn<NoteFile | null>(queryClient, notesKeys.detail(id)),
		{
			enabled: Boolean(id) && auth.isReady && auth.phase === "authenticated",
			placeholderData: keepPreviousData,
			staleTime: Infinity,
		},
	);
}
