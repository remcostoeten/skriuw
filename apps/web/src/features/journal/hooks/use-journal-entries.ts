"use client";

import { useApiQuery, useApiMutation } from "@/shared/api";
import type { CreateJournalEntryInput, UpdateJournalEntryInput } from "@/domain/journal/actions";
import type { JournalEntry } from "@/types/journal";
import { useQueryClient } from "@tanstack/react-query";
import { journalKeys } from "./journal-keys";
import { useAuth } from "@/core/auth/use-auth";
import { useWorkspaceBackend } from "@/core/workspace-backend";

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
	const auth = useAuth();
	const backend = useWorkspaceBackend();
	const scope =
		auth.phase === "authenticated" && auth.user
			? journalKeys.userScope(auth.user.id)
			: journalKeys.localScope();
	const entriesKey = journalKeys.entries(scope);

	return useApiQuery<JournalEntry[]>(
		entriesKey,
		// Cache-first: on web the list is RSC-hydrated, so this returns it without a
		// network hit. On desktop there is no prefetch, so fall through to the
		// backend (Tauri → local SQLite); guest backends have no list method → [].
		async () => {
			const cached = queryClient.getQueryData<JournalEntry[]>(entriesKey);
			if (cached !== undefined) return cached;
			return (await backend.listJournalEntries?.()) ?? [];
		},
		{
			enabled: auth.isReady,
			staleTime: Infinity,
			select: mergeJournalEntriesByActiveDate,
		},
	);
}

export function useCreateJournalEntry() {
	const auth = useAuth();
	const backend = useWorkspaceBackend();
	const scope =
		auth.phase === "authenticated" && auth.user
			? journalKeys.userScope(auth.user.id)
			: journalKeys.localScope();
	const entriesKey = journalKeys.entries(scope);

	return useApiMutation<CreateJournalEntryInput, JournalEntry, JournalEntry[]>(
		(input) => backend.createJournalEntry(input),
		{
			invalidateKeys: [journalKeys.entries()],
			optimistic: {
				queryKey: entriesKey,
				updater: (current, input) => {
					const optimisticEntry: JournalEntry = {
						id: input.id ?? crypto.randomUUID(),
						dateKey: input.dateKey,
						title: input.title ?? undefined,
						content: input.content,
						richContent: input.richContent ?? undefined,
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
	const auth = useAuth();
	const backend = useWorkspaceBackend();
	const scope =
		auth.phase === "authenticated" && auth.user
			? journalKeys.userScope(auth.user.id)
			: journalKeys.localScope();
	const entriesKey = journalKeys.entries(scope);

	return useApiMutation<UpdateJournalEntryInput, JournalEntry | undefined, JournalEntry[]>(
		(input) => backend.updateJournalEntry(input),
		{
			invalidateKeys: [journalKeys.entries()],
			optimistic: {
				queryKey: entriesKey,
				updater: (current, input) =>
					mergeJournalEntriesByActiveDate(
						(current ?? []).map((entry) =>
							entry.id === input.id
								? {
										...entry,
										title:
											input.title === undefined
												? entry.title
												: (input.title ?? undefined),
										content: input.content ?? entry.content,
										richContent:
											input.richContent === undefined
												? entry.richContent
												: (input.richContent ?? undefined),
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
	const auth = useAuth();
	const backend = useWorkspaceBackend();
	const scope =
		auth.phase === "authenticated" && auth.user
			? journalKeys.userScope(auth.user.id)
			: journalKeys.localScope();
	const entriesKey = journalKeys.entries(scope);

	return useApiMutation<string, void, JournalEntry[]>((id) => backend.deleteJournalEntry(id), {
		invalidateKeys: [journalKeys.entries()],
		optimistic: {
			queryKey: entriesKey,
			updater: (current, id) => (current ?? []).filter((entry) => entry.id !== id),
		},
	});
}
