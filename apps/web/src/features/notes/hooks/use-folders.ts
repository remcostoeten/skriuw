"use client";

import { useApiQuery } from "@/shared/api/use-api-query";
import { useQueryClient } from "@tanstack/react-query";
import { notesKeys } from "./notes-keys";
import type { NoteFolder } from "@/types/notes";
import { createCacheQueryFn } from "@/shared/api/cache-query";
import { useAuth } from "@/core/auth/use-auth";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { useNotesCacheScope } from "./use-notes-cache-scope";

export function useFolders() {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();
	const auth = useAuth();
	const foldersKey = notesKeys.folders(useNotesCacheScope());

	return useApiQuery<NoteFolder[]>(
		foldersKey,
		backend.listFolders ?? createCacheQueryFn<NoteFolder[]>(queryClient, foldersKey),
		{
			enabled: auth.isReady,
			staleTime: Infinity,
		},
	);
}
