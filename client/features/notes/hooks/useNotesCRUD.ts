import { useCRUD, createCRUDConfig } from "@/shared/data";
import { getStorage } from "@/shared/storage";
import type { Note, Folder, Item, CreateNoteData, UpdateNoteData, CreateFolderData } from "../types";

/**
 * Notes CRUD hook using the centralized CRUD system
 */
export function useNotesCRUD() {
  return useCRUD(createCRUDConfig<Item>('notes', {
    // Storage operations
    create: async (data: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>): Promise<Item> => {
      const storage = getStorage();

      if (data.type === 'note') {
        const noteData = data as Omit<Note, 'id' | 'createdAt' | 'updatedAt'>;
        return await storage.createNote({
          name: noteData.name,
          content: noteData.content,
          parentFolderId: noteData.parentFolderId,
        });
      } else if (data.type === 'folder') {
        const folderData = data as Omit<Folder, 'id' | 'createdAt' | 'updatedAt'>;
        return await storage.createFolder({
          name: folderData.name,
          parentFolderId: folderData.parentFolderId,
        });
      }

      throw new Error('Invalid item type');
    },

    read: async (id: string): Promise<Item | null> => {
      const storage = getStorage();
      return await storage.findItemById(id);
    },

    update: async (id: string, data: Partial<Item>): Promise<Item | null> => {
      const storage = getStorage();
      const existingItem = await storage.findItemById(id);

      if (!existingItem) {
        return null;
      }

      if (existingItem.type === 'note') {
        const noteData = data as Partial<Note>;
        return await storage.updateNote(id, {
          content: noteData.content,
          name: noteData.name,
        });
      } else if (existingItem.type === 'folder') {
        if (data.name) {
          return await storage.renameItem(id, data.name);
        }
      }

      return existingItem;
    },

    delete: async (id: string): Promise<boolean> => {
      const storage = getStorage();
      return await storage.deleteItem(id);
    },

    list: async (filters?: { type?: 'note' | 'folder'; parentId?: string }): Promise<Item[]> => {
      const storage = getStorage();
      const allItems = await storage.getItems();

      let filteredItems = allItems;

      // Filter by type
      if (filters?.type) {
        filteredItems = filteredItems.filter(item => item.type === filters.type);
      }

      // Filter by parent (would need recursive filtering for folders)
      if (filters?.parentId) {
        const parent = await storage.findItemById(filters.parentId);
        if (parent && parent.type === 'folder') {
          filteredItems = parent.children;
        } else {
          // Root level items
          filteredItems = allItems.filter(item => {
            // This would need a more sophisticated implementation to check if item is at root level
            return !item.parentFolderId;
          });
        }
      }

      return filteredItems;
    },

    // Optional: Validation
    validation: {
      create: async (data: any): Promise<boolean> => {
        if (!data.name || data.name.trim().length === 0) {
          return false;
        }
        if (!data.type || !['note', 'folder'].includes(data.type)) {
          return false;
        }
        return true;
      },
      update: async (data: any): Promise<boolean> => {
        if (data.name !== undefined && data.name.trim().length === 0) {
          return false;
        }
        return true;
      },
    },

    // Optimistic updates enabled
    optimistic: {
      enabled: true,
      maxAge: 5000, // 5 seconds
    },
  }));
}

/**
 * Notes-specific convenience hooks
 */
export function useNotes() {
  const crud = useNotesCRUD();

  // Get all notes (excluding folders)
  const readNotesList = (filters?: Omit<Parameters<typeof crud.readList>[0], 'type'>) => {
    return crud.readList({ ...filters, type: 'note' });
  };

  // Get all folders
  const readFoldersList = (filters?: Omit<Parameters<typeof crud.readList>[0], 'type'>) => {
    return crud.readList({ ...filters, type: 'folder' });
  };

  // Create note with type safety
  const createNote = (data: CreateNoteData) => {
    return crud.create({ ...data, type: 'note' });
  };

  // Create folder with type safety
  const createFolder = (data: CreateFolderData) => {
    return crud.create({ ...data, type: 'folder' });
  };

  // Update note with type safety
  const updateNote = (id: string, data: UpdateNoteData) => {
    return crud.update(id, data);
  };

  // Rename folder or note
  const renameItem = (id: string, newName: string) => {
    return crud.update(id, { name: newName, updatedAt: Date.now() });
  };

  return {
    // CRUD operations
    createNote,
    createFolder,
    updateNote,
    renameItem,
    deleteItem: crud.deleteItem,
    batchDelete: crud.batchDelete,
    deleteWithConfirmation: crud.deleteWithConfirmation,

    // Read operations
    readNote: crud.read,
    readNotesList,
    readFoldersList,
    readList: crud.readList,

    // State
    isLoading: crud.isLoading,
    isTransitionPending: crud.isTransitionPending,
    errors: crud.errors,

    // Optimistic updates
    optimisticUpdates: crud.optimisticUpdates,

    // Utilities
    invalidateAll: crud.invalidateAll,
    prefetch: crud.prefetch,

    // Raw CRUD access for advanced usage
    crud,
  };
}

/**
 * Single note hook for individual note operations
 */
export function useNote(id: string) {
  const crud = useNotesCRUD();
  const noteQuery = crud.read(id);

  const updateNote = (data: UpdateNoteData) => {
    return crud.update(id, data);
  };

  const renameNote = (newName: string) => {
    return crud.update(id, { name: newName, updatedAt: Date.now() });
  };

  const deleteNote = () => {
    return crud.deleteItem(id);
  };

  const deleteWithConfirmation = (message?: string) => {
    return crud.deleteWithConfirmation(id, message);
  };

  return {
    ...noteQuery,
    updateNote,
    renameNote,
    deleteNote,
    deleteWithConfirmation,
  };
}