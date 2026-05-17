"use client";

import { useApiQuery } from "@/shared/api";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { listNoteBacklinks } from "@/features/notes/server/backlinks";
import type { ResolvedNoteLink } from "@/features/notes/lib/note-links";
import { notesKeys } from "./notes-keys";

export function useNoteBacklinks(noteId: string | null | undefined) {
  const auth = useAuthSnapshot();
  const id = noteId ?? "";

  return useApiQuery<ResolvedNoteLink[]>(
    notesKeys.backlinks(id),
    () => listNoteBacklinks(id),
    {
      enabled: Boolean(id) && auth.isReady && auth.phase === "authenticated",
      staleTime: 30_000,
    },
  );
}
