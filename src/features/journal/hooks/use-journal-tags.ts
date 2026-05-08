"use client";

import { useMemo } from "react";
import { useApiQuery, useApiMutation } from "@/shared/api";
import {
  listJournalTags,
  createJournalTag,
  deleteJournalTag,
  type CreateJournalTagInput,
} from "@/domain/journal/api";
import type { JournalEntry, JournalTag } from "@/types/journal";
import { TAG_COLORS } from "@/features/journal/types";
import { journalKeys } from "./journal-keys";
import { useJournalEntries } from "./use-journal-entries";

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
