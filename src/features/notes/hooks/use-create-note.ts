"use client";

import { useApiMutation } from "@/core/api";
import { createNote, type CreateNoteInput } from "@/domain/notes/api";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import { notesKeys } from "./use-notes";
import type { NoteFile } from "@/types/notes";
import { trackNoteCreated } from "@/shared/lib/analytics";

export function useCreateNote() {
  const mutation = useApiMutation<CreateNoteInput, NoteFile, NoteFile[]>(createNote, {
    optimistic: {
      queryKey: notesKeys.files(),
      updater: (current, input) => {
        const optimisticNote: NoteFile = {
          id: input.id ?? crypto.randomUUID(),
          name: input.name.endsWith(".md") ? input.name : `${input.name}.md`,
          content: input.content,
          richContent: input.richContent ?? markdownToRichDocument(input.content),
          preferredEditorMode: input.preferredEditorMode ?? "block",
          createdAt: new Date(),
          modifiedAt: new Date(),
          parentId: input.parentId ?? null,
        };

        return [...(current ?? []), optimisticNote];
      },
    },
  });

  return {
    ...mutation,
    mutate: (input: CreateNoteInput, options?: Parameters<typeof mutation.mutate>[1]) => {
      const noteId = input.id ?? crypto.randomUUID();
      mutation.mutate(input, {
        ...options,
        onSuccess: (...args) => {
          trackNoteCreated(noteId, { name: input.name });
          options?.onSuccess?.(...args);
        },
      });
    },
    mutateAsync: async (input: CreateNoteInput, options?: Parameters<typeof mutation.mutateAsync>[1]) => {
      const noteId = input.id ?? crypto.randomUUID();
      const result = await mutation.mutateAsync(input, options);
      trackNoteCreated(noteId, { name: input.name });
      return result;
    },
  };
}
