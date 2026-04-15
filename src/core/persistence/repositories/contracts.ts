import type { CreateFolderInput, UpdateFolderInput } from "@/core/folders";
import type {
  CreateJournalEntryInput,
  CreateJournalTagInput,
  UpdateJournalEntryInput,
} from "@/core/journal";
import type { CreateNoteInput, UpdateNoteInput } from "@/core/notes";
import type { NoteFolder, NoteFile } from "@/types/notes";
import type { JournalEntry, JournalTag } from "@/types/journal";
import type { FolderId, JournalEntryId, NoteId, TagId } from "@/core/shared/persistence-types";

export type WorkspaceTarget =
  | {
      kind: "local";
      workspaceId: string;
    }
  | {
      kind: "cloud";
      workspaceId: string;
      userId: string;
    };

export interface NotesRepository {
  list(): Promise<NoteFile[]>;
  create(input: CreateNoteInput): Promise<NoteFile>;
  update(input: UpdateNoteInput): Promise<NoteFile | undefined>;
  destroy(id: NoteId): Promise<void>;
}

export interface FoldersRepository {
  list(): Promise<NoteFolder[]>;
  create(input: CreateFolderInput): Promise<NoteFolder>;
  update(input: UpdateFolderInput): Promise<NoteFolder | undefined>;
  destroy(id: FolderId): Promise<void>;
}

export interface JournalRepository {
  listEntries(): Promise<JournalEntry[]>;
  createEntry(input: CreateJournalEntryInput): Promise<JournalEntry>;
  updateEntry(input: UpdateJournalEntryInput): Promise<JournalEntry | undefined>;
  destroyEntry(id: JournalEntryId): Promise<void>;
  listTags(): Promise<JournalTag[]>;
  createTag(input: CreateJournalTagInput): Promise<JournalTag>;
  destroyTag(id: TagId): Promise<void>;
}
