"use client";

import { useAuthedApiQuery } from "@/shared/api";
import type { NoteVersion } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { isGuestScopedId } from "@/domain/notes/note-id";

export function useNoteVersions(noteId: string | null | undefined) {
	const id = noteId ?? "";
	const backend = useWorkspaceBackend();
	const canLoad = Boolean(id) && !isGuestScopedId(id);

	return useAuthedApiQuery<NoteVersion[]>(
		notesKeys.versions(id),
		() => backend.getNoteVersions(id),
		{
			// Versions only grow via the user's own saves, which invalidate
			// versionsAll(). Cache between mounts instead of refetching.
			enabled: canLoad,
			staleTime: 5 * 60 * 1000,
		},
	);
}
