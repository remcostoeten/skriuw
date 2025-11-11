import type { Note, Folder, Item, CreateNoteData, UpdateNoteData, CreateFolderData } from "@/features/notes/types";

export interface StorageAdapter {
  // Configuration
  readonly name: string;
  readonly type: 'local' | 'remote' | 'hybrid';

  // Lifecycle
  initialize(): Promise<void>;
  destroy(): Promise<void>;

  // Health/Status
  isHealthy(): Promise<boolean>;
  getStorageInfo(): Promise<StorageInfo>;

  // CRUD Operations
  getItems(): Promise<Item[]>;
  findItemById(id: string): Promise<Item | undefined>;
  findNote(id: string): Promise<Note | undefined>;

  createNote(data: CreateNoteData): Promise<Note>;
  createFolder(data: CreateFolderData): Promise<Folder>;

  updateNote(id: string, data: UpdateNoteData): Promise<Note | undefined>;
  renameItem(id: string, newName: string): Promise<Item | undefined>;

  deleteItem(id: string): Promise<boolean>;
  moveItem(itemId: string, targetFolderId: string | null): Promise<boolean>;

  countChildren(folderId: string): Promise<number>;

  // Batch operations
  batchUpdate(operations: StorageOperation[]): Promise<StorageOperationResult[]>;
}

export interface StorageInfo {
  adapter: string;
  type: string;
  totalItems: number;
  sizeBytes?: number;
  lastSync?: Date;
  isOnline: boolean;
  capabilities: StorageCapabilities;
}

export interface StorageCapabilities {
  realtime: boolean;
  offline: boolean;
  sync: boolean;
  backup: boolean;
  versioning: boolean;
  collaboration: boolean;
}

export type StorageOperation =
  | { type: 'create_note'; data: CreateNoteData }
  | { type: 'create_folder'; data: CreateFolderData }
  | { type: 'update_note'; id: string; data: UpdateNoteData }
  | { type: 'rename_item'; id: string; newName: string }
  | { type: 'delete_item'; id: string }
  | { type: 'move_item'; itemId: string; targetFolderId: string | null };

export interface StorageOperationResult {
  operation: StorageOperation;
  success: boolean;
  data?: any;
  error?: string;
}

export interface StorageConfig {
  adapter: 'localStorage' | 'instantdb' | 'drizzle-turso' | 'pglite';
  options?: Record<string, unknown>;
}

export interface StorageEvent {
  type: 'created' | 'updated' | 'deleted' | 'moved';
  itemType: 'note' | 'folder';
  itemId: string;
  data?: any;
}

export type StorageEventListener = (event: StorageEvent) => void;