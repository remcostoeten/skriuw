"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  listJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  listJournalTags,
  createJournalTag,
  deleteJournalTag,
} from "@/core/persistence/journal";
import type {
  CssColorValue,
  DateKey,
  JournalEntryId,
  TagId,
  TagName,
} from "@/core/shared/persistence-types";
import { TAG_COLORS, type JournalEntry, type JournalTag, type MoodLevel } from "../types";
import { getWorkspaceId } from "@/platform/auth";
import type {
  CreateJournalEntryInput,
  CreateJournalTagInput,
  UpdateJournalEntryInput,
} from "@/core/journal";

export const journalKeys = {
  all: ["journal"] as const,
  entries: (workspaceId: string) => [...journalKeys.all, "entries", workspaceId] as const,
  tags: (workspaceId: string) => [...journalKeys.all, "tags", workspaceId] as const,
};

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
  const workspaceId = getWorkspaceId();
  return useQuery({
    queryKey: journalKeys.entries(workspaceId),
    queryFn: () => listJournalEntries(),
    enabled: !!workspaceId,
  });
}

export function useJournalTags() {
  const workspaceId = getWorkspaceId();
  const entriesQuery = useJournalEntries();
  const tagsQuery = useQuery({
    queryKey: journalKeys.tags(workspaceId),
    queryFn: () => listJournalTags(),
    enabled: !!workspaceId,
  });

  const data = useMemo(
    () => deriveJournalTags(entriesQuery.data ?? [], tagsQuery.data ?? []),
    [entriesQuery.data, tagsQuery.data],
  );

  return {
    ...tagsQuery,
    data,
  };
}

export function useUpdateJournalEntry() {
  const queryClient = useQueryClient();
  const workspaceId = getWorkspaceId();

  return useMutation({
    mutationFn: (variables: UpdateJournalEntryInput) => updateJournalEntry(variables),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: journalKeys.entries(workspaceId) });
      const previousEntries =
        queryClient.getQueryData<JournalEntry[]>(journalKeys.entries(workspaceId)) ?? [];

      queryClient.setQueryData<JournalEntry[]>(journalKeys.entries(workspaceId), (current = []) =>
        current.map((entry) =>
          entry.id === variables.id
            ? {
                ...entry,
                content: variables.content ?? entry.content,
                tags: variables.tags ?? entry.tags,
                mood: variables.mood === undefined ? entry.mood : variables.mood ?? undefined,
                updatedAt: variables.updatedAt ?? new Date(),
              }
            : entry,
        ),
      );

      return { previousEntries };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(journalKeys.entries(workspaceId), context.previousEntries);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: journalKeys.entries(workspaceId) });
    },
  });
}

export function useCreateJournalEntry() {
  const queryClient = useQueryClient();
  const workspaceId = getWorkspaceId();

  return useMutation({
    mutationFn: (variables: CreateJournalEntryInput) => createJournalEntry(variables),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: journalKeys.entries(workspaceId) });
      const previousEntries =
        queryClient.getQueryData<JournalEntry[]>(journalKeys.entries(workspaceId)) ?? [];
      const optimisticEntry: JournalEntry = {
        id: (variables.id ?? crypto.randomUUID()) as JournalEntryId,
        dateKey: variables.dateKey as DateKey,
        content: variables.content,
        tags: variables.tags ?? [],
        mood: variables.mood ?? undefined,
        createdAt: variables.createdAt ?? new Date(),
        updatedAt: variables.updatedAt ?? variables.createdAt ?? new Date(),
      };

      queryClient.setQueryData<JournalEntry[]>(journalKeys.entries(workspaceId), (current = []) => {
        const withoutDate = current.filter((entry) => entry.dateKey !== optimisticEntry.dateKey);
        return [...withoutDate, optimisticEntry];
      });

      return { previousEntries };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(journalKeys.entries(workspaceId), context.previousEntries);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: journalKeys.entries(workspaceId) });
    },
  });
}

export function useDeleteJournalEntry() {
  const queryClient = useQueryClient();
  const workspaceId = getWorkspaceId();

  return useMutation({
    mutationFn: (id: JournalEntryId) => deleteJournalEntry(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: journalKeys.entries(workspaceId) });
      const previousEntries =
        queryClient.getQueryData<JournalEntry[]>(journalKeys.entries(workspaceId)) ?? [];

      queryClient.setQueryData<JournalEntry[]>(journalKeys.entries(workspaceId), (current = []) =>
        current.filter((entry) => entry.id !== id),
      );

      return { previousEntries };
    },
    onError: (_error, _id, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(journalKeys.entries(workspaceId), context.previousEntries);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: journalKeys.entries(workspaceId) });
    },
  });
}

export function useCreateJournalTag() {
  const queryClient = useQueryClient();
  const workspaceId = getWorkspaceId();

  return useMutation({
    mutationFn: (variables: { name: TagName; color?: CssColorValue }) =>
      createJournalTag({
        name: variables.name,
        color: variables.color ?? TAG_COLORS[0],
      } satisfies CreateJournalTagInput),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: journalKeys.tags(workspaceId) });
      const previousTags = queryClient.getQueryData<JournalTag[]>(journalKeys.tags(workspaceId)) ?? [];

      queryClient.setQueryData<JournalTag[]>(journalKeys.tags(workspaceId), (current = []) => {
        if (current.some((tag) => tag.name === variables.name)) {
          return current;
        }

        return [
          ...current,
          {
            id: `optimistic-${variables.name}`,
            name: variables.name,
            color: variables.color ?? TAG_COLORS[0],
            usageCount: 0,
          },
        ];
      });

      return { previousTags };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTags) {
        queryClient.setQueryData(journalKeys.tags(workspaceId), context.previousTags);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: journalKeys.tags(workspaceId) });
    },
  });
}

export function useDeleteJournalTag() {
  const queryClient = useQueryClient();
  const workspaceId = getWorkspaceId();

  return useMutation({
    mutationFn: (id: TagId) => deleteJournalTag(id),
    onMutate: async (id) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: journalKeys.tags(workspaceId) }),
        queryClient.cancelQueries({ queryKey: journalKeys.entries(workspaceId) }),
      ]);

      const previousTags = queryClient.getQueryData<JournalTag[]>(journalKeys.tags(workspaceId)) ?? [];
      const previousEntries =
        queryClient.getQueryData<JournalEntry[]>(journalKeys.entries(workspaceId)) ?? [];
      const tagToRemove = previousTags.find((tag) => tag.id === id);

      queryClient.setQueryData<JournalTag[]>(journalKeys.tags(workspaceId), (current = []) =>
        current.filter((tag) => tag.id !== id),
      );

      if (tagToRemove) {
        queryClient.setQueryData<JournalEntry[]>(journalKeys.entries(workspaceId), (current = []) =>
          current.map((entry) => ({
            ...entry,
            tags: entry.tags.filter((tagName) => tagName !== tagToRemove.name),
          })),
        );
      }

      return { previousTags, previousEntries };
    },
    onError: (_error, _id, context) => {
      if (context?.previousTags) {
        queryClient.setQueryData(journalKeys.tags(workspaceId), context.previousTags);
      }

      if (context?.previousEntries) {
        queryClient.setQueryData(journalKeys.entries(workspaceId), context.previousEntries);
      }
    },
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: journalKeys.tags(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: journalKeys.entries(workspaceId) }),
      ]);
    },
  });
}
