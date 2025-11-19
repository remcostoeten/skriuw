                                                                               import type { Note, Folder, Item, CreateNoteData, UpdateNoteData, CreateFolderData } from "@/features/notes/types";
                           
class StorageError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

export { StorageError };
export type { Note, Folder, Item, CreateNoteData, UpdateNoteData, CreateFolderData } from "@/features/notes/types";
export {
  initializeStorage,
  getStorage,
  type StorageAdapter,
  type StorageConfig
} from "@/shared/storage";
