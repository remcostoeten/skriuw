"use client";

import { useAuthedApiQuery } from "@/shared/api";
import type { ResolvedNoteLink } from "@/domain/notes/note-links";
import { notesKeys } from "./notes-keys";
import { fetchNoteBacklinks } from "@/domain/notes/actions";

export function useNoteBacklinks(noteId: string | null | undefined) {
	const id = noteId ?? "";

	return useAuthedApiQuery<ResolvedNoteLink[]>(
		notesKeys.backlinks(id),
		() => fetchNoteBacklinks(id),
		{
			// Backlinks change only via the user's own edits, which already
			// invalidate backlinksAll(). Cache between mounts instead of refetching.
			enabled: Boolean(id),
			staleTime: 5 * 60 * 1000,
		},
	);
}
