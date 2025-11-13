import type { Block } from "@blocknote/core";
import type {
  StorageAdapter,
  StorageInfo,
  StorageOperation,
  StorageOperationResult,
  StorageEvent,
  StorageEventListener,
} from "../types";
import type { Note, Folder, Item, CreateNoteData, UpdateNoteData, CreateFolderData } from "@/features/notes/types";
import { initDatabase, getDatabase, closeDatabase } from "../drizzle/db";
import { notes, folders, type NoteRow, type FolderRow } from "../drizzle/schema";
import { eq, and, isNull, desc } from "drizzle-orm";

class StorageError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

export class DrizzleTursoAdapter implements StorageAdapter {
  readonly name = "drizzle-turso";
  readonly type = 'local' as const;

  private listeners: StorageEventListener[] = [];
  private initialized = false;
  private defaultItems: Item[] = [];

  constructor(private options?: {
    url?: string;
    authToken?: string;
    localDbPath?: string;
    defaultItems?: Item[];
  }) {
    if (options?.defaultItems) {
      this.defaultItems = options.defaultItems;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      console.log('Initializing DrizzleTurso adapter...', {
        url: this.options?.url ? 'configured' : 'using default',
        hasAuthToken: !!this.options?.authToken,
        localDbPath: this.options?.localDbPath,
      });

      await initDatabase({
        url: this.options?.url,
        authToken: this.options?.authToken,
        localDbPath: this.options?.localDbPath,
      });

      const db = getDatabase();

      // Check if database is empty and seed with defaults if needed
      try {
        const existingNotes = await db.select().from(notes).limit(1);
        const existingFolders = await db.select().from(folders).limit(1);

        if (existingNotes.length === 0 && existingFolders.length === 0 && this.defaultItems.length > 0) {
          console.log('Seeding default data...');
          await this.seedDefaultData();
        }
      } catch (error: any) {
        // If tables don't exist yet, they'll be created by initDatabase
        // This is just a check, so we can ignore errors here
        console.log('Tables may not exist yet, will be created automatically');
      }

      this.initialized = true;
      console.log('DrizzleTurso adapter initialized successfully');
    } catch (error) {
      console.error('Failed to initialize DrizzleTurso adapter:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          cause: error.cause,
        });
      }
      throw new StorageError('Failed to initialize DrizzleTurso adapter', error);
    }
  }

  async destroy(): Promise<void> {
    this.listeners = [];
    await closeDatabase();
    this.initialized = false;
  }

  async isHealthy(): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      const db = getDatabase();
      // Simple health check query
      await db.select().from(notes).limit(1);
      return true;
    } catch {
      return false;
    }
  }

  async getStorageInfo(): Promise<StorageInfo> {
    const db = getDatabase();
    const allNotes = await db.select().from(notes);
    const allFolders = await db.select().from(folders);
    const totalItems = allNotes.length + allFolders.length;

    // Estimate storage size (rough calculation)
    const notesSize = allNotes.reduce((sum, note) => sum + note.content.length + note.name.length, 0);
    const foldersSize = allFolders.reduce((sum, folder) => sum + folder.name.length, 0);
    const sizeBytes = notesSize + foldersSize;

    return {
      adapter: this.name,
      type: this.type,
      totalItems,
      sizeBytes,
      isOnline: navigator.onLine,
      capabilities: {
        realtime: false,
        offline: true,
        sync: !!this.options?.url?.startsWith('libsql://'),
        backup: false,
        versioning: false,
        collaboration: false,
      },
    };
  }

  async getItems(): Promise<Item[]> {
    const db = getDatabase();

    try {
      // Fetch root folders and notes (where parentId/folderId is null)
      const rootFolders = await db.select().from(folders).where(isNull(folders.parentId));
      const rootNotes = await db.select().from(notes).where(isNull(notes.folderId));

      // Build hierarchical structure
      const items: Item[] = [];

      // Process root folders recursively
      for (const folderRow of rootFolders) {
        items.push(await this.mapFolderToItem(folderRow));
      }

      // Add root notes
      for (const noteRow of rootNotes) {
        items.push(this.mapNoteToItem(noteRow));
      }

      // Sort by updatedAt descending
      return items.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      throw new StorageError('Failed to get items', error);
    }
  }

  async findItemById(id: string): Promise<Item | undefined> {
    const db = getDatabase();

    try {
      // Try to find as note first
      const noteRows = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
      if (noteRows.length > 0) {
        return this.mapNoteToItem(noteRows[0]);
      }

      // Try to find as folder
      const folderRows = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
      if (folderRows.length > 0) {
        return await this.mapFolderToItem(folderRows[0]);
      }

      return undefined;
    } catch (error) {
      throw new StorageError(`Failed to find item ${id}`, error);
    }
  }

  async findNote(id: string): Promise<Note | undefined> {
    const db = getDatabase();

    try {
      const noteRows = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
      if (noteRows.length > 0) {
        return this.mapNoteToItem(noteRows[0]) as Note;
      }
      return undefined;
    } catch (error) {
      throw new StorageError(`Failed to find note ${id}`, error);
    }
  }

  async createNote(data: CreateNoteData): Promise<Note> {
    const db = getDatabase();

    try {
      const now = Date.now();
      const noteId = `note-${now}`;
      const content = data.content || [
        {
          id: "1",
          type: "paragraph",
          props: {},
          content: [],
          children: [],
        } as Block,
      ];

      await db.insert(notes).values({
        id: noteId,
        name: data.name,
        content: JSON.stringify(content),
        folderId: data.parentFolderId || null,
        createdAt: now,
        updatedAt: now,
      });

      const newNote: Note = {
        id: noteId,
        name: data.name,
        content,
        createdAt: now,
        updatedAt: now,
        type: 'note',
      };

      this.emit({ type: 'created', itemType: 'note', itemId: noteId, data: newNote });
      return newNote;
    } catch (error) {
      throw new StorageError('Failed to create note', error);
    }
  }

  async createFolder(data: CreateFolderData): Promise<Folder> {
    const db = getDatabase();

    try {
      const now = Date.now();
      const folderId = `folder-${now}`;

      await db.insert(folders).values({
        id: folderId,
        name: data.name,
        parentId: data.parentFolderId || null,
        createdAt: now,
        updatedAt: now,
      });

      const newFolder: Folder = {
        id: folderId,
        name: data.name,
        type: 'folder',
        children: [],
        createdAt: now,
        updatedAt: now,
      };

      this.emit({ type: 'created', itemType: 'folder', itemId: folderId, data: newFolder });
      return newFolder;
    } catch (error) {
      throw new StorageError('Failed to create folder', error);
    }
  }

  async updateNote(id: string, data: UpdateNoteData): Promise<Note | undefined> {
    const db = getDatabase();

    try {
      const updateData: Partial<NoteRow> = {
        updatedAt: Date.now(),
      };

      if (data.name !== undefined) {
        updateData.name = data.name;
      }
      if (data.content !== undefined) {
        updateData.content = JSON.stringify(data.content);
      }

      const updated = await db.update(notes)
        .set(updateData)
        .where(eq(notes.id, id))
        .returning();

      if (updated.length === 0) {
        return undefined;
      }

      const noteRow = updated[0];
      const mappedNote = this.mapNoteToItem(noteRow) as Note;
      this.emit({ type: 'updated', itemType: 'note', itemId: id, data: mappedNote });
      return mappedNote;
    } catch (error) {
      throw new StorageError(`Failed to update note ${id}`, error);
    }
  }

  async renameItem(id: string, newName: string): Promise<Item | undefined> {
    const db = getDatabase();

    try {
      // Try note first
      const noteUpdated = await db.update(notes)
        .set({ name: newName, updatedAt: Date.now() })
        .where(eq(notes.id, id))
        .returning();

      if (noteUpdated.length > 0) {
        const mapped = this.mapNoteToItem(noteUpdated[0]);
        this.emit({ type: 'updated', itemType: 'note', itemId: id, data: mapped });
        return mapped;
      }

      // Try folder
      const folderUpdated = await db.update(folders)
        .set({ name: newName, updatedAt: Date.now() })
        .where(eq(folders.id, id))
        .returning();

      if (folderUpdated.length > 0) {
        const mapped = await this.mapFolderToItem(folderUpdated[0]);
        this.emit({ type: 'updated', itemType: 'folder', itemId: id, data: mapped });
        return mapped;
      }

      return undefined;
    } catch (error) {
      throw new StorageError(`Failed to rename item ${id}`, error);
    }
  }

  async deleteItem(id: string): Promise<boolean> {
    const db = getDatabase();

    try {
      // Try note first
      const noteDeleted = await db.delete(notes)
        .where(eq(notes.id, id))
        .returning();

      if (noteDeleted.length > 0) {
        this.emit({ type: 'deleted', itemType: 'note', itemId: id });
        return true;
      }

      // Try folder (cascade will handle children)
      const folderDeleted = await db.delete(folders)
        .where(eq(folders.id, id))
        .returning();

      if (folderDeleted.length > 0) {
        this.emit({ type: 'deleted', itemType: 'folder', itemId: id });
        return true;
      }

      return false;
    } catch (error) {
      throw new StorageError(`Failed to delete item ${id}`, error);
    }
  }

  async moveItem(itemId: string, targetFolderId: string | null): Promise<boolean> {
    const db = getDatabase();

    try {
      // Try note first
      const noteUpdated = await db.update(notes)
        .set({ folderId: targetFolderId, updatedAt: Date.now() })
        .where(eq(notes.id, itemId))
        .returning();

      if (noteUpdated.length > 0) {
        this.emit({ type: 'moved', itemType: 'note', itemId });
        return true;
      }

      // Try folder
      const folderUpdated = await db.update(folders)
        .set({ parentId: targetFolderId, updatedAt: Date.now() })
        .where(eq(folders.id, itemId))
        .returning();

      if (folderUpdated.length > 0) {
        this.emit({ type: 'moved', itemType: 'folder', itemId });
        return true;
      }

      return false;
    } catch (error) {
      throw new StorageError(`Failed to move item ${itemId}`, error);
    }
  }

  async countChildren(folderId: string): Promise<number> {
    const db = getDatabase();

    try {
      const childFolders = await db.select().from(folders).where(eq(folders.parentId, folderId));
      const childNotes = await db.select().from(notes).where(eq(notes.folderId, folderId));
      return childFolders.length + childNotes.length;
    } catch (error) {
      throw new StorageError(`Failed to count children for folder ${folderId}`, error);
    }
  }

  async batchUpdate(operations: StorageOperation[]): Promise<StorageOperationResult[]> {
    const results: StorageOperationResult[] = [];

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

  // Helper methods
  private mapNoteToItem(noteRow: NoteRow): Note {
    return {
      id: noteRow.id,
      name: noteRow.name,
      content: JSON.parse(noteRow.content) as Block[],
      createdAt: noteRow.createdAt,
      updatedAt: noteRow.updatedAt,
      type: 'note',
    };
  }

  private async mapFolderToItem(folderRow: FolderRow): Promise<Folder> {
    const db = getDatabase();

    // Fetch children
    const childFolders = await db.select().from(folders).where(eq(folders.parentId, folderRow.id));
    const childNotes = await db.select().from(notes).where(eq(notes.folderId, folderRow.id));

    const children: Item[] = [
      ...(await Promise.all(childFolders.map(f => this.mapFolderToItem(f)))),
      ...childNotes.map(n => this.mapNoteToItem(n)),
    ];

    return {
      id: folderRow.id,
      name: folderRow.name,
      type: 'folder',
      children,
      createdAt: folderRow.createdAt,
      updatedAt: folderRow.updatedAt,
    };
  }

  private async seedDefaultData(): Promise<void> {
    if (this.defaultItems.length === 0) {
      return;
    }

    const db = getDatabase();

    // Seed default items recursively
    for (const item of this.defaultItems) {
      if (item.type === 'note') {
        await this.createNote({
          name: item.name,
          content: item.content,
        });
      } else if (item.type === 'folder') {
        const folder = await this.createFolder({ name: item.name });
        // Recursively add children
        await this.seedFolderChildren(folder.id, item.children);
      }
    }
  }

  private async seedFolderChildren(parentFolderId: string, children: Item[]): Promise<void> {
    for (const child of children) {
      if (child.type === 'note') {
        await this.createNote({
          name: child.name,
          content: child.content,
          parentFolderId,
        });
      } else if (child.type === 'folder') {
        const folder = await this.createFolder({
          name: child.name,
          parentFolderId,
        });
        await this.seedFolderChildren(folder.id, child.children);
      }
    }
  }
}

