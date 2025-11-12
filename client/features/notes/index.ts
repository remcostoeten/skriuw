// Re-export note-related functionality for clean imports
export { useNotes } from "./hooks/useNotes";
export { StorageError, getStorage } from "./services/noteStorage";
export type { Note, Folder, Item, CreateNoteData, UpdateNoteData, CreateFolderData } from "./types";