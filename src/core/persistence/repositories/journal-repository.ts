import {
  createJournalEntry,
  createJournalTag,
  destroyJournalEntry,
  destroyJournalTag,
  readJournalEntries,
  readJournalTags,
  updateJournalEntry,
} from "@/core/journal";
import type {
  CreateJournalEntryInput,
  CreateJournalTagInput,
  UpdateJournalEntryInput,
} from "@/core/journal";
import type { JournalEntryId, TagId } from "@/core/shared/persistence-types";
import type { JournalEntry, JournalTag } from "@/features/journal/types";

export interface JournalRepository {
  listEntries(): Promise<JournalEntry[]>;
  createEntry(input: CreateJournalEntryInput): Promise<JournalEntry>;
  updateEntry(input: UpdateJournalEntryInput): Promise<JournalEntry | undefined>;
  destroyEntry(id: JournalEntryId): Promise<void>;
  listTags(): Promise<JournalTag[]>;
  createTag(input: CreateJournalTagInput): Promise<JournalTag>;
  destroyTag(id: TagId): Promise<void>;
}

export const indexedDbJournalRepository: JournalRepository = {
  listEntries: () => readJournalEntries(),
  createEntry: (input) => createJournalEntry(input),
  updateEntry: (input) => updateJournalEntry(input),
  destroyEntry: (id) => destroyJournalEntry(id),
  listTags: () => readJournalTags(),
  createTag: (input) => createJournalTag(input),
  destroyTag: (id) => destroyJournalTag(id),
};
