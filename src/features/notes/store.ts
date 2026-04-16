import { create } from "zustand";
import type { SaveStatus } from "@/shared/components/save-status-badge";
import type { NoteFile, NoteFolder } from "@/types/notes";

type FolderOpenState = Record<string, boolean>;

type NotesUiState = {
  activeFileId: string;
  isHydrated: boolean;
  folderOpenState: FolderOpenState;
  saveStates: Record<string, SaveStatus>;
  resetWorkspace: () => void;
  initialize: (_workspaceId?: string) => Promise<void>;
  getFileSaveState: (id: string | null | undefined) => SaveStatus;
  setActiveFileId: (id: string) => void;
  ensureActiveFileId: (files: NoteFile[]) => void;
  setFileSaveState: (id: string, status: SaveStatus) => void;
  clearFileSaveState: (id: string) => void;
  toggleFolder: (id: string) => void;
  setFolderOpen: (id: string, isOpen: boolean) => void;
  collapseAllFolders: (folderIds: string[]) => void;
  expandAllFolders: (folderIds: string[]) => void;
};

export function applyFolderUiState(
  folders: NoteFolder[],
  folderOpenState: FolderOpenState,
): NoteFolder[] {
  return folders.map((folder) => ({
    ...folder,
    isOpen: folderOpenState[folder.id] ?? folder.parentId === null,
  }));
}

export const useNotesStore = create<NotesUiState>()((set, get) => ({
  activeFileId: "",
  isHydrated: false,
  folderOpenState: {},
  saveStates: {},

  resetWorkspace: () => {
    set({
      activeFileId: "",
      isHydrated: false,
      folderOpenState: {},
      saveStates: {},
    });
  },

  initialize: async () => {
    if (get().isHydrated) {
      return;
    }

    set({ isHydrated: true });
  },

  getFileSaveState: (id) => {
    if (!id) return "idle";
    return get().saveStates[id] ?? "idle";
  },

  setActiveFileId: (id) => {
    set({ activeFileId: id });
  },

  ensureActiveFileId: (files) => {
    set((state) => {
      if (files.length === 0) {
        return state.activeFileId ? { activeFileId: "" } : state;
      }

      if (files.some((file) => file.id === state.activeFileId)) {
        return state;
      }

      return { activeFileId: files[0]?.id ?? "" };
    });
  },

  setFileSaveState: (id, status) => {
    set((state) => ({
      saveStates: { ...state.saveStates, [id]: status },
    }));
  },

  clearFileSaveState: (id) => {
    set((state) => ({
      saveStates: Object.fromEntries(
        Object.entries(state.saveStates).filter(([key]) => key !== id),
      ),
    }));
  },

  toggleFolder: (id) => {
    set((state) => ({
      folderOpenState: {
        ...state.folderOpenState,
        [id]: !(state.folderOpenState[id] ?? true),
      },
    }));
  },

  setFolderOpen: (id, isOpen) => {
    set((state) => ({
      folderOpenState: { ...state.folderOpenState, [id]: isOpen },
    }));
  },

  collapseAllFolders: (folderIds) => {
    set((state) => ({
      folderOpenState: {
        ...state.folderOpenState,
        ...Object.fromEntries(folderIds.map((folderId) => [folderId, false])),
      },
    }));
  },

  expandAllFolders: (folderIds) => {
    set((state) => ({
      folderOpenState: {
        ...state.folderOpenState,
        ...Object.fromEntries(folderIds.map((folderId) => [folderId, true])),
      },
    }));
  },
}));
