"use client";

import { useApiMutation } from "@/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { createNote, type CreateNoteInput } from "@/domain/notes/api";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import { notesKeys } from "./use-notes";
import type { NoteFile } from "@/types/notes";

export function useCreateNote() {
  const queryClient = useQueryClient();

  return useApiMutation<CreateNoteInput, NoteFile, NoteFile[]>(createNote, {
    onSuccess: (note) => {
      queryClient.setQueryData(notesKeys.detail(note.id), note);
    },
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
          tags: input.tags ?? [],
        };

        return [...(current ?? []), optimisticNote];
      },
    },
  });
}
