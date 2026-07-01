"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/core/auth/use-auth";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import type {
	ChipRewriteResult,
	TaggedNoteSummary,
	TagSummary,
} from "@/core/workspace-backend/types";
import type { NotePropertyColor } from "@/domain/notes/properties";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { useApiMutation, useApiQuery } from "@/shared/api";
import { showUserToast } from "@/shared/lib/user-toast";
import { tagsKeys } from "../lib/tags-keys";

export function useTagsScope(): string {
	const auth = useAuth();
	return auth.phase === "authenticated" && auth.user ? `user:${auth.user.id}` : "local";
}

export function useWorkspaceTagSummaries() {
	const scope = useTagsScope();
	const backend = useWorkspaceBackend();
	const auth = useAuth();
	return useApiQuery<TagSummary[]>(tagsKeys.list(scope), () => backend.listTags(), {
		enabled: auth.isReady,
	});
}

export function useTagNotes(name: string) {
	const scope = useTagsScope();
	const backend = useWorkspaceBackend();
	const auth = useAuth();
	return useApiQuery<TaggedNoteSummary[]>(
		tagsKeys.notes(scope, name),
		() => backend.listTagNotes(name),
		{ enabled: auth.isReady && name.length > 0 },
	);
}

/** Invalidates every cache a tag/person content rewrite can touch. */
export function useChipRewriteInvalidation() {
	const queryClient = useQueryClient();
	return function invalidateAfterRewrite() {
		void queryClient.invalidateQueries({ queryKey: tagsKeys.all });
		void queryClient.invalidateQueries({ queryKey: notesKeys.all });
	};
}

export function useSetTagColor() {
	const scope = useTagsScope();
	const backend = useWorkspaceBackend();
	const listKey = tagsKeys.list(scope);

	return useApiMutation<{ name: string; color: NotePropertyColor | null }, void, TagSummary[]>(
		(input) => backend.setTagColor(input.name, input.color),
		{
			invalidateKeys: [listKey],
			onError: () => showUserToast("Couldn't update tag color", "error"),
			optimistic: {
				queryKey: listKey,
				updater: (current, input) =>
					(current ?? []).map((tag) =>
						tag.name === input.name ? { ...tag, color: input.color } : tag,
					),
			},
		},
	);
}

export function useRenameTag() {
	const backend = useWorkspaceBackend();
	const invalidate = useChipRewriteInvalidation();

	return useApiMutation<{ from: string; to: string }, ChipRewriteResult>(
		(input) => backend.renameTag(input.from, input.to),
		{
			invalidateKeys: [],
			onSuccess: (result, input) => {
				invalidate();
				showUserToast(
					`Renamed #${input.from} to #${input.to} in ${result.rewrittenNoteIds.length} ${
						result.rewrittenNoteIds.length === 1 ? "note" : "notes"
					}`,
					"success",
				);
			},
			onError: () => showUserToast("Couldn't rename tag", "error"),
		},
	);
}

export function useDeleteTag() {
	const backend = useWorkspaceBackend();
	const invalidate = useChipRewriteInvalidation();

	return useApiMutation<string, ChipRewriteResult>((name) => backend.deleteTag(name), {
		invalidateKeys: [],
		onSuccess: (result, name) => {
			invalidate();
			showUserToast(
				`Removed #${name} from ${result.rewrittenNoteIds.length} ${
					result.rewrittenNoteIds.length === 1 ? "note" : "notes"
				}`,
				"success",
			);
		},
		onError: () => showUserToast("Couldn't delete tag", "error"),
	});
}
