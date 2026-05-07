"use client";

import { useApiMutation } from "@/core/api";
import { updateNote, type UpdateNoteInput } from "@/domain/notes/api";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import { notesKeys } from "./use-notes";
import type { NoteFile } from "@/types/notes";

export function useUpdateNote() {
  return useApiMutation<UpdateNoteInput, NoteFile | undefined, NoteFile[]>(updateNote, {
    optimistic: {
      queryKey: notesKeys.files(),
      updater: (current, input) =>
        (current ?? []).map((note) =>
          note.id === input.id
            ? {
                ...note,
                name: input.name
                  ? input.name.endsWith(".md") ? input.name : `${input.name}.md`
                  : note.name,
                content: input.content ?? note.content,
                richContent:
                  input.richContent ??
                  (input.content !== undefined
                    ? markdownToRichDocument(input.content)
                    : note.richContent),
                preferredEditorMode: input.preferredEditorMode ?? note.preferredEditorMode,
                parentId: input.parentId === undefined ? note.parentId : input.parentId,
                tags: input.tags === undefined ? note.tags : input.tags,
                modifiedAt: new Date(),
              }
            : note,
        ),
    },
  });
}
