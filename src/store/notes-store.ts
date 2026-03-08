import { useState, useCallback } from "react";
import { NoteFile, NoteFolder } from "@/types/notes";
import { useSettingsStore } from "@/modules/settings";
import { TemplateStyle } from "@/modules/settings/types";

// Helper to generate note content based on template
function generateNoteContent(name: string, template: TemplateStyle): string {
  const title = name.replace(".md", "");
  const date = new Date().toISOString().split("T")[0];

  switch (template) {
    case "notion":
      return `# ${title}
created: ${date}
updated: ${date}

Start writing here...`;

    case "journal":
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

export function useNotesStore() {
  const [files, setFiles] = useState<NoteFile[]>(initialFiles);
  const [folders, setFolders] = useState<NoteFolder[]>(initialFolders);
  const [activeFileId, setActiveFileId] = useState<string>("readme");
  const [showMetadata, setShowMetadata] = useState(false);

  const activeFile = files.find((f) => f.id === activeFileId) || null;

  const createFile = useCallback((name: string, parentId: string | null = null) => {
    // Get current template style from settings
    const settings = useSettingsStore.getState().settings;
    const template = settings?.templateStyle || "simple";

    const newFile: NoteFile = {
      id: crypto.randomUUID(),
      name: name.endsWith(".md") ? name : `${name}.md`,
      content: generateNoteContent(name, template),
      createdAt: new Date(),
      modifiedAt: new Date(),
      parentId,
    };
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);

    // Track template usage and increment note count in settings
    useSettingsStore.getState().recordTemplateUsage(template);
    useSettingsStore.getState().incrementNoteCount();

    return newFile;
  }, []);

  const createFolder = useCallback((name: string, parentId: string | null = null) => {
    const newFolder: NoteFolder = {
      id: crypto.randomUUID(),
      name,
      parentId,
      isOpen: true,
    };
    setFolders((prev) => [...prev, newFolder]);
    return newFolder;
  }, []);

  const updateFileContent = useCallback((id: string, content: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, content, modifiedAt: new Date() } : f)),
    );
  }, []);

  const renameFile = useCallback((id: string, name: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, name: name.endsWith(".md") ? name : `${name}.md`, modifiedAt: new Date() }
          : f,
      ),
    );
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }, []);

  const deleteFile = useCallback(
    (id: string) => {
      setFiles((prev) => {
        const nextFiles = prev.filter((file) => file.id !== id);

        if (activeFileId === id) {
          setActiveFileId(nextFiles[0]?.id || "");
        }

        return nextFiles;
      });
    },
    [activeFileId],
  );

  const deleteFolder = useCallback(
    (id: string) => {
      // Get all descendant folder IDs
      const getDescendantFolderIds = (folderId: string): string[] => {
        const childFolders = folders.filter((f) => f.parentId === folderId);
        return [folderId, ...childFolders.flatMap((cf) => getDescendantFolderIds(cf.id))];
      };
      const folderIds = getDescendantFolderIds(id);

      // Delete all files in these folders
      setFiles((prev) => prev.filter((f) => !folderIds.includes(f.parentId || "")));
      // Delete all folders
      setFolders((prev) => prev.filter((f) => !folderIds.includes(f.id)));
    },
    [folders],
  );

  const moveFile = useCallback((fileId: string, newParentId: string | null) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId ? { ...f, parentId: newParentId, modifiedAt: new Date() } : f,
      ),
    );
  }, []);

  const moveFolder = useCallback(
    (folderId: string, newParentId: string | null) => {
      // Prevent moving a folder into itself or its descendants
      const getDescendantFolderIds = (id: string): string[] => {
        const childFolders = folders.filter((f) => f.parentId === id);
        return [id, ...childFolders.flatMap((cf) => getDescendantFolderIds(cf.id))];
      };
      const descendantIds = getDescendantFolderIds(folderId);
      if (newParentId && descendantIds.includes(newParentId)) {
        return; // Can't move folder into its own descendant
      }
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, parentId: newParentId } : f)),
      );
    },
    [folders],
  );

  const toggleFolder = useCallback((id: string) => {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, isOpen: !f.isOpen } : f)));
  }, []);

  const getFilesInFolder = useCallback(
    (parentId: string | null) => {
      return files.filter((f) => f.parentId === parentId);
    },
    [files],
  );

  const getFoldersInFolder = useCallback(
    (parentId: string | null) => {
      return folders.filter((f) => f.parentId === parentId);
    },
    [folders],
  );

  // Count all descendants (files + folders) recursively
  const countDescendants = useCallback(
    (folderId: string): number => {
      const childFiles = files.filter((f) => f.parentId === folderId).length;
      const childFolders = folders.filter((f) => f.parentId === folderId);
      const childFolderCount = childFolders.reduce((sum, cf) => sum + countDescendants(cf.id), 0);
      return childFiles + childFolders.length + childFolderCount;
    },
    [files, folders],
  );

  return {
    files,
    folders,
    activeFile,
    activeFileId,
    showMetadata,
    setActiveFileId,
    setShowMetadata,
    createFile,
    createFolder,
    updateFileContent,
    renameFile,
    renameFolder,
    deleteFile,
    deleteFolder,
    moveFile,
    moveFolder,
    toggleFolder,
    getFilesInFolder,
    getFoldersInFolder,
    countDescendants,
  };
}
