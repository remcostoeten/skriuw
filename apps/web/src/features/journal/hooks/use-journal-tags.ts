"use client";

import { useMemo } from "react";
import { useApiQuery, useApiMutation } from "@/shared/api";
import { useAuthedApiQuery } from "@/shared/api/use-authed-api-query";
import type { CreateJournalTagInput } from "@/domain/journal/actions";
import { deriveWorkspaceTags } from "@/domain/tags/workspace-tags";
import type { JournalTag } from "@/types/journal";
import { useQueryClient } from "@tanstack/react-query";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { useAuth } from "@/core/auth/use-auth";
import { useNotesCacheScope } from "@/features/notes/hooks/use-notes-cache-scope";
import { journalKeys } from "./journal-keys";
import { useJournalEntries } from "./use-journal-entries";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import type { NoteFile } from "@/types/notes";

export function useJournalTags() {
	const entriesQuery = useJournalEntries();
	const queryClient = useQueryClient();
	const auth = useAuth();
	const backend = useWorkspaceBackend();
	const notesKey = notesKeys.files(useNotesCacheScope());
	const scope =
		auth.phase === "authenticated" && auth.user
			? journalKeys.userScope(auth.user.id)
			: journalKeys.localScope();
	const tagsKey = journalKeys.tags(scope);
	const tagsQuery = useApiQuery<JournalTag[]>(
		tagsKey,
		async () => {
			const cached = queryClient.getQueryData<JournalTag[]>(tagsKey);
			if (cached !== undefined) return cached;
			return (await backend.listJournalTags?.()) ?? [];
		},
		{ enabled: auth.isReady, staleTime: Infinity },
	);
	const notesQuery = useAuthedApiQuery<NoteFile[]>(
		notesKey,
		async () => queryClient.getQueryData<NoteFile[]>(notesKey) ?? [],
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

export function useCreateJournalTag() {
	const queryClient = useQueryClient();
	const auth = useAuth();
	const backend = useWorkspaceBackend();
	const scope =
		auth.phase === "authenticated" && auth.user
			? journalKeys.userScope(auth.user.id)
			: journalKeys.localScope();
	const tagsKey = journalKeys.tags(scope);

	return useApiMutation<CreateJournalTagInput, JournalTag, JournalTag[]>(
		(input) => backend.createJournalTag(input),
		{
			invalidateKeys: [journalKeys.tags()],
			optimistic: {
				queryKey: tagsKey,
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
				queryClient.setQueryData<JournalTag[]>(
					journalKeys.workspaceTags(scope),
					(current) => {
						const next = current ?? [];
						if (next.some((tag) => tag.name === createdTag.name)) {
							return next.map((tag) =>
								tag.name === createdTag.name
									? { ...createdTag, usageCount: tag.usageCount }
									: tag,
							);
						}

						return [...next, createdTag];
					},
				);
			},
		},
	);
}
