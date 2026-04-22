"use client";

import { useApiMutation } from "@/core/api";
import { deleteNote } from "@/domain/notes/api";
import { notesKeys } from "./use-notes";
import type { NoteFile } from "@/types/notes";

export function useDeleteNote() {
  return useApiMutation<string, void, NoteFile[]>(deleteNote, {
    optimistic: {
      queryKey: notesKeys.files(),
      updater: (current, id) => (current ?? []).filter((note) => note.id !== id),
    },
  });
}
