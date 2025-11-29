import { read } from "@/api/storage/crud";
import type { Folder, Note, Item } from "@/features/notes/types";

const STORAGE_KEY = "Skriuw_notes";

export interface FetchNotesOptions {
  parentFolderId?: string;
  search?: string;
}

export async function fetchNotes(
  options?: FetchNotesOptions
): Promise<Note[]> {
  try {
    const result = await read<Item>(STORAGE_KEY, {
      getAll: true,
      filter: (item) => {
        if (item.type !== "note") return false;
        if (options?.parentFolderId) {
          return (item as Note).parentFolderId === options.parentFolderId;
        }
        if (options?.search) {
          const searchLower = options.search.toLowerCase();
          const note = item as Note;
          return note.name.toLowerCase().includes(searchLower);
        }
        return true;
      },
    });
    return Array.isArray(result)
      ? result.filter((item): item is Note => item.type === "note")
      : [];
  } catch (error) {
    throw new Error(
      `Failed to fetch notes: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function fetchFolders(
  options?: FetchNotesOptions
): Promise<Folder[]> {
  try {
    const result = await read<Item>(STORAGE_KEY, {
      getAll: true,
      filter: (item) => {
        if (item.type !== "folder") return false;
        if (options?.parentFolderId) {
          return (item as Folder).parentFolderId === options.parentFolderId;
        }
        if (options?.search) {
          const searchLower = options.search.toLowerCase();
          const folder = item as Folder;
          return folder.name.toLowerCase().includes(searchLower);
        }
        return true;
      },
    });
    return Array.isArray(result)
      ? result.filter((item): item is Folder => item.type === "folder")
      : [];
  } catch (error) {
    throw new Error(
      `Failed to fetch folders: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function fetchOneNote(noteId: string): Promise<Note | undefined> {
  try {
    const result = await read<Note>(STORAGE_KEY, { getById: noteId });
    if (result && typeof result === "object" && result.type === "note") {
      return result;
    }
    return undefined;
  } catch (error) {
    throw new Error(
      `Failed to fetch note: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function fetchOneFolder(
  folderId: string
): Promise<Folder | undefined> {
  try {
    const result = await read<Folder>(STORAGE_KEY, { getById: folderId });
    if (result && typeof result === "object" && result.type === "folder") {
      return result;
    }
    return undefined;
  } catch (error) {
    throw new Error(
      `Failed to fetch folder: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

