"use client";

import { useMemo } from "react";
import { useApiQuery, useApiMutation } from "@/shared/api";
import { useAuthedApiQuery } from "@/shared/api/use-authed-api-query";
import type { CreateJournalTagInput } from "@/domain/journal/actions";
import { deriveWorkspaceTags } from "@/domain/tags/workspace-tags";
import type { JournalTag } from "@/types/journal";
import { TAG_COLORS } from "@/features/journal/types";
import { useQueryClient } from "@tanstack/react-query";
import { createCacheQueryFn } from "@/shared/api/cache-query";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { journalKeys } from "./journal-keys";
import { useJournalEntries } from "./use-journal-entries";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import type { NoteFile } from "@/types/notes";

export function useJournalTags() {
	const entriesQuery = useJournalEntries();
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();
	const tagsQuery = useApiQuery<JournalTag[]>(
		journalKeys.tags(),
		async () => {
			const cached = queryClient.getQueryData<JournalTag[]>(journalKeys.tags());
			if (cached !== undefined) return cached;
			return (await backend.listJournalTags?.()) ?? [];
		},
		{ staleTime: Infinity },
	);
	const notesQuery = useAuthedApiQuery<NoteFile[]>(
		notesKeys.files(),
		async () => queryClient.getQueryData<NoteFile[]>(notesKeys.files()) ?? [],
		{ staleTime: Infinity },
	);

	const data = useMemo(
		() =>
			deriveWorkspaceTags(
				entriesQuery.data ?? [],
				tagsQuery.data ?? [],
				notesQuery.data ?? [],
			),
		[entriesQuery.data, notesQuery.data, tagsQuery.data],
	);

	return {
		...tagsQuery,
		data,
	};
}

export function useWorkspaceTags() {
	const queryClient = useQueryClient();

	return useAuthedApiQuery<JournalTag[]>(
		journalKeys.workspaceTags(),
		createCacheQueryFn<JournalTag[]>(queryClient, journalKeys.workspaceTags()),
		{ staleTime: Infinity },
	);
}

export function useCreateJournalTag() {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();

	return useApiMutation<CreateJournalTagInput, JournalTag, JournalTag[]>((input) => backend.createJournalTag(input), {
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
		onSuccess: (createdTag) => {
			queryClient.setQueryData<JournalTag[]>(journalKeys.workspaceTags(), (current) => {
				const next = current ?? [];
				if (next.some((tag) => tag.name === createdTag.name)) {
					return next.map((tag) =>
						tag.name === createdTag.name ? { ...createdTag, usageCount: tag.usageCount } : tag,
					);
				}

				return [...next, createdTag];
			});
		},
	});
}

export function useDeleteJournalTag() {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();

	return useApiMutation<string, void, JournalTag[]>((id) => backend.deleteJournalTag(id), {
		invalidateKeys: [journalKeys.tags(), journalKeys.entries()],
		optimistic: {
			queryKey: journalKeys.tags(),
			updater: (current, id) => (current ?? []).filter((tag) => tag.id !== id),
		},
		onSuccess: (_result, id) => {
			queryClient.setQueryData<JournalTag[]>(journalKeys.workspaceTags(), (current) =>
				(current ?? []).filter((tag) => tag.id !== id),
			);
		},
	});
}

export { TAG_COLORS };
