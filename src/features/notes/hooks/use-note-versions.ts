"use client";

import { useApiQuery } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import type { NoteVersion } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { createCacheQueryFn } from "@/shared/api/cache-query";

export function useNoteVersions(noteId: string | null | undefined) {
	const auth = useAuthSnapshot();
	const id = noteId ?? "";
	const queryClient = useQueryClient();

	return useApiQuery<NoteVersion[]>(
		notesKeys.versions(id),
		createCacheQueryFn<NoteVersion[]>(queryClient, notesKeys.versions(id)),
		{
		enabled: Boolean(id) && auth.isReady && auth.phase === "authenticated",
			staleTime: Infinity,
		},
	);
}
