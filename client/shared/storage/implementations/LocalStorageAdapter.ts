import type { Block } from "@blocknote/core";
import type {
  StorageAdapter,
  StorageInfo,
  StorageOperation,
  StorageOperationResult, StorageEvent, StorageEventListener
} from "../types";
import type { Note, Folder, Item, CreateNoteData, UpdateNoteData, CreateFolderData } from "@/features/notes/types";

export class LocalStorageAdapter implements StorageAdapter {
  readonly name = "localStorage";
  readonly type = 'local' as const;

  private readonly STORAGE_KEY = "Skriuw_notes";
  private readonly DEFAULT_ITEMS: Item[];
  private listeners: StorageEventListener[] = [];

  constructor(defaultItems?: Item[]) {
    this.DEFAULT_ITEMS = (defaultItems || [
      {
        id: "readme",
        name: "README.md",
        type: 'note',
        content: [
          {
            id: "1",
            type: "heading",
            props: { level: 1 },
            content: [{ type: "text", text: "README", styles: {} }],
            children: [],
          },
          {
            id: "2",
            type: "paragraph",
            props: {},
            content: [
              { type: "text", text: "Skriuw is a new local-first & privacy-focused, open-source home for your markdown notes. It's minimal, lightweight, efficient, and aims to have ", styles: {} },
              { type: "text", text: "all you need and nothing you don't", styles: { italic: true } },
              { type: "text", text: ".", styles: {} },
            ],
            children: [],
          },
          {
            id: "3",
            type: "paragraph",
            props: {},
            content: [
              { type: "text", text: "If you'd like to learn more about Skriuw, why it's being built, what its goals are, and how it differs from all the other markdown editors out there, click around the other files in this collection.", styles: {} },
            ],
            children: [],
          },
          {
            id: "4",
            type: "heading",
            props: { level: 2 },
            content: [{ type: "text", text: "Tech Stack", styles: {} }],
            children: [],
          },
          {
            id: "5",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Tauri", styles: {} },
              { type: "text", text: " – Desktop App", styles: {} },
            ],
            children: [],
          },
          {
            id: "6",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "PGlite", styles: {} },
              { type: "text", text: " – Local Database", styles: {} },
            ],
            children: [],
          },
          {
            id: "7",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Svelte", styles: {} },
              { type: "text", text: " – Framework", styles: {} },
            ],
            children: [],
          },
          {
            id: "8",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Tailwind", styles: {} },
              { type: "text", text: " – CSS", styles: {} },
            ],
            children: [],
          },
          {
            id: "9",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Shadcn/ui", styles: {} },
              { type: "text", text: " – Component Library", styles: {} },
            ],
            children: [],
          },
          {
            id: "10",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Vercel", styles: {} },
              { type: "text", text: " – Hosting", styles: {} },
            ],
            children: [],
          },
          {
            id: "11",
            type: "heading",
            props: { level: 2 },
            content: [{ type: "text", text: "Deploy Your Own", styles: {} }],
            children: [],
          },
          {
            id: "12",
            type: "paragraph",
            props: {},
            content: [
              { type: "text", text: "If you're interested in self-hosting your own web instance of Skriuw, please check ", styles: {} },
              { type: "text", text: "GitHub", styles: {} },
              { type: "text", text: " for instructions.", styles: {} },
            ],
            children: [],
          },
          {
            id: "13",
            type: "heading",
            props: { level: 2 },
            content: [{ type: "text", text: "Roadmap", styles: {} }],
            children: [],
          },
          {
            id: "14",
            type: "paragraph",
            props: {},
            content: [
              { type: "text", text: "Skriuw is currently still in active development. Here are some of the features planned for the future:", styles: {} },
            ],
            children: [],
          },
          {
            id: "15",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Skriuw Sync", styles: {} },
            ],
            children: [],
          },
          {
            id: "16",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Mobile support for the web app (Currently dependent on PGlite support for mobile)", styles: {} },
            ],
            children: [],
          },
          {
            id: "17",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Native mobile apps for iOS & Android", styles: {} },
            ],
            children: [],
          },
          {
            id: "18",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Windows & Linux support for the desktop app", styles: {} },
            ],
            children: [],
          },
          {
            id: "19",
            type: "paragraph",
            props: {},
            content: [
              { type: "text", text: "and much, much more, so stay tuned!", styles: {} },
            ],
            children: [],
          },
          {
            id: "20",
            type: "heading",
            props: { level: 2 },
            content: [{ type: "text", text: "Contributing", styles: {} }],
            children: [],
          },
          {
            id: "21",
            type: "paragraph",
            props: {},
            content: [
              { type: "text", text: "We would love to have your help in making Skriuw better!", styles: {} },
            ],
            children: [],
          },
          {
            id: "22",
            type: "paragraph",
            props: {},
            content: [
              { type: "text", text: "Here's how you can contribute:", styles: {} },
            ],
            children: [],
          },
          {
            id: "23",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Report a bug", styles: {} },
              { type: "text", text: " you found while using Skriuw", styles: {} },
            ],
            children: [],
          },
          {
            id: "24",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Request a feature", styles: {} },
              { type: "text", text: " that you think will be useful", styles: {} },
            ],
            children: [],
          },
          {
            id: "25",
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Submit a pull request", styles: {} },
              { type: "text", text: " if you want to contribute with new features or bug fixes", styles: {} },
            ],
            children: [],
          },
          {
            id: "26",
            type: "heading",
            props: { level: 2 },
            content: [{ type: "text", text: "License", styles: {} }],
            children: [],
          },
          {
            id: "27",
            type: "paragraph",
            props: {},
            content: [
              { type: "text", text: "Skriuw is licensed under the ", styles: {} },
              { type: "text", text: "GNU Affero General Public License Version 3 (AGPLv3)", styles: {} },
              { type: "text", text: ".", styles: {} },
            ],
            children: [],
          },
        ] as Block[],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "why-Skriuw",
        name: "Why Skriuw.md",
        type: 'note',
        content: [
          {
            id: "1",
            type: "heading",
            props: { level: 1 },
            content: [{ type: "text", text: "Why Skriuw", styles: {} }],
            children: [],
          },
          {
            id: "2",
            type: "paragraph",
            props: {},
            content: [{ type: "text", text: "Start editing this note to explore Skriuw's capabilities.", styles: {} }],
            children: [],
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]) as Item[];
  }

  async initialize(): Promise<void> {
    // Initialize localStorage with default data if empty
    const items = await this.getItems();
    if (items.length === 0) {
      await this.saveItems(this.DEFAULT_ITEMS);
    }
  }

  async destroy(): Promise<void> {
    // Clear event listeners
    this.listeners = [];
  }

  async isHealthy(): Promise<boolean> {
    try {
      localStorage.setItem('_health_check', 'test');
      localStorage.removeItem('_health_check');
      return true;
    } catch {
      return false;
    }
  }

  async getStorageInfo(): Promise<StorageInfo> {
    const items = await this.getItems();
    const storageSize = localStorage.getItem(this.STORAGE_KEY)?.length || 0;

    return {
      adapter: this.name,
      type: this.type,
      totalItems: items.length,
      sizeBytes: storageSize * 2, // Rough byte estimate
      isOnline: navigator.onLine,
      capabilities: {
        realtime: false,
        offline: true,
        sync: false,
        backup: false,
        versioning: false,
        collaboration: false,
      },
    };
  }

  async getItems(): Promise<Item[]> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
        throw new Error('Invalid data format in storage');
      }
    } catch (error) {
      console.error("Error loading items, using defaults:", error);
    }
    await this.saveItems(this.DEFAULT_ITEMS);
    return this.DEFAULT_ITEMS;
  }

  async findItemById(id: string): Promise<Item | undefined> {
    const items = await this.getItems();
    return this.findItemRecursive(id, items);
  }

  async findNote(id: string): Promise<Note | undefined> {
    const item = await this.findItemById(id);
    return item && item.type === 'note' ? item as Note : undefined;
  }

  async createNote(data: CreateNoteData): Promise<Note> {
    const items = await this.getItems();
    const newNote: Note = {
      id: `note-${Date.now()}`,
      name: data.name,
      type: 'note',
      content: data.content || [
        {
          id: "1",
          type: "paragraph",
          props: {},
          content: [],
          children: [],
        } as Block,
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (data.parentFolderId) {
      const parent = await this.findItemById(data.parentFolderId) as Folder | undefined;
      if (parent && parent.type === 'folder') {
        parent.children.push(newNote);
      } else {
        items.push(newNote);
      }
    } else {
      items.push(newNote);
    }

    await this.saveItems(items);
    this.emit({ type: 'created', itemType: 'note', itemId: newNote.id, data: newNote });
    return newNote;
  }

  async createFolder(data: CreateFolderData): Promise<Folder> {
    const items = await this.getItems();
    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      name: data.name,
      type: 'folder',
      children: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (data.parentFolderId) {
      const parent = await this.findItemById(data.parentFolderId) as Folder | undefined;
      if (parent && parent.type === 'folder') {
        parent.children.push(newFolder);
      } else {
        items.push(newFolder);
      }
    } else {
      items.push(newFolder);
    }

    await this.saveItems(items);
    this.emit({ type: 'created', itemType: 'folder', itemId: newFolder.id, data: newFolder });
    return newFolder;
  }

  async updateNote(id: string, data: UpdateNoteData): Promise<Note | undefined> {
    const items = await this.getItems();
    const note = await this.findItemById(id) as Note | undefined;

    if (!note || note.type !== 'note') {
      return undefined;
    }

    if (data.content) note.content = data.content;
    if (data.name) note.name = data.name;
    note.updatedAt = Date.now();

    await this.saveItems(items);
    this.emit({ type: 'updated', itemType: 'note', itemId: id, data: note });
    return note;
  }

  async renameItem(id: string, newName: string): Promise<Item | undefined> {
    const items = await this.getItems();
    const item = await this.findItemById(id);

    if (!item) {
      return undefined;
    }

    item.name = newName;
    item.updatedAt = Date.now();

    await this.saveItems(items);
    this.emit({ type: 'updated', itemType: item.type, itemId: id, data: item });
    return item;
  }

  async deleteItem(id: string): Promise<boolean> {
    const items = await this.getItems();
    let found = false;

    const deleteRecursive = (itemList: Item[]): boolean => {
      const index = itemList.findIndex(item => item.id === id);
      if (index !== -1) {
        const deletedItem = itemList[index];
        itemList.splice(index, 1);
        this.emit({ type: 'deleted', itemType: deletedItem.type, itemId: id });
        return true;
      }

      for (const item of itemList) {
        if (item.type === 'folder' && deleteRecursive(item.children)) {
          return true;
        }
      }
      return false;
    };

    found = deleteRecursive(items);
    if (found) {
      await this.saveItems(items);
    }
    return found;
  }

  async moveItem(itemId: string, targetFolderId: string | null): Promise<boolean> {
    const items = await this.getItems();
    
    // First, find and store a reference to the item before removing it
    const item = this.findItemRecursive(itemId, items);
    if (!item) {
      return false;
    }

    // Create a deep copy of the item to ensure we don't lose the reference
    const itemCopy = JSON.parse(JSON.stringify(item)) as Item;

    // Remove from current location
    const removeFromRecursive = (itemList: Item[]): boolean => {
      const index = itemList.findIndex(i => i.id === itemId);
      if (index !== -1) {
        itemList.splice(index, 1);
        return true;
      }

      for (const i of itemList) {
        if (i.type === 'folder' && removeFromRecursive(i.children)) {
          return true;
        }
      }
      return false;
    };

    if (!removeFromRecursive(items)) {
      return false;
    }

    // Add to new location
    if (targetFolderId) {
      // Find target folder in the current items array (not from localStorage)
      const targetFolder = this.findItemRecursive(targetFolderId, items) as Folder | undefined;
      if (targetFolder && targetFolder.type === 'folder') {
        targetFolder.children.push(itemCopy);
      } else {
        // If target folder not found, add to root
        items.push(itemCopy);
      }
    } else {
      items.push(itemCopy);
    }

    await this.saveItems(items);
    this.emit({ type: 'moved', itemType: itemCopy.type, itemId: itemId });
    return true;
  }

  async countChildren(folderId: string): Promise<number> {
    const folder = await this.findItemById(folderId) as Folder | undefined;
    if (!folder || folder.type !== 'folder') {
      return 0;
    }
    return folder.children.length;
  }

  async batchUpdate(operations: StorageOperation[]): Promise<StorageOperationResult[]> {
    const results: StorageOperationResult[] = [];
    const items = await this.getItems();

    for (const operation of operations) {
      try {
        let result: any;

        switch (operation.type) {
          case 'create_note':
            result = await this.createNote(operation.data);
            break;
          case 'create_folder':
            result = await this.createFolder(operation.data);
            break;
          case 'update_note':
            result = await this.updateNote(operation.id, operation.data);
            break;
          case 'rename_item':
            result = await this.renameItem(operation.id, operation.newName);
            break;
          case 'delete_item':
            result = await this.deleteItem(operation.id);
            break;
          case 'move_item':
            result = await this.moveItem(operation.itemId, operation.targetFolderId);
            break;
        }

        results.push({
          operation,
          success: true,
          data: result,
        });
      } catch (error) {
        results.push({
          operation,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  // Event management
  addEventListener(listener: StorageEventListener): void {
    this.listeners.push(listener);
  }

  removeEventListener(listener: StorageEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  private emit(event: StorageEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in storage event listener:', error);
      }
    });
  }

  // Private helper methods
  private findItemRecursive(id: string, items: Item[]): Item | undefined {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.type === 'folder') {
        const found = this.findItemRecursive(id, item.children);
        if (found) return found;
      }
    }
    return undefined;
  }

  private async saveItems(items: Item[]): Promise<void> {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      throw new Error(`Failed to save items to localStorage: ${error}`);
    }
  }
}