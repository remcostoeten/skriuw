import { create } from "zustand";
import {
  createNote as persistCreateNote,
  destroyNote as persistDestroyNote,
  readNotes,
  updateNote,
} from "@/core/notes";
import {
  createFolder as persistCreateFolder,
  destroyFolder as persistDestroyFolder,
  readFolders,
  updateFolder,
} from "@/core/folders";
import type { FolderId, MarkdownContent, NoteId } from "@/core/shared/persistence-types";
import type { SaveStatus } from "@/shared/components/save-status-badge";
import type { NoteFile, NoteFolder } from "@/types/notes";
import { usePreferencesStore, type TemplateStyle } from "@/store/preferences-store";

function generateNoteContent(name: string, template: TemplateStyle): string {
  const title = name.replace(".md", "");
  const date = new Date().toISOString().split("T")[0];

  switch (template) {
    case "notion":
      return `# ${title}
created: ${date}
updated: ${date}

Start writing here...`;

    case "journal": {
      const dateStr = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const timeStr = new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      return `# ${dateStr}

mood: neutral
tags: 

---

*${timeStr}*

`;
    }

    case "simple":
    default:
      return `# ${title}

`;
  }
}

const initialFolders: NoteFolder[] = [
  { id: "folder-1", name: "Untitled 1", parentId: null, isOpen: true },
  { id: "folder-2", name: "Untitled 2", parentId: "folder-1", isOpen: true },
  { id: "folder-3", name: "Untitled", parentId: "folder-2", isOpen: false },
  { id: "folder-4", name: "Untitled 3", parentId: null, isOpen: false },
];

const initialFiles: NoteFile[] = [
  {
    id: "nested-untitled",
    name: "Untitled.md",
    content: `# Untitled\n`,
    createdAt: new Date(Date.now() - 38000),
    modifiedAt: new Date(Date.now() - 4000),
    parentId: "folder-1",
  },
  {
    id: "readme",
    name: "README.md",
    content: `# README

Haptic is a new local-first & privacy-focused, open-source home for your markdown notes. It's minimal, lightweight, efficient, and aims to have *all you need and nothing you don't*.

---

If you'd like to learn more about Haptic, why it's being built, what its goals are, and how it differs from all the other markdown editors out there, click around the other files in this collection.

## Tech Stack

- **Tauri** – Desktop App
- **PGlite** – Local Database
- **Svelte** – Framework
- **Tailwind** – CSS
- **Shadcn/ui** – Component Library
- **Vercel** – Hosting

## Deploy Your Own

If you're interested in self-hosting your own web instance of Haptic, please check GitHub for instructions.

## Roadmap

Haptic is currently still in active development. Here are some of the features planned for the future:

- [ ] Haptic Sync
- [ ] Mobile support for the web app (Currently dependent on PGlite support for mobile)
- [ ] Native mobile apps for iOS & Android
- [ ] Windows & Linux support for the desktop app

and much, much more, so stay tuned!

## Contributing

We would love to have your help in making Haptic better!
Here's how you can contribute:

- **Report a bug** you found while using Haptic
- **Request a feature** that you think will be useful
- **Submit a pull request** if you want to contribute with new features or bug fixes

## License

Haptic is licensed under the GNU Affero General Public License Version 3 (AGPLv3).`,
    createdAt: new Date("2024-01-15"),
    modifiedAt: new Date("2024-03-01"),
    parentId: null,
  },
  {
    id: "supported-devices",
    name: "Supported Devices.md",
    content: `# Supported Devices

Haptic is currently available on the following platforms:

## Desktop
- **macOS** – Full support (Apple Silicon & Intel)

## Web
- **Chrome** – Full support
- **Firefox** – Full support
- **Safari** – Full support
- **Edge** – Full support

## Coming Soon
- Windows desktop app
- Linux desktop app
- iOS native app
- Android native app`,
    createdAt: new Date("2024-01-20"),
    modifiedAt: new Date("2024-02-15"),
    parentId: null,
  },
  {
    id: "why-haptic",
    name: "Why Haptic.md",
    content: `# Why Haptic?

In a world full of note-taking apps, why build another one?

## The Problem

Most note-taking apps today are either:
1. **Too complex** – They try to do everything and end up doing nothing well
2. **Not private** – Your notes are stored on someone else's servers
3. **Subscription-heavy** – You pay monthly for basic functionality

## Our Solution

Haptic takes a different approach:

- **Local-first**: Your data stays on your device
- **Privacy-focused**: No tracking, no analytics, no data collection
- **Minimal**: Only the features you need, nothing more
- **Open-source**: Transparent and community-driven
- **Free**: Core functionality will always be free`,
    createdAt: new Date("2024-01-22"),
    modifiedAt: new Date("2024-02-20"),
    parentId: null,
  },
];

const contentSaveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const saveStatusResetTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

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

async function seedInitialNotesData() {
  for (const folder of initialFolders) {
    await persistCreateFolder({
      id: folder.id as FolderId,
      name: folder.name,
      parentId: folder.parentId as FolderId | null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  for (const file of initialFiles) {
    await persistCreateNote({
      id: file.id as NoteId,
      name: file.name,
      content: file.content as MarkdownContent,
      parentId: file.parentId as FolderId | null,
      createdAt: file.createdAt,
      updatedAt: file.modifiedAt,
    });
  }

  return {
    files: initialFiles,
    folders: initialFolders,
    activeFileId: "readme",
  };
}

type NotesState = {
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
  isHydrated: boolean;
  saveStates: Record<string, SaveStatus>;
  initialize: () => Promise<void>;
  getFileSaveState: (id: string | null | undefined) => SaveStatus;
  setActiveFileId: (id: string) => void;
  createFile: (name: string, parentId?: string | null) => NoteFile;
  createFolder: (name: string, parentId?: string | null) => NoteFolder;
  updateFileContent: (id: string, content: string) => void;
  renameFile: (id: string, name: string) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFile: (id: string) => void;
  deleteFolder: (id: string) => void;
  moveFile: (fileId: string, newParentId: string | null) => void;
  moveFolder: (folderId: string, newParentId: string | null) => void;
  toggleFolder: (id: string) => void;
};

export const useNotesStore = create<NotesState>()((set, get) => ({
  files: [],
  folders: [],
  activeFileId: "",
  isHydrated: false,
  saveStates: {},

  initialize: async () => {
    if (get().isHydrated) return;

    const [persistedFiles, persistedFolders] = await Promise.all([readNotes(), readFolders()]);

    if (persistedFiles.length === 0 && persistedFolders.length === 0) {
      const seeded = await seedInitialNotesData();
      set({
        files: seeded.files,
        folders: seeded.folders,
        activeFileId: seeded.activeFileId,
        isHydrated: true,
      });
      return;
    }

    const nextFolders = applyFolderUiState(persistedFolders, get().folders);
    const activeFileId =
      persistedFiles.find((file) => file.id === get().activeFileId)?.id ??
      persistedFiles[0]?.id ??
      "";

    set({
      files: persistedFiles,
      folders: nextFolders,
      activeFileId,
      isHydrated: true,
    });
  },

  getFileSaveState: (id) => {
    if (!id) return "idle";
    return get().saveStates[id] ?? "idle";
  },

  setActiveFileId: (id) => {
    set({ activeFileId: id });
  },

  createFile: (name, parentId = null) => {
    const template = usePreferencesStore.getState().templateStyle;
    const newFile: NoteFile = {
      id: crypto.randomUUID(),
      name: name.endsWith(".md") ? name : `${name}.md`,
      content: generateNoteContent(name, template),
      createdAt: new Date(),
      modifiedAt: new Date(),
      parentId,
    };

    set((state) => ({
      files: [...state.files, newFile],
      activeFileId: newFile.id,
      saveStates: { ...state.saveStates, [newFile.id]: "saving" },
    }));

    void persistCreateNote({
      id: newFile.id as NoteId,
      name: newFile.name,
      content: newFile.content as MarkdownContent,
      parentId: newFile.parentId as FolderId | null,
      createdAt: newFile.createdAt,
      updatedAt: newFile.modifiedAt,
    })
      .then(() => {
        set((state) => ({
          saveStates: { ...state.saveStates, [newFile.id]: "saved" },
        }));
        scheduleSaveStatusReset(newFile.id, () => {
          set((state) => ({
            saveStates: { ...state.saveStates, [newFile.id]: "idle" },
          }));
        });
      })
      .catch(() => {
        set((state) => ({
          saveStates: { ...state.saveStates, [newFile.id]: "error" },
        }));
      });

    usePreferencesStore.getState().recordTemplateUsage(template);
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

    void persistCreateFolder({
      id: newFolder.id as FolderId,
      name: newFolder.name,
      parentId: newFolder.parentId as FolderId | null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return newFolder;
  },

  updateFileContent: (id, content) => {
    const updatedAt = new Date();

    set((state) => ({
      files: state.files.map((file) =>
        file.id === id ? { ...file, content, modifiedAt: updatedAt } : file,
      ),
      saveStates: { ...state.saveStates, [id]: "saving" },
    }));

    const pendingTimeout = contentSaveTimeouts.get(id);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
    }

    const timeoutId = setTimeout(() => {
      contentSaveTimeouts.delete(id);
      void updateNote({
        id: id as NoteId,
        content: content as MarkdownContent,
        updatedAt,
      })
        .then(() => {
          set((state) => ({
            saveStates: { ...state.saveStates, [id]: "saved" },
          }));
          scheduleSaveStatusReset(id, () => {
            set((state) => ({
              saveStates: { ...state.saveStates, [id]: "idle" },
            }));
          });
        })
        .catch(() => {
          set((state) => ({
            saveStates: { ...state.saveStates, [id]: "error" },
          }));
        });
    }, 220);

    contentSaveTimeouts.set(id, timeoutId);
  },

  renameFile: (id, name) => {
    const updatedAt = new Date();
    const normalizedName = name.endsWith(".md") ? name : `${name}.md`;

    set((state) => ({
      files: state.files.map((file) =>
        file.id === id ? { ...file, name: normalizedName, modifiedAt: updatedAt } : file,
      ),
      saveStates: { ...state.saveStates, [id]: "saving" },
    }));

    void updateNote({
      id: id as NoteId,
      name: normalizedName,
      updatedAt,
    })
      .then(() => {
        set((state) => ({
          saveStates: { ...state.saveStates, [id]: "saved" },
        }));
        scheduleSaveStatusReset(id, () => {
          set((state) => ({
            saveStates: { ...state.saveStates, [id]: "idle" },
          }));
        });
      })
      .catch(() => {
        set((state) => ({
          saveStates: { ...state.saveStates, [id]: "error" },
        }));
      });
  },

  renameFolder: (id, name) => {
    const updatedAt = new Date();

    set((state) => ({
      folders: state.folders.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
    }));

    void updateFolder({
      id: id as FolderId,
      name,
      updatedAt,
    });
  },

  deleteFile: (id) => {
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

    void persistDestroyNote(id as NoteId).catch(() => {
      set((state) => ({
        saveStates: { ...state.saveStates, [id]: "error" },
      }));
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

    void persistDestroyFolder(id as FolderId);
  },

  moveFile: (fileId, newParentId) => {
    const updatedAt = new Date();

    set((state) => ({
      files: state.files.map((file) =>
        file.id === fileId ? { ...file, parentId: newParentId, modifiedAt: updatedAt } : file,
      ),
    }));

    void updateNote({
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

    void updateFolder({
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
}));
