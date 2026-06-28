"use client";

import { useAuthedApiQuery } from "@/shared/api";
import type { ResolvedNoteLink } from "@/domain/notes/note-links";
import { notesKeys } from "./notes-keys";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { isGuestScopedId } from "@/domain/notes/note-id";

export function useNoteBacklinks(noteId: string | null | undefined) {
	const id = noteId ?? "";
	const backend = useWorkspaceBackend();
	const canLoad = Boolean(id) && !isGuestScopedId(id);

	return useAuthedApiQuery<ResolvedNoteLink[]>(
		notesKeys.backlinks(id),
		() => backend.getNoteBacklinks(id),
		{
			// Backlinks change only via the user's own edits, which already
			// invalidate backlinksAll(). Cache between mounts instead of refetching.
			enabled: canLoad,
			staleTime: 5 * 60 * 1000,
		},
	);
}
