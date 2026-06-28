"use client";

import { useApiMutation, useApiQuery } from "@/shared/api";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import type { TrashBatch } from "@/core/workspace-backend/types";
import { showUserToast } from "@/shared/lib/user-toast";
import { notesKeys } from "./notes-keys";
import { useNotesCacheScope } from "./use-notes-cache-scope";

export function useTrash() {
	const backend = useWorkspaceBackend();
	const scope = useNotesCacheScope();
	return useApiQuery<TrashBatch[]>(
		notesKeys.trash(scope),
		() => backend.listTrash?.() ?? Promise.resolve([]),
		{ enabled: backend.capabilities.trash },
	);
}

function useTrashMutation(
	action: ((batchId: string) => Promise<void>) | undefined,
	failureMessage: string,
) {
	const scope = useNotesCacheScope();
	return useApiMutation<string, void, TrashBatch[]>(
		(batchId) => action?.(batchId) ?? Promise.resolve(),
		{
			invalidateKeys: [notesKeys.files(), notesKeys.folders(), notesKeys.trash()],
			onError: () => showUserToast(failureMessage, "error"),
			optimistic: {
				queryKey: notesKeys.trash(scope),
				updater: (current, batchId) =>
					(current ?? []).filter((batch) => batch.id !== batchId),
			},
		},
	);
}

export function useRestoreTrash() {
	const backend = useWorkspaceBackend();
	return useTrashMutation(backend.restoreTrash, "Couldn't restore from trash");
}

export function usePurgeTrash() {
	const backend = useWorkspaceBackend();
	return useTrashMutation(backend.purgeTrash, "Couldn't delete permanently");
}

export function useEmptyTrash() {
	const backend = useWorkspaceBackend();
	const scope = useNotesCacheScope();
	return useApiMutation<void, void, TrashBatch[]>(
		() => backend.emptyTrash?.() ?? Promise.resolve(),
		{
			invalidateKeys: [notesKeys.files(), notesKeys.folders(), notesKeys.trash()],
			onError: () => showUserToast("Couldn't empty trash", "error"),
			optimistic: {
				queryKey: notesKeys.trash(scope),
				updater: () => [],
			},
		},
	);
}
