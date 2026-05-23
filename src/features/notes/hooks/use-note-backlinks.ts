"use client";

import { useApiQuery } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import type { ResolvedNoteLink } from "@/features/notes/lib/note-links";
import { notesKeys } from "./notes-keys";
import { createCacheQueryFn } from "@/shared/api/cache-query";

export function useNoteBacklinks(noteId: string | null | undefined) {
	const auth = useAuthSnapshot();
	const id = noteId ?? "";
	const queryClient = useQueryClient();

	return useApiQuery<ResolvedNoteLink[]>(
		notesKeys.backlinks(id),
		createCacheQueryFn<ResolvedNoteLink[]>(queryClient, notesKeys.backlinks(id)),
		{
		enabled: Boolean(id) && auth.isReady && auth.phase === "authenticated",
			staleTime: Infinity,
		},
	);
}
