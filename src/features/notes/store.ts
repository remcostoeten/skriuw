import { create, type StateCreator } from "zustand";
import type { CreateNoteInput } from "@/core/notes";
import type { FolderId, MarkdownContent, NoteId } from "@/core/shared/persistence-types";
import { foldersRepository, notesRepository } from "@/core/persistence/repositories";
import type { SaveStatus } from "@/shared/components/save-status-badge";
import type { NoteEditorMode, NoteFile, NoteFolder, RichTextDocument } from "@/types/notes";
import { usePreferencesStore } from "@/features/settings/store";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import { captureWorkspaceGuard, type WorkspaceGuard } from "@/core/shared/workspace-guard";
import { getWorkspaceId } from "@/platform/auth";

function generateNoteContent(name: string): string {
  const title = name.replace(".md", "");
  return `# ${title}

`;
}

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

const contentSaveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const saveStatusResetTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
function clearTimeoutMap(timeoutMap: Map<string, ReturnType<typeof setTimeout>>) {
  for (const timeoutId of timeoutMap.values()) {
    clearTimeout(timeoutId);
  }

  timeoutMap.clear();
}

function resetPendingNoteSideEffects() {
  clearTimeoutMap(contentSaveTimeouts);
  clearTimeoutMap(saveStatusResetTimeouts);
}

function scheduleSaveStatusReset(id: string, onReset: () => void) {
  const existingTimeout = saveStatusResetTimeouts.get(id);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeoutId = setTimeout(() => {
    saveStatusResetTimeouts.delete(id);
    onReset();
  }, 1800);

  saveStatusResetTimeouts.set(id, timeoutId);
}

function setFileSaveState(
  set: Parameters<StateCreator<NotesState>>[0],
  id: string,
  status: SaveStatus,
) {
  set((state) => ({
    saveStates: { ...state.saveStates, [id]: status },
  }));
}

function scheduleWorkspaceSaveStateReset(
  workspaceGuard: WorkspaceGuard,
  id: string,
  set: Parameters<StateCreator<NotesState>>[0],
) {
  scheduleSaveStatusReset(id, () => {
    workspaceGuard.runIfCurrent(() => {
      setFileSaveState(set, id, "idle");
    });
  });
}

function collectDescendantFolderIds(folders: NoteFolder[], folderId: string): string[] {
  const childFolders = folders.filter((folder) => folder.parentId === folderId);
  return [
    folderId,
    ...childFolders.flatMap((childFolder) => collectDescendantFolderIds(folders, childFolder.id)),
  ];
}

function applyFolderUiState(nextFolders: NoteFolder[], currentFolders: NoteFolder[]): NoteFolder[] {
  const currentState = new Map(currentFolders.map((folder) => [folder.id, folder.isOpen]));
  return nextFolders.map((folder) => ({
    ...folder,
    isOpen: currentState.get(folder.id) ?? folder.parentId === null,
  }));
}

type NotesState = {
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
  isHydrated: boolean;
  saveStates: Record<string, SaveStatus>;
  resetWorkspace: () => void;
  initialize: (workspaceId?: string) => Promise<void>;
  getFileSaveState: (id: string | null | undefined) => SaveStatus;
  setActiveFileId: (id: string) => void;
  createFile: (
    name: string,
    parentId?: string | null,
    preferredEditorMode?: NoteEditorMode,
  ) => NoteFile;
  createFolder: (name: string, parentId?: string | null) => NoteFolder;
  updateFileContent: (
    id: string,
    content: string,
    options?: {
      richContent?: RichTextDocument;
      preferredEditorMode?: NoteEditorMode;
    },
  ) => void;
  renameFile: (id: string, name: string) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFile: (id: string) => void;
  deleteFolder: (id: string) => void;
  moveFile: (fileId: string, newParentId: string | null) => void;
  moveFolder: (folderId: string, newParentId: string | null) => void;
  toggleFolder: (id: string) => void;
  collapseAllFolders: () => void;
  expandAllFolders: () => void;
};

