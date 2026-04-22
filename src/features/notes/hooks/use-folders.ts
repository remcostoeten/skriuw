"use client";

import { useApiQuery } from "@/core/api";
import { listFolders } from "@/domain/folders/api";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { notesKeys } from "./use-notes";
import type { NoteFolder } from "@/types/notes";

export function useFolders() {
  const auth = useAuthSnapshot();

  return useApiQuery<NoteFolder[]>(
    notesKeys.folders(),
    () => listFolders(),
    { enabled: auth.isReady && auth.phase === "authenticated" },
  );
}
