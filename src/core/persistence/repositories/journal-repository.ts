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
  destroyPGliteRecord,
  getPGliteRecord,
  listPGliteRecords,
  putPGliteRecord,
} from "@/core/persistence/pglite";
import type { JournalEntry, JournalTag } from "@/features/journal/types";
import { pushRecordToRemote, deleteRecordFromRemote } from "@/core/persistence/supabase";
import { resolveLocalPersistenceBackend } from "./local-backend";

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

export const pGliteJournalRepository: JournalRepository = {
  listEntries: async () => {
    const entries = await listPGliteRecords(PERSISTED_STORE_NAMES.journalEntries);
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

    await putPGliteRecord(PERSISTED_STORE_NAMES.journalEntries, entry);

    void pushRecordToRemote(PERSISTED_STORE_NAMES.journalEntries, entry as unknown as Record<string, unknown>);

    return fromPersistedJournalEntry(entry);
  },
  updateEntry: async (input) => {
    const existing = await getPGliteRecord(PERSISTED_STORE_NAMES.journalEntries, input.id);
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

    await putPGliteRecord(PERSISTED_STORE_NAMES.journalEntries, updated);

    void pushRecordToRemote(PERSISTED_STORE_NAMES.journalEntries, updated as unknown as Record<string, unknown>);

    return fromPersistedJournalEntry(updated);
  },
  destroyEntry: async (id) => {
    await destroyPGliteRecord(PERSISTED_STORE_NAMES.journalEntries, id);
    void deleteRecordFromRemote(PERSISTED_STORE_NAMES.journalEntries, id);
  },
  listTags: async () => {
    const tags = await listPGliteRecords(PERSISTED_STORE_NAMES.tags);
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

    await putPGliteRecord(PERSISTED_STORE_NAMES.tags, tag);

    void pushRecordToRemote(PERSISTED_STORE_NAMES.tags, tag as unknown as Record<string, unknown>);

    return fromPersistedJournalTag(tag);
  },
  destroyTag: async (id) => {
    const tags = await listPGliteRecords(PERSISTED_STORE_NAMES.tags);
    const tag = tags.find((item) => item.id === id);
    if (!tag) {
      return;
    }

    const entries = await listPGliteRecords(PERSISTED_STORE_NAMES.journalEntries);
    await Promise.all(
      entries
        .filter((entry) => entry.tags.includes(tag.name))
        .map((entry) =>
          putPGliteRecord(PERSISTED_STORE_NAMES.journalEntries, {
            ...entry,
            tags: entry.tags.filter((tagName) => tagName !== tag.name),
            updatedAt: new Date().toISOString() as IsoTime,
          }),
        ),
    );

    await destroyPGliteRecord(PERSISTED_STORE_NAMES.tags, id);
    void deleteRecordFromRemote(PERSISTED_STORE_NAMES.tags, id);
  },
};

export const journalRepository: JournalRepository = {
  listEntries: async () => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteJournalRepository.listEntries()
      : indexedDbJournalRepository.listEntries();
  },
  createEntry: async (input) => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteJournalRepository.createEntry(input)
      : indexedDbJournalRepository.createEntry(input);
  },
  updateEntry: async (input) => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteJournalRepository.updateEntry(input)
      : indexedDbJournalRepository.updateEntry(input);
  },
  destroyEntry: async (id) => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteJournalRepository.destroyEntry(id)
      : indexedDbJournalRepository.destroyEntry(id);
  },
  listTags: async () => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteJournalRepository.listTags()
      : indexedDbJournalRepository.listTags();
  },
  createTag: async (input) => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteJournalRepository.createTag(input)
      : indexedDbJournalRepository.createTag(input);
  },
  destroyTag: async (id) => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteJournalRepository.destroyTag(id)
      : indexedDbJournalRepository.destroyTag(id);
  },
};
