"use client";

import { useAuth } from "@/core/auth/use-auth";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import type { ChipRewriteResult, TaggedNoteSummary } from "@/core/workspace-backend/types";
import type { Person } from "@/domain/people/models";
import type { UpdatePersonInput } from "@/domain/people/validation";
import { useChipRewriteInvalidation } from "@/features/tags/hooks/use-tags";
import { useApiMutation, useApiQuery } from "@/shared/api";
import { showUserToast } from "@/shared/lib/user-toast";
import { peopleKeys } from "../lib/people-keys";
import { usePeopleScope } from "./use-people-scope";

export function usePersonNotes(personId: string) {
	const scope = usePeopleScope();
	const backend = useWorkspaceBackend();
	const auth = useAuth();
	return useApiQuery<TaggedNoteSummary[]>(
		[...peopleKeys.all, "notes", scope, personId],
		() => backend.listPersonNotes(personId),
		{ enabled: auth.isReady && personId.length > 0 },
	);
}

export function useUpdatePerson() {
	const listKey = peopleKeys.list(usePeopleScope());
	const backend = useWorkspaceBackend();

	return useApiMutation<UpdatePersonInput, Person, Person[]>(
		(input) => backend.updatePerson(input),
		{
			invalidateKeys: [listKey],
			onError: (error) => {
				showUserToast(
					error.message.includes("Unique") || error.message.includes("unique")
						? "A person with that name already exists — merge them instead"
						: "Couldn't update person",
					"error",
				);
			},
			optimistic: {
				queryKey: listKey,
				updater: (current, input) =>
					(current ?? []).map((person) =>
						person.id === input.id
							? {
									...person,
									...(input.name !== undefined ? { name: input.name } : {}),
									...(input.color !== undefined ? { color: input.color ?? null } : {}),
								}
							: person,
					),
			},
		},
	);
}

export function useDeletePerson() {
	const listKey = peopleKeys.list(usePeopleScope());
	const backend = useWorkspaceBackend();
	const invalidate = useChipRewriteInvalidation();

	return useApiMutation<Person, ChipRewriteResult, Person[]>(
		(person) => backend.deletePerson(person.id),
		{
			invalidateKeys: [listKey],
			onSuccess: (result, person) => {
				invalidate();
				showUserToast(
					`Removed ${person.name} from ${result.rewrittenNoteIds.length} ${
						result.rewrittenNoteIds.length === 1 ? "note" : "notes"
					}`,
					"success",
				);
			},
			onError: () => showUserToast("Couldn't delete person", "error"),
			optimistic: {
				queryKey: listKey,
				updater: (current, person) =>
					(current ?? []).filter((entry) => entry.id !== person.id),
			},
		},
	);
}

export function useMergePersons() {
	const listKey = peopleKeys.list(usePeopleScope());
	const backend = useWorkspaceBackend();
	const invalidate = useChipRewriteInvalidation();

	return useApiMutation<{ source: Person; target: Person }, ChipRewriteResult, Person[]>(
		(input) => backend.mergePersons(input.source.id, input.target.id),
		{
			invalidateKeys: [listKey],
			onSuccess: (result, input) => {
				invalidate();
				showUserToast(
					`Merged ${input.source.name} into ${input.target.name} across ${result.rewrittenNoteIds.length} ${
						result.rewrittenNoteIds.length === 1 ? "note" : "notes"
					}`,
					"success",
				);
			},
			onError: () => showUserToast("Couldn't merge people", "error"),
			optimistic: {
				queryKey: listKey,
				updater: (current, input) =>
					(current ?? []).filter((entry) => entry.id !== input.source.id),
			},
		},
	);
}
