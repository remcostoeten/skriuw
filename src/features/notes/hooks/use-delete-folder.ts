"use client";

import { useApiMutation } from "@/core/api";
import { deleteFolder } from "@/domain/folders/api";
import { notesKeys } from "./use-notes";
import type { NoteFile, NoteFolder } from "@/types/notes";

export function useDeleteFolder() {
  return useApiMutation<string, void, NoteFolder[]>(deleteFolder, {
    invalidateKeys: [notesKeys.files(), notesKeys.folders()],
    optimistic: {
      queryKey: notesKeys.folders(),
      updater: (current, id) => {
        // Collect descendant folder IDs
        const descendants = new Set<string>([id]);
        const stack = [id];

        while (stack.length > 0) {
          const current_id = stack.pop();
          for (const folder of current ?? []) {
            if (folder.parentId === current_id && !descendants.has(folder.id)) {
              descendants.add(folder.id);
              stack.push(folder.id);
            }
          }
        }

        return (current ?? []).filter((folder) => !descendants.has(folder.id));
      },
    },
  });
}
