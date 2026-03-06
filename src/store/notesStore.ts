import { useState, useCallback } from 'react';
import { NoteFile, NoteFolder } from '@/types/notes';

const initialFiles: NoteFile[] = [
  {
    id: 'readme',
    name: 'README.md',
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
- [ ] Mobile support for the web app
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
    createdAt: new Date('2024-01-15'),
    modifiedAt: new Date('2024-03-01'),
    parentId: null,
  },
  {
    id: 'supported-devices',
    name: 'Supported Devices.md',
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
    createdAt: new Date('2024-01-20'),
    modifiedAt: new Date('2024-02-15'),
    parentId: null,
  },
  {
    id: 'why-haptic',
    name: 'Why Haptic.md',
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
    createdAt: new Date('2024-01-22'),
    modifiedAt: new Date('2024-02-20'),
    parentId: null,
  },
];

const initialFolders: NoteFolder[] = [];

export function useNotesStore() {
  const [files, setFiles] = useState<NoteFile[]>(initialFiles);
  const [folders, setFolders] = useState<NoteFolder[]>(initialFolders);
  const [activeFileId, setActiveFileId] = useState<string>('readme');
  const [showMetadata, setShowMetadata] = useState(false);

  const activeFile = files.find(f => f.id === activeFileId) || null;

  const createFile = useCallback((name: string, parentId: string | null = null) => {
    const newFile: NoteFile = {
      id: crypto.randomUUID(),
      name: name.endsWith('.md') ? name : `${name}.md`,
      content: `# ${name.replace('.md', '')}\n`,
      createdAt: new Date(),
      modifiedAt: new Date(),
      parentId,
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
    return newFile;
  }, []);

  const createFolder = useCallback((name: string, parentId: string | null = null) => {
    const newFolder: NoteFolder = {
      id: crypto.randomUUID(),
      name,
      parentId,
      isOpen: true,
    };
    setFolders(prev => [...prev, newFolder]);
    return newFolder;
  }, []);

  const updateFileContent = useCallback((id: string, content: string) => {
    setFiles(prev => prev.map(f => 
      f.id === id ? { ...f, content, modifiedAt: new Date() } : f
    ));
  }, []);

  const renameFile = useCallback((id: string, name: string) => {
    setFiles(prev => prev.map(f =>
      f.id === id ? { ...f, name: name.endsWith('.md') ? name : `${name}.md`, modifiedAt: new Date() } : f
    ));
  }, []);

  const deleteFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    if (activeFileId === id) {
      setActiveFileId(files[0]?.id || '');
    }
  }, [activeFileId, files]);

  const toggleFolder = useCallback((id: string) => {
    setFolders(prev => prev.map(f =>
      f.id === id ? { ...f, isOpen: !f.isOpen } : f
    ));
  }, []);

  const getFilesInFolder = useCallback((parentId: string | null) => {
    return files.filter(f => f.parentId === parentId);
  }, [files]);

  const getFoldersInFolder = useCallback((parentId: string | null) => {
    return folders.filter(f => f.parentId === parentId);
  }, [folders]);

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
    deleteFile,
    toggleFolder,
    getFilesInFolder,
    getFoldersInFolder,
  };
}
