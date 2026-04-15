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
import {
  getRemoteRecord,
  listRemoteRecords,
  putRemoteRecord,
  softDeleteRemoteRecord,
} from "@/core/persistence/supabase";
import { destroyLocalRecord, getLocalRecord, listLocalRecords, putLocalRecord } from "./local-records";
import { isCloudWorkspaceTarget, type WorkspaceTarget } from "./workspace-target";
import type { JournalRepository } from "./contracts";

export function createJournalRepository(target: WorkspaceTarget): JournalRepository {
  return {
    listEntries: async () => {
      const entries = isCloudWorkspaceTarget(target)
        ? await listRemoteRecords(PERSISTED_STORE_NAMES.journalEntries, target.userId)
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

      if (isCloudWorkspaceTarget(target)) {
        await putRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, entry, target.userId);
      } else {
        await putLocalRecord(PERSISTED_STORE_NAMES.journalEntries, entry);
      }

      return fromPersistedJournalEntry(entry);
    },
    updateEntry: async (input) => {
      const existing = isCloudWorkspaceTarget(target)
        ? await getRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, input.id, target.userId)
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

      if (isCloudWorkspaceTarget(target)) {
        await putRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, updated, target.userId);
      } else {
        await putLocalRecord(PERSISTED_STORE_NAMES.journalEntries, updated);
      }

      return fromPersistedJournalEntry(updated);
    },
    destroyEntry: (id) =>
      isCloudWorkspaceTarget(target)
        ? softDeleteRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, id, target.userId)
        : destroyLocalRecord(PERSISTED_STORE_NAMES.journalEntries, id),
    listTags: async () => {
      const tags = isCloudWorkspaceTarget(target)
        ? await listRemoteRecords(PERSISTED_STORE_NAMES.tags, target.userId)
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

      if (isCloudWorkspaceTarget(target)) {
        await putRemoteRecord(PERSISTED_STORE_NAMES.tags, tag, target.userId);
      } else {
        await putLocalRecord(PERSISTED_STORE_NAMES.tags, tag);
      }

      return fromPersistedJournalTag(tag);
    },
    destroyTag: async (id) => {
      const tags = isCloudWorkspaceTarget(target)
        ? await listRemoteRecords(PERSISTED_STORE_NAMES.tags, target.userId)
        : await listLocalRecords(PERSISTED_STORE_NAMES.tags);

      const tag = tags.find((item) => item.id === id);
      if (!tag) {
        return;
      }

      const entries = isCloudWorkspaceTarget(target)
        ? await listRemoteRecords(PERSISTED_STORE_NAMES.journalEntries, target.userId)
        : await listLocalRecords(PERSISTED_STORE_NAMES.journalEntries);

      const updatedAt = new Date().toISOString() as IsoTime;

      await Promise.all(
        entries
          .filter((entry) => entry.tags.includes(tag.name))
          .map((entry) =>
            isCloudWorkspaceTarget(target)
              ? putRemoteRecord(
                  PERSISTED_STORE_NAMES.journalEntries,
                  {
                    ...entry,
                    tags: entry.tags.filter((tagName) => tagName !== tag.name),
                    updatedAt,
                  },
                  target.userId,
                )
              : putLocalRecord(PERSISTED_STORE_NAMES.journalEntries, {
                  ...entry,
                  tags: entry.tags.filter((tagName) => tagName !== tag.name),
                  updatedAt,
                }),
          ),
      );

      if (isCloudWorkspaceTarget(target)) {
        await softDeleteRemoteRecord(PERSISTED_STORE_NAMES.tags, id, target.userId);
      } else {
        await destroyLocalRecord(PERSISTED_STORE_NAMES.tags, id);
      }
    },
  };
}
