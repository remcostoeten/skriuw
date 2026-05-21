"use client";

import { useApiQuery } from "@/shared/api";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { listNoteVersions } from "@/domain/notes/api";
import type { NoteVersion } from "@/types/notes";
import { notesKeys } from "./notes-keys";

export function useNoteVersions(noteId: string | null | undefined) {
	const auth = useAuthSnapshot();
	const id = noteId ?? "";

	return useApiQuery<NoteVersion[]>(notesKeys.versions(id), () => listNoteVersions(id), {
		enabled: Boolean(id) && auth.isReady && auth.phase === "authenticated",
		staleTime: 30_000,
	});
}
