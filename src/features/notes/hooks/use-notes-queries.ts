"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFolder, deleteFolder, listFolders, updateFolder } from "@/core/persistence/folders";
import { createNote, deleteNote, listNotes, updateNote } from "@/core/persistence/notes";
import type { CreateFolderInput, UpdateFolderInput } from "@/core/folders";
import type { CreateNoteInput, UpdateNoteInput } from "@/core/notes";
import type { FolderId, MarkdownContent, NoteId } from "@/core/shared/persistence-types";
import { getWorkspaceId } from "@/platform/auth";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { usePreferencesStore } from "@/features/settings/store";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import type { SaveStatus } from "@/shared/components/save-status-badge";
import type { NoteFile, NoteFolder, NoteEditorMode, RichTextDocument } from "@/types/notes";

export const notesKeys = {
  all: ["notes"] as const,
  files: (workspaceId: string) => [...notesKeys.all, "files", workspaceId] as const,
  folders: (workspaceId: string) => [...notesKeys.all, "folders", workspaceId] as const,
};

function buildStarterNote(): CreateNoteInput {
  const content = `# Welcome

This workspace starts with one note instead of an empty state.

## Try rich text

- Turn this into a heading
- Add a checklist
- Paste a link
- Write a few lines and switch editor modes

> The first note should feel usable immediately.
`;

  return {
    id: crypto.randomUUID() as NoteId,
    name: "Welcome.md",
    content: content as MarkdownContent,
    richContent: markdownToRichDocument(content),
    preferredEditorMode: "block",
    createdAt: new Date(),
    updatedAt: new Date(),
    parentId: null as FolderId | null,
  };
}

function collectDescendantFolderIds(folders: NoteFolder[], folderId: string): string[] {
  const descendants = new Set<string>([folderId]);
  const stack = [folderId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const folder of folders) {
      if (folder.parentId === current && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        stack.push(folder.id);
      }
    }
  }

  return Array.from(descendants);
}

function replaceNote(notes: NoteFile[], nextNote: NoteFile): NoteFile[] {
  return notes.map((note) => (note.id === nextNote.id ? nextNote : note));
}

function replaceFolder(folders: NoteFolder[], nextFolder: NoteFolder): NoteFolder[] {
  return folders.map((folder) => (folder.id === nextFolder.id ? nextFolder : folder));
}

export function useNotesQuery() {
  const workspaceId = getWorkspaceId();
  const auth = useAuthSnapshot();

  return useQuery({
    queryKey: notesKeys.files(workspaceId),
    queryFn: async () => {
      const notes = await listNotes();
      if (notes.length > 0) {
        return notes;
      }

      const starter = await createNote(buildStarterNote());
      return [starter];
    },
    enabled: auth.isReady && auth.phase === "authenticated" && !!workspaceId,
  });
}

export function useNoteFoldersQuery() {
  const workspaceId = getWorkspaceId();
  const auth = useAuthSnapshot();

  return useQuery({
    queryKey: notesKeys.folders(workspaceId),
    queryFn: () => listFolders(),
    enabled: auth.isReady && auth.phase === "authenticated" && !!workspaceId,
  });
}

