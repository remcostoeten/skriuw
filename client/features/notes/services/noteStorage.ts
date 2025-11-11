import { getStorage, type StorageAdapter } from "@/shared/storage";
import type { Note, Folder, Item, CreateNoteData, UpdateNoteData, CreateFolderData } from "@/features/notes/types";

class StorageError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

const getAdapter = (): StorageAdapter => {
  try {
    return getStorage();
  } catch (error) {
    throw new StorageError('Storage adapter not initialized', error);
  }
};

/**
 * Legacy NoteStorage class for backward compatibility.
 * This acts as a facade to the new storage abstraction.
 *
 * @deprecated Use the storage abstraction directly for new code
 */
export class NoteStorage {
  // Legacy synchronous methods (for backward compatibility)
  // These convert the async storage adapter to sync behavior

  static getItems(): Item[] {
    // For legacy sync behavior, we'll need to handle this differently
    // For now, throw an error indicating this needs async handling
    throw new StorageError('getItems() is now async. Use getStorage().getItems() instead.');
  }

  static async getItemsAsync(): Promise<Item[]> {
    try {
      return await getAdapter().getItems();
    } catch (error) {
      throw new StorageError('Failed to get items', error);
    }
  }

  static findItemById(id: string): Promise<Item | undefined> {
    return getAdapter().findItemById(id);
  }

  static findNote(id: string): Promise<Note | undefined> {
    return getAdapter().findNote(id);
  }

  static createNote(data: CreateNoteData): Promise<Note> {
    return getAdapter().createNote(data);
  }

  static createFolder(data: CreateFolderData): Promise<Folder> {
    return getAdapter().createFolder(data);
  }

  static updateNote(id: string, data: UpdateNoteData): Promise<Note | undefined> {
    return getAdapter().updateNote(id, data);
  }

  static renameItem(id: string, newName: string): Promise<Item | undefined> {
    return getAdapter().renameItem(id, newName);
  }

  static deleteItem(id: string): Promise<boolean> {
    return getAdapter().deleteItem(id);
  }

  static moveItem(itemId: string, targetFolderId: string | null): Promise<boolean> {
    return getAdapter().moveItem(itemId, targetFolderId);
  }

  static countChildren(folderId: string): Promise<number> {
    return getAdapter().countChildren(folderId);
  }
}

// Export the new storage abstraction types for migration
export { StorageError };
export type { Note, Folder, Item, CreateNoteData, UpdateNoteData, CreateFolderData } from "@/features/notes/types";
export {
  initializeStorage,
  getStorage as getStorageAdapter,
  type StorageAdapter,
  type StorageConfig
} from "@/shared/storage";