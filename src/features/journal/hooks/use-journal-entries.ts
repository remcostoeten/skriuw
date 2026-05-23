"use client";

import { useApiQuery, useApiMutation } from "@/shared/api";
import {
	createJournalEntry,
	updateJournalEntry,
	deleteJournalEntry,
	type CreateJournalEntryInput,
	type UpdateJournalEntryInput,
} from "@/domain/journal/actions";
import type { JournalEntry } from "@/types/journal";
import { useQueryClient } from "@tanstack/react-query";
import { createCacheQueryFn } from "@/shared/api/cache-query";
import { journalKeys } from "./journal-keys";

export function useJournalEntries() {
	const queryClient = useQueryClient();

	return useApiQuery<JournalEntry[]>(
		journalKeys.entries(),
		createCacheQueryFn<JournalEntry[]>(queryClient, journalKeys.entries()),
		{ staleTime: Infinity },
	);
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
									mood:
										input.mood === undefined
											? entry.mood
											: (input.mood ?? undefined),
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
