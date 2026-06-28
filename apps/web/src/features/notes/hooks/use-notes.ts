"use client";

import { useApiQuery } from "@/shared/api/use-api-query";
import { useQueryClient } from "@tanstack/react-query";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "../lib/notes-keys";
import { createCacheQueryFn } from "@/shared/api/cache-query";
import { useWorkspaceBackend } from "@/core/workspace-backend";

export function useNotes() {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();

	return useApiQuery<NoteFile[]>(
		notesKeys.files(),
		backend.listNotes ??
			createCacheQueryFn<NoteFile[]>(queryClient, notesKeys.files()),
		{
			staleTime: Infinity,
		},
	);
}
