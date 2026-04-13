import { type IsoTime, type MarkdownContent } from "@/core/shared/persistence-types";
import type { JournalEntry } from "@/types/journal";
import { fromPersistedJournalEntry } from "./mappers";
import { readJournalEntryRecord, writeJournalEntryRecord } from "./persistence";
import type { UpdateJournalEntryInput } from "./types";

export async function updateJournalEntry(
  input: UpdateJournalEntryInput,
): Promise<JournalEntry | undefined> {
  const existing = await readJournalEntryRecord(input.id);
  if (!existing) {
    return undefined;
  }

  const updated = await writeJournalEntryRecord({
    ...existing,
    content: (input.content ?? existing.content) as MarkdownContent,
    tags: input.tags ?? existing.tags,
    mood: input.mood === undefined ? existing.mood : input.mood,
    updatedAt: (input.updatedAt ?? new Date()).toISOString() as IsoTime,
  });

  return fromPersistedJournalEntry(updated);
}
