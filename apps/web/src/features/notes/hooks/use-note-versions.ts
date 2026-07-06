"use client";

import { useApiQuery } from "@/shared/api";
import type { NoteVersion } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { isGuestScopedId } from "@/domain/notes/note-id";

export function useNoteVersions(noteId: string | null | undefined) {
	const id = noteId ?? "";
	const backend = useWorkspaceBackend();
	// Gate on the backend's own history capability instead of auth phase: the
	// server backend only exists while authenticated, and the desktop (Tauri)
	// backend stores versions locally with no auth at all.
	const canLoad = Boolean(id) && backend.capabilities.history && !isGuestScopedId(id);

	return useApiQuery<NoteVersion[]>(notesKeys.versions(id), () => backend.getNoteVersions(id), {
		// Versions only grow via the user's own saves, which invalidate
		// versionsAll(). Cache between mounts instead of refetching.
		enabled: canLoad,
		staleTime: 5 * 60 * 1000,
	});
}
