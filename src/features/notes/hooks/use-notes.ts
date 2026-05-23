"use client";

import { useApiQuery } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { createCacheQueryFn } from "@/shared/api/cache-query";

export { notesKeys };

export function useNotes() {
	const auth = useAuthSnapshot();
	const queryClient = useQueryClient();

	return useApiQuery<NoteFile[]>(
		notesKeys.files(),
		createCacheQueryFn<NoteFile[]>(queryClient, notesKeys.files()),
		{
			enabled: auth.isReady && auth.phase === "authenticated",
			staleTime: Infinity,
		},
	);
}
