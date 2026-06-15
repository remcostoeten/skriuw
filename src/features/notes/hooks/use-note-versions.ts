"use client";

import { useAuthedApiQuery } from "@/shared/api";
import type { NoteVersion } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { fetchNoteVersions } from "@/domain/notes/actions";

export function useNoteVersions(noteId: string | null | undefined) {
	const id = noteId ?? "";

	return useAuthedApiQuery<NoteVersion[]>(
		notesKeys.versions(id),
		() => fetchNoteVersions(id),
		{
			// Versions only grow via the user's own saves, which invalidate
			// versionsAll(). Cache between mounts instead of refetching.
			enabled: Boolean(id),
			staleTime: 5 * 60 * 1000,
		},
	);
}
