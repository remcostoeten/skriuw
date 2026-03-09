import {
  PERSISTED_STORE_NAMES,
  type IsoTime,
  type JournalEntryId,
  type MarkdownContent,
} from "@/core/shared/persistence-types";
import { putRecord } from "@/core/storage";
import type { JournalEntry } from "@/features/journal/types";
import { fromPersistedJournalEntry } from "./mappers";
import type { CreateJournalEntryInput } from "./types";

export async function createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
  const timestamp = input.createdAt ?? new Date();
  const created = await putRecord(PERSISTED_STORE_NAMES.journalEntries, {
    id: (input.id ?? crypto.randomUUID()) as JournalEntryId,
    dateKey: input.dateKey,
    content: input.content as MarkdownContent,
    tags: input.tags ?? [],
    mood: input.mood ?? null,
    createdAt: timestamp.toISOString() as IsoTime,
    updatedAt: (input.updatedAt ?? timestamp).toISOString() as IsoTime,
  });

  return fromPersistedJournalEntry(created);
}
