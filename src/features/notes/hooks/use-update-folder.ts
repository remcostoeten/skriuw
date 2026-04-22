"use client";

import { useApiMutation } from "@/core/api";
import { updateFolder, type UpdateFolderInput } from "@/domain/folders/api";
import { notesKeys } from "./use-notes";
import type { NoteFolder } from "@/types/notes";

export function useUpdateFolder() {
  return useApiMutation<UpdateFolderInput, NoteFolder | undefined, NoteFolder[]>(updateFolder, {
    optimistic: {
      queryKey: notesKeys.folders(),
      updater: (current, input) =>
        (current ?? []).map((folder) =>
          folder.id === input.id
            ? {
                ...folder,
                name: input.name ?? folder.name,
                parentId: input.parentId === undefined ? folder.parentId : input.parentId,
              }
            : folder,
        ),
    },
  });
}
