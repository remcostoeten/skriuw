"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useApiQuery } from "@/shared/api/use-api-query";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { useWorkspaceBackend } from "@/core/workspace-backend";

export function useNote(noteId: string | null | undefined) {
	const id = noteId ?? "";
	const backend = useWorkspaceBackend();

	return useApiQuery<NoteFile | null>(
		notesKeys.detail(id),
		() => backend.getNote(id),
		{
			// `staleTime: Infinity` + the workspace warm-up (which seeds detail
			// caches via setQueryData) already serve cached bodies without a fetch,
			// so no manual getQueryData short-circuit — that would also swallow an
			// explicit invalidation and return stale data.
			enabled: Boolean(id),
			placeholderData: keepPreviousData,
			staleTime: Infinity,
			retry: false,
		},
	);
}
