import type { Block } from "@blocknote/core";
import type {
  StorageAdapter,
  StorageInfo,
  StorageOperation,
  StorageOperationResult,
  StorageEvent,
  StorageEventListener
} from "../types";
import type { Note, Folder, Item, CreateNoteData, UpdateNoteData, CreateFolderData } from "@/features/notes/types";

export class LocalStorageAdapter implements StorageAdapter {
  readonly name = "localStorage";
  readonly type = 'local' as const;

  private readonly STORAGE_KEY = "Skriuw_notes";
  private readonly DEFAULT_ITEMS: Item[];
  private listeners: StorageEventListener[] = [];

  constructor(defaultItems?: Item[]) {
    this.DEFAULT_ITEMS = defaultItems || [
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
        ],
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
    ];
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
    const item = await this.findItemById(itemId);

    if (!item) {
      return false;
    }

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
      const targetFolder = await this.findItemById(targetFolderId) as Folder | undefined;
      if (targetFolder && targetFolder.type === 'folder') {
        targetFolder.children.push(item);
      } else {
        items.push(item);
      }
    } else {
      items.push(item);
    }

    await this.saveItems(items);
    this.emit({ type: 'moved', itemType: item.type, itemId: itemId });
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