export const useNotesStore = create<NotesState>()((set, get) => ({
  files: [],
  folders: [],
  activeFileId: "",
  isHydrated: false,
  saveStates: {},

  resetWorkspace: () => {
    resetPendingNoteSideEffects();
    set({
      files: [],
      folders: [],
      activeFileId: "",
      isHydrated: false,
      saveStates: {},
    });
  },

  initialize: async (workspaceId = getWorkspaceId()) => {
    const workspaceGuard = captureWorkspaceGuard(getWorkspaceId, workspaceId);
    if (get().isHydrated) return;

    const [persistedFiles, persistedFolders] = await Promise.all([
      notesRepository.list(),
      foldersRepository.list(),
    ]);

    if (!workspaceGuard.isCurrent()) {
      return;
    }

    const files =
      persistedFiles.length > 0
        ? persistedFiles
        : [await notesRepository.create(buildStarterNote())];

    if (!workspaceGuard.isCurrent()) {
      return;
    }

    const nextFolders = applyFolderUiState(persistedFolders, []);
    const activeFileId =
      files.find((file) => file.id === get().activeFileId)?.id ??
      files[0]?.id ??
      "";

    set({
      files,
      folders: nextFolders,
      activeFileId,
      isHydrated: true,
      saveStates: {},
    });
  },

  getFileSaveState: (id) => {
    if (!id) return "idle";
    return get().saveStates[id] ?? "idle";
  },

  setActiveFileId: (id) => {
    set({ activeFileId: id });
  },

  createFile: (name, parentId = null, preferredEditorModeOverride) => {
    const workspaceGuard = captureWorkspaceGuard(getWorkspaceId);
    const defaultModeRaw = usePreferencesStore.getState().editor.defaultModeRaw;
    const generatedContent = generateNoteContent(name);
    const richContent = markdownToRichDocument(generatedContent);
    const preferredEditorMode =
      preferredEditorModeOverride ?? (defaultModeRaw ? "raw" : "block");
    const newFile: NoteFile = {
      id: crypto.randomUUID(),
      name: name.endsWith(".md") ? name : `${name}.md`,
      content: generatedContent,
      richContent,
      preferredEditorMode,
      createdAt: new Date(),
      modifiedAt: new Date(),
      parentId,
    };

    set((state) => ({
      files: [...state.files, newFile],
      activeFileId: newFile.id,
      saveStates: { ...state.saveStates, [newFile.id]: "saving" },
    }));

    void notesRepository.create({
      id: newFile.id as NoteId,
      name: newFile.name,
      content: newFile.content as MarkdownContent,
      richContent: newFile.richContent,
      preferredEditorMode: newFile.preferredEditorMode,
      parentId: newFile.parentId as FolderId | null,
      createdAt: newFile.createdAt,
      updatedAt: newFile.modifiedAt,
    })
      .then(() => {
        if (!workspaceGuard.runIfCurrent(() => setFileSaveState(set, newFile.id, "saved"))) {
          return;
        }

        scheduleWorkspaceSaveStateReset(workspaceGuard, newFile.id, set);
      })
      .catch(() => {
        workspaceGuard.runIfCurrent(() => {
          setFileSaveState(set, newFile.id, "error");
        });
      });

    usePreferencesStore.getState().incrementNoteCount();

    return newFile;
  },

  createFolder: (name, parentId = null) => {
    const newFolder: NoteFolder = {
      id: crypto.randomUUID(),
      name,
      parentId,
      isOpen: true,
    };

    set((state) => ({
      folders: [...state.folders, newFolder],
    }));

    void foldersRepository.create({
      id: newFolder.id as FolderId,
      name: newFolder.name,
      parentId: newFolder.parentId as FolderId | null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return newFolder;
  },

  updateFileContent: (id, content, options) => {
    const workspaceGuard = captureWorkspaceGuard(getWorkspaceId);
    const updatedAt = new Date();
    const richContent = options?.richContent ?? markdownToRichDocument(content);
    const preferredEditorMode = options?.preferredEditorMode;

    set((state) => ({
      files: state.files.map((file) =>
        file.id === id
          ? {
              ...file,
              content,
              richContent,
              preferredEditorMode: preferredEditorMode ?? file.preferredEditorMode,
              modifiedAt: updatedAt,
            }
          : file,
      ),
      saveStates: { ...state.saveStates, [id]: "saving" },
    }));

    const pendingTimeout = contentSaveTimeouts.get(id);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
    }

    const timeoutId = setTimeout(() => {
      contentSaveTimeouts.delete(id);

      if (!workspaceGuard.isCurrent()) {
        return;
      }

      void notesRepository.update({
        id: id as NoteId,
        content: content as MarkdownContent,
        richContent,
        preferredEditorMode,
        updatedAt,
      })
        .then(() => {
          if (!workspaceGuard.runIfCurrent(() => setFileSaveState(set, id, "saved"))) {
            return;
          }

          scheduleWorkspaceSaveStateReset(workspaceGuard, id, set);
        })
        .catch(() => {
          workspaceGuard.runIfCurrent(() => {
            setFileSaveState(set, id, "error");
          });
        });
    }, 220);

    contentSaveTimeouts.set(id, timeoutId);
  },

  renameFile: (id, name) => {
    const workspaceGuard = captureWorkspaceGuard(getWorkspaceId);
    const updatedAt = new Date();
    const normalizedName = name.endsWith(".md") ? name : `${name}.md`;

    set((state) => ({
      files: state.files.map((file) =>
        file.id === id ? { ...file, name: normalizedName, modifiedAt: updatedAt } : file,
      ),
      saveStates: { ...state.saveStates, [id]: "saving" },
    }));

    void notesRepository.update({
      id: id as NoteId,
      name: normalizedName,
      updatedAt,
    })
      .then(() => {
        if (!workspaceGuard.runIfCurrent(() => setFileSaveState(set, id, "saved"))) {
          return;
        }

        scheduleWorkspaceSaveStateReset(workspaceGuard, id, set);
      })
      .catch(() => {
        workspaceGuard.runIfCurrent(() => {
          setFileSaveState(set, id, "error");
        });
      });
  },

  renameFolder: (id, name) => {
    const updatedAt = new Date();

    set((state) => ({
      folders: state.folders.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
    }));

    void foldersRepository.update({
      id: id as FolderId,
      name,
      updatedAt,
    });
  },

  deleteFile: (id) => {
    const workspaceGuard = captureWorkspaceGuard(getWorkspaceId);
    set((state) => {
      const nextFiles = state.files.filter((file) => file.id !== id);
      return {
        files: nextFiles,
        activeFileId: state.activeFileId === id ? (nextFiles[0]?.id ?? "") : state.activeFileId,
        saveStates: Object.fromEntries(
          Object.entries(state.saveStates).filter(([key]) => key !== id),
        ),
      };
    });

    const pendingTimeout = contentSaveTimeouts.get(id);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      contentSaveTimeouts.delete(id);
    }

    void notesRepository.destroy(id as NoteId).catch(() => {
      workspaceGuard.runIfCurrent(() => {
        setFileSaveState(set, id, "error");
      });
    });
  },

  deleteFolder: (id) => {
    set((state) => {
      const folderIds = collectDescendantFolderIds(state.folders, id);
      const nextFiles = state.files.filter((file) => !folderIds.includes(file.parentId || ""));
      const activeFileId = folderIds.includes(
        state.files.find((file) => file.id === state.activeFileId)?.parentId || "",
      )
        ? (nextFiles[0]?.id ?? "")
        : state.activeFileId;

      return {
        files: nextFiles,
        folders: state.folders.filter((folder) => !folderIds.includes(folder.id)),
        activeFileId,
      };
    });

    void foldersRepository.destroy(id as FolderId);
  },

  moveFile: (fileId, newParentId) => {
    const updatedAt = new Date();

    set((state) => ({
      files: state.files.map((file) =>
        file.id === fileId ? { ...file, parentId: newParentId, modifiedAt: updatedAt } : file,
      ),
    }));

    void notesRepository.update({
      id: fileId as NoteId,
      parentId: newParentId as FolderId | null,
      updatedAt,
    });
  },

  moveFolder: (folderId, newParentId) => {
    const descendantIds = collectDescendantFolderIds(get().folders, folderId);
    if (newParentId && descendantIds.includes(newParentId)) {
      return;
    }

    const updatedAt = new Date();

    set((state) => ({
      folders: state.folders.map((folder) =>
        folder.id === folderId ? { ...folder, parentId: newParentId } : folder,
      ),
    }));

    void foldersRepository.update({
      id: folderId as FolderId,
      parentId: newParentId as FolderId | null,
      updatedAt,
    });
  },

  toggleFolder: (id) => {
    set((state) => ({
      folders: state.folders.map((folder) =>
        folder.id === id ? { ...folder, isOpen: !folder.isOpen } : folder,
      ),
    }));
  },

  collapseAllFolders: () => {
    set((state) => ({
      folders: state.folders.map((folder) => ({ ...folder, isOpen: false })),
    }));
  },

  expandAllFolders: () => {
    set((state) => ({
      folders: state.folders.map((folder) => ({ ...folder, isOpen: true })),
    }));
  },
}));
