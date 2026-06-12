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

function timeValue(value: Date): number {
	return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function entryTimestamp(entry: JournalEntry): number {
	return timeValue(entry.updatedAt) || timeValue(entry.createdAt);
}

function isNewerJournalEntry(candidate: JournalEntry, current: JournalEntry): boolean {
	const candidateTime = entryTimestamp(candidate);
	const currentTime = entryTimestamp(current);

	if (candidateTime !== currentTime) {
		return candidateTime > currentTime;
	}

	return candidate.id > current.id;
}

export function mergeJournalEntriesByActiveDate(entries: JournalEntry[]): JournalEntry[] {
	const entryByDate = new Map<string, JournalEntry>();

	for (const entry of entries) {
		const current = entryByDate.get(entry.dateKey);
		if (!current || isNewerJournalEntry(entry, current)) {
			entryByDate.set(entry.dateKey, entry);
		}
	}

	return [...entryByDate.values()];
}

export function upsertJournalEntryByActiveDate(
	current: JournalEntry[] | undefined,
	nextEntry: JournalEntry,
): JournalEntry[] {
	return mergeJournalEntriesByActiveDate([
		...(current ?? []).filter((entry) => entry.dateKey !== nextEntry.dateKey),
		nextEntry,
	]);
}

export function useJournalEntries() {
	const queryClient = useQueryClient();

	return useApiQuery<JournalEntry[]>(
		journalKeys.entries(),
		createCacheQueryFn<JournalEntry[]>(queryClient, journalKeys.entries()),
		{ staleTime: Infinity, select: mergeJournalEntriesByActiveDate },
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

					return upsertJournalEntryByActiveDate(current, optimisticEntry);
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
					mergeJournalEntriesByActiveDate(
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
