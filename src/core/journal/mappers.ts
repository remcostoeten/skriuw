import type {
  CssColorValue,
  DateKey,
  IsoTime,
  JournalEntryId,
  MarkdownContent,
  PersistedJournalEntry,
  PersistedTag,
  TagId,
  TagName,
} from "@/core/shared/persistence-types";
import type { JournalEntry, JournalTag } from "@/modules/journal";

function toIsoTime(date: Date): IsoTime {
  return date.toISOString() as IsoTime;
}

export function toPersistedJournalEntry(entry: JournalEntry): PersistedJournalEntry {
  return {
    id: entry.id as JournalEntryId,
    dateKey: entry.dateKey as DateKey,
    content: entry.content as MarkdownContent,
    tags: entry.tags.map((tag) => tag as TagName),
    mood: entry.mood ?? null,
    createdAt: toIsoTime(entry.createdAt),
    updatedAt: toIsoTime(entry.updatedAt),
  };
}

export function fromPersistedJournalEntry(entry: PersistedJournalEntry): JournalEntry {
  return {
    id: entry.id,
    dateKey: entry.dateKey,
    content: entry.content,
    tags: entry.tags.map((tag) => tag as string),
    mood: entry.mood ?? undefined,
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt),
  };
}

export function toPersistedJournalTag(tag: JournalTag): PersistedTag {
  const now = new Date();
  return {
    id: tag.id as TagId,
    name: tag.name as TagName,
    color: tag.color as CssColorValue,
    usageCount: tag.usageCount,
    lastUsedAt: null,
    createdAt: toIsoTime(now),
    updatedAt: toIsoTime(now),
  };
}

export function fromPersistedJournalTag(tag: PersistedTag): JournalTag {
  return {
    id: tag.id,
    name: tag.name as string,
    color: tag.color as string,
    usageCount: tag.usageCount,
  };
}
