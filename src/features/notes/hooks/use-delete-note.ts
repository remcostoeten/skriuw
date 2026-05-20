"use client";

import { useApiMutation } from "@/shared/api";
import { deleteNote } from "@/domain/notes/api";
import { notesKeys } from "./use-notes";
import type { NoteFile } from "@/types/notes";

export function useDeleteNote() {
  return useApiMutation<string, boolean, NoteFile[]>(
    async (id) => {
      const deleted = await deleteNote(id);
      if (!deleted) {
        throw new Error("Note not found");
      }

      return deleted;
    },
    {
      optimistic: {
        queryKey: notesKeys.files(),
        updater: (current, id) => (current ?? []).filter((note) => note.id !== id),
      },
    },
  );
}
