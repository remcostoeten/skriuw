"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useApiQuery } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { fetchNote } from "@/domain/notes/actions";

export function useNote(noteId: string | null | undefined) {
	const auth = useAuthSnapshot();
	const id = noteId ?? "";
	const queryClient = useQueryClient();

	return useApiQuery<NoteFile | null>(
		notesKeys.detail(id),
		async () => {
			// 1. Detail already in cache (set by create/save/prefetch)
			const cached = queryClient.getQueryData<NoteFile | null>(notesKeys.detail(id));
			if (cached !== undefined) return cached;

			// 2. Fall back to files list (metadata, no richContent) to avoid the
			//    retry loop — the editor will render immediately, then a follow-up
			//    fetch below populates richContent.
			const files = queryClient.getQueryData<NoteFile[]>(notesKeys.files());
			const found = files?.find((f) => f.id === id);

			// Fire a background fetch for full content; update cache when it lands
			fetchNote(id).then((full) => {
				if (full) {
					queryClient.setQueryData(notesKeys.detail(id), full);
				}
			});

			// Return metadata stub immediately (or null) — avoids skeleton
			return found ?? null;
		},
		{
			enabled: Boolean(id) && auth.isReady && auth.phase === "authenticated",
			placeholderData: keepPreviousData,
			staleTime: Infinity,
			retry: false,
		},
	);
}
