"use client";

import { useApiQuery } from "@/shared/api/use-api-query";
import { useQueryClient } from "@tanstack/react-query";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "../lib/notes-keys";
import { createCacheQueryFn } from "@/shared/api/cache-query";
import { useAuth } from "@/core/auth/use-auth";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { useNotesCacheScope } from "./use-notes-cache-scope";

export function useNotes() {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();
	const auth = useAuth();
	const filesKey = notesKeys.files(useNotesCacheScope());

	return useApiQuery<NoteFile[]>(
		filesKey,
		backend.listNotes ?? createCacheQueryFn<NoteFile[]>(queryClient, filesKey),
		{
			enabled: auth.isReady,
			staleTime: Infinity,
		},
	);
}
