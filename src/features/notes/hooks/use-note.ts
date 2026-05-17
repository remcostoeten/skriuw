"use client";

import { useApiQuery } from "@/shared/api";
import { getNote } from "@/domain/notes/api";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "./notes-keys";

export function useNote(noteId: string | null | undefined) {
  const auth = useAuthSnapshot();
  const id = noteId ?? "";

  return useApiQuery<NoteFile | null>(
    notesKeys.detail(id),
    () => getNote(id),
    {
      enabled: Boolean(id) && auth.isReady && auth.phase === "authenticated",
    },
  );
}
