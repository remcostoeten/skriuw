"use client";

import { useApiQuery } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { notesKeys } from "./use-notes";
import type { NoteFolder } from "@/types/notes";
import { createCacheQueryFn } from "@/shared/api/cache-query";

export function useFolders() {
	const auth = useAuthSnapshot();
	const queryClient = useQueryClient();

	return useApiQuery<NoteFolder[]>(
		notesKeys.folders(),
		createCacheQueryFn<NoteFolder[]>(queryClient, notesKeys.folders()),
		{
			enabled: auth.isReady && auth.phase === "authenticated",
			staleTime: Infinity,
		},
	);
}
