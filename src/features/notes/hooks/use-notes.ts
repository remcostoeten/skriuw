"use client";

import { useApiQuery } from "@/core/api";
import { listNotes } from "@/domain/notes/api";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import type { NoteFile } from "@/types/notes";

export const notesKeys = {
  all: ["notes"] as const,
  files: () => [...notesKeys.all, "files"] as const,
  folders: () => [...notesKeys.all, "folders"] as const,
};

export function useNotes() {
  const auth = useAuthSnapshot();

  return useApiQuery<NoteFile[]>(
    notesKeys.files(),
    () => listNotes(),
    { enabled: auth.isReady && auth.phase === "authenticated" },
  );
}
