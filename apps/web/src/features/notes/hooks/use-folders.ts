"use client";

import { useApiQuery } from "@/shared/api/use-api-query";
import { useQueryClient } from "@tanstack/react-query";
import { notesKeys } from "./notes-keys";
import type { NoteFolder } from "@/types/notes";
import { createCacheQueryFn } from "@/shared/api/cache-query";

export function useFolders() {
	const queryClient = useQueryClient();

	return useApiQuery<NoteFolder[]>(
		notesKeys.folders(),
		createCacheQueryFn<NoteFolder[]>(queryClient, notesKeys.folders()),
		{
			staleTime: Infinity,
		},
	);
}
