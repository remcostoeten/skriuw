"use client";

import { useApiMutation } from "@/core/api";
import { deleteNote } from "@/domain/notes/api";
import { notesKeys } from "./use-notes";
import type { NoteFile } from "@/types/notes";
import { trackNoteDeleted } from "@/shared/lib/analytics";

export function useDeleteNote() {
  const mutation = useApiMutation<string, void, NoteFile[]>(deleteNote, {
    optimistic: {
      queryKey: notesKeys.files(),
      updater: (current, id) => (current ?? []).filter((note) => note.id !== id),
    },
  });

  return {
    ...mutation,
    mutate: (input: string, options?: Parameters<typeof mutation.mutate>[1]) => {
      mutation.mutate(input, {
        ...options,
        onSuccess: (...args) => {
          trackNoteDeleted(input);
          options?.onSuccess?.(...args);
        },
      });
    },
    mutateAsync: async (input: string, options?: Parameters<typeof mutation.mutateAsync>[1]) => {
      const result = await mutation.mutateAsync(input, options);
      trackNoteDeleted(input);
      return result;
    },
  };
}
