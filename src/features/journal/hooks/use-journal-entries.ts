"use client";

import { useApiQuery, useApiMutation } from "@/shared/api";
import {
	listJournalEntries,
	createJournalEntry,
	updateJournalEntry,
	deleteJournalEntry,
	type CreateJournalEntryInput,
	type UpdateJournalEntryInput,
} from "@/domain/journal/api";
import type { JournalEntry } from "@/types/journal";
import { journalKeys } from "./journal-keys";

export function useJournalEntries() {
	return useApiQuery<JournalEntry[]>(journalKeys.entries(), () => listJournalEntries());
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
