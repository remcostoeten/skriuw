"use client";

import { useAuth } from "@/core/auth/use-auth";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import type { Person } from "@/domain/people/models";
import { useApiQuery } from "@/shared/api";
import { peopleKeys } from "../lib/people-keys";
import { usePeopleScope } from "./use-people-scope";

export function useWorkspacePeople() {
	const scope = usePeopleScope();
	const backend = useWorkspaceBackend();
	const auth = useAuth();
	return useApiQuery<Person[]>(peopleKeys.list(scope), () => backend.listPeople(), {
		enabled: auth.isReady,
		staleTime: Infinity,
	});
}
