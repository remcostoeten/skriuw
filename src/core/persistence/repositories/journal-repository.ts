import type {
  CreateJournalEntryInput,
  CreateJournalTagInput,
  UpdateJournalEntryInput,
} from "@/core/journal";
import {
  fromPersistedJournalEntry,
  fromPersistedJournalTag,
} from "@/core/journal";
import {
  PERSISTED_STORE_NAMES,
  type IsoTime,
  type JournalEntryId,
  type MarkdownContent,
  type PersistedJournalEntry,
  type PersistedTag,
  type TagId,
} from "@/core/shared/persistence-types";
import type { JournalEntry, JournalTag } from "@/types/journal";
import {
  canUseRemotePersistence,
  getRemoteRecord,
  listRemoteRecords,
  putRemoteRecord,
  softDeleteRemoteRecord,
} from "@/core/persistence/supabase";
import { destroyLocalRecord, getLocalRecord, listLocalRecords, putLocalRecord } from "./local-records";

export interface JournalRepository {
  listEntries(): Promise<JournalEntry[]>;
  createEntry(input: CreateJournalEntryInput): Promise<JournalEntry>;
  updateEntry(input: UpdateJournalEntryInput): Promise<JournalEntry | undefined>;
  destroyEntry(id: JournalEntryId): Promise<void>;
  listTags(): Promise<JournalTag[]>;
  createTag(input: CreateJournalTagInput): Promise<JournalTag>;
  destroyTag(id: TagId): Promise<void>;
}

export const journalRepository: JournalRepository = {
  listEntries: async () => {
    const entries = canUseRemotePersistence()
      ? await listRemoteRecords(PERSISTED_STORE_NAMES.journalEntries)
      : await listLocalRecords(PERSISTED_STORE_NAMES.journalEntries);

    return entries.map(fromPersistedJournalEntry);
  },
  createEntry: async (input) => {
    const now = input.createdAt ?? new Date();
    const entry: PersistedJournalEntry = {
      id: (input.id ?? crypto.randomUUID()) as JournalEntryId,
      dateKey: input.dateKey,
      content: input.content as MarkdownContent,
      tags: input.tags ?? [],
      mood: input.mood ?? null,
      createdAt: now.toISOString() as IsoTime,
      updatedAt: (input.updatedAt ?? now).toISOString() as IsoTime,
    };

    if (canUseRemotePersistence()) {
      await putRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, entry);
    } else {
      await putLocalRecord(PERSISTED_STORE_NAMES.journalEntries, entry);
    }

    return fromPersistedJournalEntry(entry);
  },
  updateEntry: async (input) => {
    const existing = canUseRemotePersistence()
      ? await getRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, input.id)
      : await getLocalRecord(PERSISTED_STORE_NAMES.journalEntries, input.id);

    if (!existing) {
      return undefined;
    }

    const updated: PersistedJournalEntry = {
      ...existing,
      content: (input.content ?? existing.content) as MarkdownContent,
      tags: input.tags ?? existing.tags,
      mood: input.mood === undefined ? existing.mood : input.mood,
      updatedAt: (input.updatedAt ?? new Date()).toISOString() as IsoTime,
    };

    if (canUseRemotePersistence()) {
      await putRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, updated);
    } else {
      await putLocalRecord(PERSISTED_STORE_NAMES.journalEntries, updated);
    }

    return fromPersistedJournalEntry(updated);
  },
  destroyEntry: (id) =>
    canUseRemotePersistence()
      ? softDeleteRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, id)
      : destroyLocalRecord(PERSISTED_STORE_NAMES.journalEntries, id),
  listTags: async () => {
    const tags = canUseRemotePersistence()
      ? await listRemoteRecords(PERSISTED_STORE_NAMES.tags)
      : await listLocalRecords(PERSISTED_STORE_NAMES.tags);

    return tags.map(fromPersistedJournalTag);
  },
  createTag: async (input) => {
    const now = new Date();
    const tag: PersistedTag = {
      id: (input.id ?? crypto.randomUUID()) as TagId,
      name: input.name,
      color: input.color,
      usageCount: input.usageCount ?? 0,
      lastUsedAt: input.lastUsedAt ?? null,
      createdAt: (input.createdAt ?? now).toISOString() as IsoTime,
      updatedAt: (input.updatedAt ?? now).toISOString() as IsoTime,
    };

    if (canUseRemotePersistence()) {
      await putRemoteRecord(PERSISTED_STORE_NAMES.tags, tag);
    } else {
      await putLocalRecord(PERSISTED_STORE_NAMES.tags, tag);
    }

    return fromPersistedJournalTag(tag);
  },
  destroyTag: async (id) => {
    const tags = canUseRemotePersistence()
      ? await listRemoteRecords(PERSISTED_STORE_NAMES.tags)
      : await listLocalRecords(PERSISTED_STORE_NAMES.tags);

    const tag = tags.find((item) => item.id === id);
    if (!tag) {
      return;
    }

    const entries = canUseRemotePersistence()
      ? await listRemoteRecords(PERSISTED_STORE_NAMES.journalEntries)
      : await listLocalRecords(PERSISTED_STORE_NAMES.journalEntries);

    const updatedAt = new Date().toISOString() as IsoTime;

    await Promise.all(
      entries
        .filter((entry) => entry.tags.includes(tag.name))
        .map((entry) =>
          canUseRemotePersistence()
            ? putRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, {
                ...entry,
                tags: entry.tags.filter((tagName) => tagName !== tag.name),
                updatedAt,
              })
            : putLocalRecord(PERSISTED_STORE_NAMES.journalEntries, {
                ...entry,
                tags: entry.tags.filter((tagName) => tagName !== tag.name),
                updatedAt,
              }),
        ),
    );

    if (canUseRemotePersistence()) {
      await softDeleteRemoteRecord(PERSISTED_STORE_NAMES.tags, id);
    } else {
      await destroyLocalRecord(PERSISTED_STORE_NAMES.tags, id);
    }
  },
};
