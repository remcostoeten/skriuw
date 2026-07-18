import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mobileBackend } from "@/backend/http-backend";
import type {
	CreateJournalEntryInput,
	JournalEntry,
	UpdateJournalEntryInput,
} from "@/backend/types";
import { mergeJournalEntriesByDate } from "@skriuw/domain/journal";
import { scheduleAutoCalendarSync } from "@/calendar/auto-sync";
import { useMobilePreferences } from "@/preferences/preferences-provider";

export const journalKey = ["journal", "entries"] as const;

export function useJournalEntries() {
	return useQuery({
		queryKey: journalKey,
		queryFn: async () => mergeJournalEntriesByDate(await mobileBackend.listJournalEntries()),
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
	});
}

export function useCreateJournalEntry() {
	const client = useQueryClient();
	const { calendarAutoSync } = useMobilePreferences();
	return useMutation({
		mutationFn: (input: CreateJournalEntryInput) => mobileBackend.createJournalEntry(input),
		onSuccess: (entry) => {
			client.setQueryData(journalKey, (current: (typeof entry)[] | undefined) => {
				const rest =
					current?.filter(
						(item) => item.id !== entry.id && item.dateKey !== entry.dateKey,
					) ?? [];
				return mergeJournalEntriesByDate([...rest, entry]);
			});
			if (calendarAutoSync) {
				scheduleAutoCalendarSync(
					() => client.getQueryData<JournalEntry[]>(journalKey) ?? [],
				);
			}
		},
	});
}

export function useUpdateJournalEntry() {
	const client = useQueryClient();
	const { calendarAutoSync } = useMobilePreferences();
	return useMutation({
		mutationFn: (input: UpdateJournalEntryInput) => mobileBackend.updateJournalEntry(input),
		onSuccess: (entry) => {
			client.setQueryData(journalKey, (current: (typeof entry)[] | undefined) =>
				(current ?? []).map((item) => (item.id === entry.id ? entry : item)),
			);
			if (calendarAutoSync) {
				scheduleAutoCalendarSync(
					() => client.getQueryData<JournalEntry[]>(journalKey) ?? [],
				);
			}
		},
	});
}

export function useDeleteJournalEntry() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => mobileBackend.deleteJournalEntry(id),
		onSuccess: (_data, id) =>
			client.setQueryData(journalKey, (current: { id: string }[] | undefined) =>
				(current ?? []).filter((item) => item.id !== id),
			),
	});
}
