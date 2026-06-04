"use client";

import { useApiQuery } from "@/shared/api/use-api-query";
import { useQueryClient } from "@tanstack/react-query";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "../lib/notes-keys";
import { createCacheQueryFn } from "@/shared/api/cache-query";

export function useNotes() {
	const queryClient = useQueryClient();

	return useApiQuery<NoteFile[]>(
		notesKeys.files(),
		createCacheQueryFn<NoteFile[]>(queryClient, notesKeys.files()),
		{
			staleTime: Infinity,
		},
	);
}
