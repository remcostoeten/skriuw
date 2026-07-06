"use client";

import { useWorkspaceBackend } from "@/core/workspace-backend";
import type { Person } from "@/domain/people/models";
import type { CreatePersonInput } from "@/domain/people/validation";
import { useApiMutation } from "@/shared/api";
import { showUserToast } from "@/shared/lib/user-toast";
import { peopleKeys } from "../lib/people-keys";
import { usePeopleScope } from "./use-people-scope";

export function useCreatePerson() {
	const listKey = peopleKeys.list(usePeopleScope());
	const backend = useWorkspaceBackend();

	return useApiMutation<CreatePersonInput, Person, Person[]>(
		(input) => backend.createPerson(input),
		{
			invalidateKeys: [listKey],
			onError: () => {
				showUserToast("Couldn't add person", "error");
			},
			optimistic: {
				queryKey: listKey,
				updater: (current, input) => {
					const name = input.name.trim();
					const key = name.toLowerCase();
					if ((current ?? []).some((person) => person.name.toLowerCase() === key)) {
						return current;
					}
					const optimistic: Person = {
						id: input.id ?? crypto.randomUUID(),
						name,
						color: input.color ?? null,
					};
					return [...(current ?? []), optimistic].toSorted((left, right) =>
						left.name.localeCompare(right.name),
					);
				},
			},
		},
	);
}
