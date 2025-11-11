import { Block } from "@blocknote/core";

export interface Note {
  id: string;
  name: string;
  content: Block[];
  createdAt: number;
  updatedAt: number;
  type: 'note';
}

export interface Folder {
  id: string;
  name: string;
  type: 'folder';
  children: (Note | Folder)[];
  createdAt: number;
  updatedAt: number;
}

export type Item = Note | Folder;

const STORAGE_KEY = "haptic_notes";

const DEFAULT_ITEMS: Item[] = [
  {
    id: "readme",
    name: "README.md",
    type: 'note',
    content: [
      {
        id: "1",
        type: "heading",
        props: {
          level: 1,
        },
        content: [
          {
            type: "text",
            text: "README",
            styles: {},
          },
        ],
        children: [],
      },
      {
        id: "2",
        type: "paragraph",
        props: {},
        content: [
          {
            type: "text",
            text: "Haptic is a new local-first & privacy-focused, open-source home for your markdown notes. It's minimal, lightweight, efficient, and aims to have ",
            styles: {},
          },
          {
            type: "text",
            text: "all you need and nothing you don't",
            styles: {
              italic: true,
            },
          },
          {
            type: "text",
            text: ".",
            styles: {},
          },
        ],
        children: [],
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "why-haptic",
    name: "Why Haptic.md",
    type: 'note',
    content: [
      {
        id: "1",
        type: "heading",
        props: {
          level: 1,
        },
        content: [
          {
            type: "text",
            text: "Why Haptic",
            styles: {},
          },
        ],
        children: [],
      },
      {
        id: "2",
        type: "paragraph",
        props: {},
        content: [
          {
            type: "text",
            text: "Start editing this note to explore Haptic's capabilities.",
            styles: {},
          },
        ],
        children: [],
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export class NoteStorage {
  static getItems(): Item[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error("Error loading items:", error);
    }
    const items = DEFAULT_ITEMS;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return items;
  }

  static findItemById(id: string, items?: Item[]): Item | undefined {
    const searchItems = items || this.getItems();
    for (const item of searchItems) {
      if (item.id === id) return item;
      if (item.type === 'folder') {
        const found = this.findItemById(id, item.children);
        if (found) return found;
      }
    }
    return undefined;
  }

  static findNote(id: string): Note | undefined {
    const item = this.findItemById(id);
    return item && item.type === 'note' ? (item as Note) : undefined;
  }

  static createNote(name: string, parentFolderId?: string): Note {
    const items = this.getItems();
    const newNote: Note = {
      id: `note-${Date.now()}`,
      name,
      type: 'note',
      content: [
        {
          id: "1",
          type: "paragraph",
          props: {},
          content: [],
          children: [],
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (parentFolderId) {
      const parent = this.findItemById(parentFolderId, items) as Folder | undefined;
      if (parent && parent.type === 'folder') {
        parent.children.push(newNote);
      } else {
        items.push(newNote);
      }
    } else {
      items.push(newNote);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return newNote;
  }

  static createFolder(name: string, parentFolderId?: string): Folder {
    const items = this.getItems();
    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      name,
      type: 'folder',
      children: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (parentFolderId) {
      const parent = this.findItemById(parentFolderId, items) as Folder | undefined;
      if (parent && parent.type === 'folder') {
        parent.children.push(newFolder);
      } else {
        items.push(newFolder);
      }
    } else {
      items.push(newFolder);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return newFolder;
  }

  static updateNote(id: string, content: Block[], name?: string): Note | undefined {
    const items = this.getItems();
    const note = this.findItemById(id, items) as Note | undefined;

    if (!note || note.type !== 'note') {
      return undefined;
    }

    note.content = content;
    if (name) note.name = name;
    note.updatedAt = Date.now();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return note;
  }

  static renameItem(id: string, newName: string): Item | undefined {
    const items = this.getItems();
    const item = this.findItemById(id, items);

    if (!item) {
      return undefined;
    }

    item.name = newName;
    item.updatedAt = Date.now();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return item;
  }

  static deleteItem(id: string): boolean {
    const items = this.getItems();

    const deleteRecursive = (itemList: Item[]): boolean => {
      const index = itemList.findIndex(item => item.id === id);
      if (index !== -1) {
        itemList.splice(index, 1);
        return true;
      }

      for (const item of itemList) {
        if (item.type === 'folder' && deleteRecursive(item.children)) {
          return true;
        }
      }

      return false;
    };

    const found = deleteRecursive(items);
    if (found) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
    return found;
  }

  static moveItem(itemId: string, targetFolderId: string | null): boolean {
    const items = this.getItems();
    const item = this.findItemById(itemId, items);

    if (!item) {
      return false;
    }

    // Remove from current location
    const deleteRecursive = (itemList: Item[]): boolean => {
      const index = itemList.findIndex(i => i.id === itemId);
      if (index !== -1) {
        itemList.splice(index, 1);
        return true;
      }

      for (const i of itemList) {
        if (i.type === 'folder' && deleteRecursive(i.children)) {
          return true;
        }
      }

      return false;
    };

    if (!deleteRecursive(items)) {
      return false;
    }

    // Add to new location
    if (targetFolderId) {
      const targetFolder = this.findItemById(targetFolderId, items) as Folder | undefined;
      if (targetFolder && targetFolder.type === 'folder') {
        targetFolder.children.push(item);
      } else {
        items.push(item);
      }
    } else {
      items.push(item);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  }

  static countChildren(folderId: string): number {
    const folder = this.findItemById(folderId) as Folder | undefined;
    if (!folder || folder.type !== 'folder') {
      return 0;
    }
    return folder.children.length;
  }
}
