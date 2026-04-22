import type { JournalEntry } from "@/types/journal";
import type { NoteFile, NoteFolder } from "@/types/notes";
import type {
  MobileFolder,
  MobileJournalEntry,
  MobileNote,
  MobileWorkspace,
} from "@/src/core/workspace-types";

function stripMarkdownExtension(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

export function mapNoteToMobileNote(note: NoteFile): MobileNote {
  return {
    id: note.id,
    name: stripMarkdownExtension(note.name),
    content: note.content,
    parentId: note.parentId,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.modifiedAt.toISOString(),
  };
}

export function mapFolderToMobileFolder(folder: NoteFolder): MobileFolder {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    createdAt: "",
    updatedAt: "",
  };
}

export function mapJournalEntryToMobileJournalEntry(entry: JournalEntry): MobileJournalEntry {
  return {
    id: entry.id,
    dateKey: entry.dateKey,
    content: entry.content,
    tags: entry.tags,
    mood: entry.mood,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function mapWorkspaceToMobileWorkspace(input: {
  folders: NoteFolder[];
  notes: NoteFile[];
  journalEntries: JournalEntry[];
}): MobileWorkspace {
  return {
    folders: input.folders.map(mapFolderToMobileFolder),
    notes: input.notes.map(mapNoteToMobileNote),
    journalEntries: input.journalEntries.map(mapJournalEntryToMobileJournalEntry),
  };
}
