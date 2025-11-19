// Re-export note-related functionality for clean imports
export { useNotes } from "./hooks/useNotes";
export { StorageError, getStorage } from "./services/noteStorage";
export type { Note, Folder, Item, CreateNoteData, UpdateNoteData, CreateFolderData } from "./types";

// Import getStorage for use in getNote
import { getStorage } from "./services/noteStorage";

// Export getNote for streaming data functionality
export const getNote = async (id: string) => {
  return await getStorage().findNote(id);
};