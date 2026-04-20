"use client";

import { useMemo } from "react";
import { useApiQuery, useApiMutation } from "@/core/api";
import {
  listJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  listJournalTags,
  createJournalTag,
  deleteJournalTag,
  type CreateJournalEntryInput,
  type UpdateJournalEntryInput,
  type CreateJournalTagInput,
} from "@/domain/journal/api";
import type { JournalEntry, JournalTag } from "@/types/journal";

export const journalKeys = {
  all: ["journal"] as const,
  entries: () => [...journalKeys.all, "entries"] as const,
  tags: () => [...journalKeys.all, "tags"] as const,
};

const TAG_COLORS = [
  "#3b82f6", "#f97316", "#10b981", "#ec4899", "#f59e0b",
  "#8b5cf6", "#06b6d4", "#ef4444", "#84cc16", "#14b8a6",
] as const;

function deriveJournalTags(entries: JournalEntry[], persistedTags: JournalTag[]): JournalTag[] {
  const usageCounts = new Map<string, number>();

  for (const entry of entries) {
    for (const tagName of entry.tags) {
      usageCounts.set(tagName, (usageCounts.get(tagName) ?? 0) + 1);
    }
  }

  const tagsByName = new Map(
    persistedTags.map((tag) => [
      tag.name,
      { ...tag, usageCount: usageCounts.get(tag.name) ?? 0 },
    ]),
  );

  for (const [tagName, usageCount] of usageCounts) {
    if (!tagsByName.has(tagName)) {
      tagsByName.set(tagName, {
        id: `derived-${tagName}`,
        name: tagName,
        color: TAG_COLORS[0],
        usageCount,
      });
    }
  }

  return [...tagsByName.values()].toSorted((a, b) => {
    if (b.usageCount !== a.usageCount) {
      return b.usageCount - a.usageCount;
    }

    return a.name.localeCompare(b.name);
  });
}

export function useJournalEntries() {
  return useApiQuery<JournalEntry[]>(
    journalKeys.entries(),
    () => listJournalEntries(),
  );
}

export function useJournalTags() {
  const entriesQuery = useJournalEntries();
  const tagsQuery = useApiQuery<JournalTag[]>(
    journalKeys.tags(),
    () => listJournalTags(),
  );

  const data = useMemo(
    () => deriveJournalTags(entriesQuery.data ?? [], tagsQuery.data ?? []),
    [entriesQuery.data, tagsQuery.data],
  );

  return {
    ...tagsQuery,
    data,
  };
}

export function useCreateJournalEntry() {
  return useApiMutation<CreateJournalEntryInput, JournalEntry, JournalEntry[]>(
    createJournalEntry,
    {
      invalidateKeys: [journalKeys.entries()],
      optimistic: {
        queryKey: journalKeys.entries(),
        updater: (current, input) => {
          const optimisticEntry: JournalEntry = {
            id: input.id ?? crypto.randomUUID(),
            dateKey: input.dateKey,
            content: input.content,
            tags: input.tags ?? [],
            mood: input.mood ?? undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const withoutDate = (current ?? []).filter(
            (entry) => entry.dateKey !== optimisticEntry.dateKey,
          );
          return [...withoutDate, optimisticEntry];
        },
      },
    },
  );
}

export function useUpdateJournalEntry() {
  return useApiMutation<UpdateJournalEntryInput, JournalEntry | undefined, JournalEntry[]>(
    updateJournalEntry,
    {
      invalidateKeys: [journalKeys.entries()],
      optimistic: {
        queryKey: journalKeys.entries(),
        updater: (current, input) =>
          (current ?? []).map((entry) =>
            entry.id === input.id
              ? {
                  ...entry,
                  content: input.content ?? entry.content,
                  tags: input.tags ?? entry.tags,
                  mood: input.mood === undefined ? entry.mood : input.mood ?? undefined,
                  updatedAt: new Date(),
                }
              : entry,
          ),
      },
    },
  );
}

export function useDeleteJournalEntry() {
  return useApiMutation<string, void, JournalEntry[]>(deleteJournalEntry, {
    invalidateKeys: [journalKeys.entries()],
    optimistic: {
      queryKey: journalKeys.entries(),
      updater: (current, id) => (current ?? []).filter((entry) => entry.id !== id),
    },
  });
}

export function useCreateJournalTag() {
  return useApiMutation<CreateJournalTagInput, JournalTag, JournalTag[]>(createJournalTag, {
    invalidateKeys: [journalKeys.tags()],
    optimistic: {
      queryKey: journalKeys.tags(),
      updater: (current, input) => {
        if ((current ?? []).some((tag) => tag.name === input.name)) {
          return current;
        }

        return [
          ...(current ?? []),
          {
            id: `optimistic-${input.name}`,
            name: input.name,
            color: input.color,
            usageCount: 0,
          },
        ];
      },
    },
  });
}

export function useDeleteJournalTag() {
  return useApiMutation<string, void, JournalTag[]>(deleteJournalTag, {
    invalidateKeys: [journalKeys.tags(), journalKeys.entries()],
    optimistic: {
      queryKey: journalKeys.tags(),
      updater: (current, id) => (current ?? []).filter((tag) => tag.id !== id),
    },
  });
}
