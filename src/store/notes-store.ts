import { create } from "zustand";
import { persist } from "zustand/middleware";
import { NoteFile, NoteFolder } from "@/types/notes";
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

type NotesState = {
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
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

function collectDescendantFolderIds(folders: NoteFolder[], folderId: string): string[] {
  const childFolders = folders.filter((folder) => folder.parentId === folderId);
  return [
    folderId,
    ...childFolders.flatMap((childFolder) => collectDescendantFolderIds(folders, childFolder.id)),
  ];
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      files: initialFiles,
      folders: initialFolders,
      activeFileId: "readme",

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
        }));

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

        return newFolder;
      },

      updateFileContent: (id, content) => {
        set((state) => ({
          files: state.files.map((file) =>
            file.id === id ? { ...file, content, modifiedAt: new Date() } : file,
          ),
        }));
      },

      renameFile: (id, name) => {
        set((state) => ({
          files: state.files.map((file) =>
            file.id === id
              ? {
                  ...file,
                  name: name.endsWith(".md") ? name : `${name}.md`,
                  modifiedAt: new Date(),
                }
              : file,
          ),
        }));
      },

      renameFolder: (id, name) => {
        set((state) => ({
          folders: state.folders.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
        }));
      },

      deleteFile: (id) => {
        set((state) => {
          const nextFiles = state.files.filter((file) => file.id !== id);
          return {
            files: nextFiles,
            activeFileId: state.activeFileId === id ? (nextFiles[0]?.id ?? "") : state.activeFileId,
          };
        });
      },

      deleteFolder: (id) => {
        set((state) => {
          const folderIds = collectDescendantFolderIds(state.folders, id);
          return {
            files: state.files.filter((file) => !folderIds.includes(file.parentId || "")),
            folders: state.folders.filter((folder) => !folderIds.includes(folder.id)),
          };
        });
      },

      moveFile: (fileId, newParentId) => {
        set((state) => ({
          files: state.files.map((file) =>
            file.id === fileId ? { ...file, parentId: newParentId, modifiedAt: new Date() } : file,
          ),
        }));
      },

      moveFolder: (folderId, newParentId) => {
        const descendantIds = collectDescendantFolderIds(get().folders, folderId);
        if (newParentId && descendantIds.includes(newParentId)) {
          return;
        }

        set((state) => ({
          folders: state.folders.map((folder) =>
            folder.id === folderId ? { ...folder, parentId: newParentId } : folder,
          ),
        }));
      },

      toggleFolder: (id) => {
        set((state) => ({
          folders: state.folders.map((folder) =>
            folder.id === id ? { ...folder, isOpen: !folder.isOpen } : folder,
          ),
        }));
      },
    }),
    {
      name: "notes-store",
      partialize: (state) => ({
        files: state.files,
        folders: state.folders,
        activeFileId: state.activeFileId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        state.files = state.files.map((file) => ({
          ...file,
          createdAt: new Date(file.createdAt),
          modifiedAt: new Date(file.modifiedAt),
        }));
      },
    },
  ),
);
