import { type IsoTime, type JournalEntryId, type MarkdownContent } from "@/core/shared/persistence-types";
import type { JournalEntry } from "@/types/journal";
import { fromPersistedJournalEntry } from "./mappers";
import { writeJournalEntryRecord } from "./persistence";
import type { CreateJournalEntryInput } from "./types";

export async function createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
  const timestamp = input.createdAt ?? new Date();
  const created = await writeJournalEntryRecord({
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