export function useCreateNoteMutation() {
  const queryClient = useQueryClient();
  const workspaceId = getWorkspaceId();

  return useMutation({
    mutationFn: (input: CreateNoteInput) => createNote(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: notesKeys.files(workspaceId) });
      const previousNotes =
        queryClient.getQueryData<NoteFile[]>(notesKeys.files(workspaceId)) ?? [];
      const optimisticNote: NoteFile = {
        id: input.id as string,
        name: input.name.endsWith(".md") ? input.name : `${input.name}.md`,
        content: input.content as string,
        richContent: input.richContent ?? markdownToRichDocument(input.content as string),
        preferredEditorMode: input.preferredEditorMode ?? "block",
        createdAt: input.createdAt ?? new Date(),
        modifiedAt: input.updatedAt ?? input.createdAt ?? new Date(),
        parentId: (input.parentId as string | null | undefined) ?? null,
      };

      queryClient.setQueryData<NoteFile[]>(notesKeys.files(workspaceId), [
        ...previousNotes,
        optimisticNote,
      ]);
      usePreferencesStore.getState().incrementNoteCount();

      return { previousNotes };
    },
    onError: (_error, _input, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(notesKeys.files(workspaceId), context.previousNotes);
      }
    },
    onSuccess: (note) => {
      queryClient.setQueryData<NoteFile[]>(notesKeys.files(workspaceId), (current = []) =>
        current.some((item) => item.id === note.id)
          ? replaceNote(current, note)
          : [...current, note],
      );
    },
  });
}

export function useCreateFolderMutation() {
  const queryClient = useQueryClient();
  const workspaceId = getWorkspaceId();

  return useMutation({
    mutationFn: (input: CreateFolderInput) => createFolder(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: notesKeys.folders(workspaceId) });
      const previousFolders =
        queryClient.getQueryData<NoteFolder[]>(notesKeys.folders(workspaceId)) ?? [];
      const optimisticFolder: NoteFolder = {
        id: input.id as string,
        name: input.name,
        parentId: (input.parentId as string | null | undefined) ?? null,
        isOpen: true,
      };

      queryClient.setQueryData<NoteFolder[]>(notesKeys.folders(workspaceId), [
        ...previousFolders,
        optimisticFolder,
      ]);

      return { previousFolders };
    },
    onError: (_error, _input, context) => {
      if (context?.previousFolders) {
        queryClient.setQueryData(notesKeys.folders(workspaceId), context.previousFolders);
      }
    },
    onSuccess: (folder) => {
      queryClient.setQueryData<NoteFolder[]>(notesKeys.folders(workspaceId), (current = []) =>
        current.some((item) => item.id === folder.id)
          ? replaceFolder(current, folder)
          : [...current, folder],
      );
    },
  });
}

export function useUpdateNoteMutation() {
  const queryClient = useQueryClient();
  const workspaceId = getWorkspaceId();

  return useMutation({
    mutationFn: (input: UpdateNoteInput) => updateNote(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: notesKeys.files(workspaceId) });
      const previousNotes =
        queryClient.getQueryData<NoteFile[]>(notesKeys.files(workspaceId)) ?? [];
      const updatedAt = input.updatedAt ?? new Date();

      queryClient.setQueryData<NoteFile[]>(notesKeys.files(workspaceId), (current = []) =>
        current.map((note) =>
          note.id === input.id
            ? {
                ...note,
                name: input.name
                  ? input.name.endsWith(".md")
                    ? input.name
                    : `${input.name}.md`
                  : note.name,
                content: input.content ?? note.content,
                richContent:
                  input.richContent ??
                  (input.content !== undefined
                    ? markdownToRichDocument(input.content as string)
                    : note.richContent),
                preferredEditorMode: input.preferredEditorMode ?? note.preferredEditorMode,
                parentId:
                  input.parentId === undefined ? note.parentId : (input.parentId as string | null),
                modifiedAt: updatedAt,
              }
            : note,
        ),
      );

      return { previousNotes };
    },
    onError: (_error, _input, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(notesKeys.files(workspaceId), context.previousNotes);
      }
    },
    onSuccess: (note, input) => {
      if (!note) {
        return;
      }

      queryClient.setQueryData<NoteFile[]>(notesKeys.files(workspaceId), (current = []) =>
        current.map((item) => (item.id === input.id ? note : item)),
      );
    },
  });
}

