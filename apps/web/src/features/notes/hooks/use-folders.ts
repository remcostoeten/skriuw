"use client";

import { useApiQuery } from "@/shared/api/use-api-query";
import { useQueryClient } from "@tanstack/react-query";
import { notesKeys } from "./notes-keys";
import type { NoteFolder } from "@/types/notes";
import { createCacheQueryFn } from "@/shared/api/cache-query";
import { useWorkspaceBackend } from "@/core/workspace-backend";

export function useFolders() {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();

	return useApiQuery<NoteFolder[]>(
		notesKeys.folders(),
		backend.listFolders ??
			createCacheQueryFn<NoteFolder[]>(queryClient, notesKeys.folders()),
		{
			staleTime: Infinity,
		},
	);
}
