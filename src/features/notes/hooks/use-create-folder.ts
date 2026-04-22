"use client";

import { useApiMutation } from "@/core/api";
import { createFolder, type CreateFolderInput } from "@/domain/folders/api";
import { notesKeys } from "./use-notes";
import type { NoteFolder } from "@/types/notes";

export function useCreateFolder() {
  return useApiMutation<CreateFolderInput, NoteFolder, NoteFolder[]>(createFolder, {
    optimistic: {
      queryKey: notesKeys.folders(),
      updater: (current, input) => {
        const optimisticFolder: NoteFolder = {
          id: input.id ?? crypto.randomUUID(),
          name: input.name,
          parentId: input.parentId ?? null,
          isOpen: true,
        };

        return [...(current ?? []), optimisticFolder];
      },
    },
  });
}
