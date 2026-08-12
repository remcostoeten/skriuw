"use client";

import { useAuthedApiQuery } from "@/shared/api";
import type { ResolvedNoteLink } from "@/domain/notes/note-links";
import { notesKeys } from "./notes-keys";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { isGuestScopedId } from "@/domain/notes/note-id";
import { isTauriRuntime } from "@/core/workspace-backend/tauri-backend";

export function useNoteBacklinks(noteId: string | null | undefined) {
	const id = noteId ?? "";
	const backend = useWorkspaceBackend();
	const canLoad = Boolean(id) && !isGuestScopedId(id);

	return useAuthedApiQuery<ResolvedNoteLink[]>(
		notesKeys.backlinks(id),
		() => backend.getNoteBacklinks(id),
		{
			enabled: canLoad,
			// Desktop: short stale window so backlinks reflect newly-saved
			// @-mentions quickly. Web: backlinks are invalidated on every save
			// via reconcileSavedNoteCache, so the long cache is safe.
			staleTime: isTauriRuntime() ? 30_000 : 5 * 60 * 1000,
		},
	);
}
