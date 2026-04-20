"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { updateNote, type UpdateNoteInput } from "@/domain/notes/api";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import { notesKeys } from "./use-notes";
import type { NoteFile, NoteEditorMode, RichTextDocument } from "@/types/notes";

type DebouncedUpdateOptions = {
  onSaving?: (noteId: string) => void;
  onSaved?: (noteId: string) => void;
  onError?: (noteId: string) => void;
};

type DebouncedContentArgs = {
  id: string;
  content: string;
  richContent?: RichTextDocument;
  preferredEditorMode?: NoteEditorMode;
};

export function useDebouncedSave(options: DebouncedUpdateOptions = {}) {
  const queryClient = useQueryClient();
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const versionsRef = useRef(new Map<string, number>());

  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  return ({ id, content, richContent, preferredEditorMode }: DebouncedContentArgs) => {
    const updatedAt = new Date();
    const nextRichContent = richContent ?? markdownToRichDocument(content);
    const nextVersion = (versionsRef.current.get(id) ?? 0) + 1;
    versionsRef.current.set(id, nextVersion);

    // Patch the cache optimistically
    queryClient.setQueryData<NoteFile[]>(notesKeys.files(), (current = []) =>
      current.map((note) =>
        note.id === id
          ? {
              ...note,
              content,
              richContent: nextRichContent,
              preferredEditorMode: preferredEditorMode ?? note.preferredEditorMode,
              modifiedAt: updatedAt,
            }
          : note,
      ),
    );

    options.onSaving?.(id);

    const pendingTimeout = timeoutsRef.current.get(id);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
    }

    const timeoutId = setTimeout(() => {
      timeoutsRef.current.delete(id);
      const requestVersion = versionsRef.current.get(id);

      const input: UpdateNoteInput = {
        id,
        content,
        richContent: nextRichContent,
        preferredEditorMode,
      };

      void updateNote(input)
        .then((note) => {
          if (!note || versionsRef.current.get(id) !== requestVersion) {
            return;
          }

          queryClient.setQueryData<NoteFile[]>(notesKeys.files(), (current = []) =>
            current.map((item) => (item.id === id ? note : item)),
          );
          options.onSaved?.(id);
        })
        .catch(() => {
          if (versionsRef.current.get(id) !== requestVersion) {
            return;
          }

          options.onError?.(id);
        });
    }, 220);

    timeoutsRef.current.set(id, timeoutId);
  };
}
