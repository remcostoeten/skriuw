"use client";

import { useApiQuery } from "@/shared/api";
import { listNotes } from "@/domain/notes/api";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "./notes-keys";

export { notesKeys };

export function useNotes() {
  const auth = useAuthSnapshot();

  return useApiQuery<NoteFile[]>(
    notesKeys.files(),
    () => listNotes(),
    { enabled: auth.isReady && auth.phase === "authenticated" },
  );
}
