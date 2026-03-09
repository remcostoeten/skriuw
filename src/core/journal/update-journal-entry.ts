import {
  PERSISTED_STORE_NAMES,
  type IsoTime,
  type MarkdownContent,
} from "@/core/shared/persistence-types";
import { getRecord, putRecord } from "@/core/storage";
import type { JournalEntry } from "@/features/journal/types";
import { fromPersistedJournalEntry } from "./mappers";
import type { UpdateJournalEntryInput } from "./types";

export async function updateJournalEntry(
  input: UpdateJournalEntryInput,
): Promise<JournalEntry | undefined> {
  const existing = await getRecord(PERSISTED_STORE_NAMES.journalEntries, input.id);
  if (!existing) {
    return undefined;
  }

  const updated = await putRecord(PERSISTED_STORE_NAMES.journalEntries, {
    ...existing,
    content: (input.content ?? existing.content) as MarkdownContent,
    tags: input.tags ?? existing.tags,
    mood: input.mood === undefined ? existing.mood : input.mood,
    updatedAt: (input.updatedAt ?? new Date()).toISOString() as IsoTime,
  });

  return fromPersistedJournalEntry(updated);
}
