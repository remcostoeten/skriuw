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
			enabled: Boolean(id),
			staleTime: 0,
		},
	);
}