export function useUpdateFolderMutation() {
  const queryClient = useQueryClient();
  const workspaceId = getWorkspaceId();

  return useMutation({
    mutationFn: (input: UpdateFolderInput) => updateFolder(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: notesKeys.folders(workspaceId) });
      const previousFolders =
        queryClient.getQueryData<NoteFolder[]>(notesKeys.folders(workspaceId)) ?? [];

      queryClient.setQueryData<NoteFolder[]>(notesKeys.folders(workspaceId), (current = []) =>
        current.map((folder) =>
          folder.id === input.id
            ? {
                ...folder,
                name: input.name ?? folder.name,
                parentId:
                  input.parentId === undefined
                    ? folder.parentId
                    : (input.parentId as string | null),
              }
            : folder,
        ),
      );

      return { previousFolders };
    },
    onError: (_error, _input, context) => {
      if (context?.previousFolders) {
        queryClient.setQueryData(notesKeys.folders(workspaceId), context.previousFolders);
      }
    },
    onSuccess: (folder, input) => {
      if (!folder) {
        return;
      }

      queryClient.setQueryData<NoteFolder[]>(notesKeys.folders(workspaceId), (current = []) =>
        current.map((item) => (item.id === input.id ? { ...folder, isOpen: item.isOpen } : item)),
      );
    },
  });
}

export function useDeleteNoteMutation() {
  const queryClient = useQueryClient();
  const workspaceId = getWorkspaceId();

  return useMutation({
    mutationFn: (id: NoteId) => deleteNote(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notesKeys.files(workspaceId) });
      const previousNotes =
        queryClient.getQueryData<NoteFile[]>(notesKeys.files(workspaceId)) ?? [];

      queryClient.setQueryData<NoteFile[]>(notesKeys.files(workspaceId), (current = []) =>
        current.filter((note) => note.id !== id),
      );

      return { previousNotes };
    },
    onError: (_error, _id, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(notesKeys.files(workspaceId), context.previousNotes);
      }
    },
  });
}

export function useDeleteFolderMutation() {
  const queryClient = useQueryClient();
  const workspaceId = getWorkspaceId();

  return useMutation({
    mutationFn: (id: FolderId) => deleteFolder(id),
    onMutate: async (id) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: notesKeys.files(workspaceId) }),
        queryClient.cancelQueries({ queryKey: notesKeys.folders(workspaceId) }),
      ]);

      const previousNotes =
        queryClient.getQueryData<NoteFile[]>(notesKeys.files(workspaceId)) ?? [];
      const previousFolders =
        queryClient.getQueryData<NoteFolder[]>(notesKeys.folders(workspaceId)) ?? [];
      const descendantIds = collectDescendantFolderIds(previousFolders, id as string);

      queryClient.setQueryData<NoteFolder[]>(notesKeys.folders(workspaceId), (current = []) =>
        current.filter((folder) => !descendantIds.includes(folder.id)),
      );
      queryClient.setQueryData<NoteFile[]>(notesKeys.files(workspaceId), (current = []) =>
        current.filter((note) => !note.parentId || !descendantIds.includes(note.parentId)),
      );

      return { previousNotes, previousFolders };
    },
    onError: (_error, _id, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(notesKeys.files(workspaceId), context.previousNotes);
      }
      if (context?.previousFolders) {
        queryClient.setQueryData(notesKeys.folders(workspaceId), context.previousFolders);
      }
    },
  });
}

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

export function useDebouncedUpdateNoteContent(options: DebouncedUpdateOptions = {}) {
  const queryClient = useQueryClient();
  const workspaceId = getWorkspaceId();
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

    queryClient.setQueryData<NoteFile[]>(notesKeys.files(workspaceId), (current = []) =>
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

      void updateNote({
        id: id as NoteId,
        content: content as MarkdownContent,
        richContent: nextRichContent,
        preferredEditorMode,
        updatedAt,
      })
        .then((note) => {
          if (!note || versionsRef.current.get(id) !== requestVersion) {
            return;
          }

          queryClient.setQueryData<NoteFile[]>(notesKeys.files(workspaceId), (current = []) =>
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
