import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mobileBackend } from "@/backend/http-backend";
import type { CreateJournalEntryInput, UpdateJournalEntryInput } from "@/backend/types";
import { mergeJournalEntriesByDate } from "@skriuw/domain/journal";

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
	return useMutation({
		mutationFn: (input: CreateJournalEntryInput) => mobileBackend.createJournalEntry(input),
		onSuccess: (entry) =>
			client.setQueryData(journalKey, (current: (typeof entry)[] | undefined) => {
				const rest =
					current?.filter(
						(item) => item.id !== entry.id && item.dateKey !== entry.dateKey,
					) ?? [];
				return mergeJournalEntriesByDate([...rest, entry]);
			}),
	});
}

export function useUpdateJournalEntry() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (input: UpdateJournalEntryInput) => mobileBackend.updateJournalEntry(input),
		onSuccess: (entry) =>
			client.setQueryData(journalKey, (current: (typeof entry)[] | undefined) =>
				(current ?? []).map((item) => (item.id === entry.id ? entry : item)),
			),
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
