"use client";

import { useQueryClient } from "@tanstack/react-query";
import { trackProductEvent } from "@/core/analytics/client";
import { useApiMutation, useAuthedApiQuery } from "@/shared/api";
import {
	getNoteShare,
	publishNote,
	refreshNoteShareSnapshot,
	revokeNoteShare,
	updateNoteShareSettings,
} from "@/domain/sharing/actions";
import type {
	TNoteShareState,
	TPublishNoteInput,
	TUpdateShareInput,
} from "@/domain/sharing/models";
import { sharingKeys } from "../lib/sharing-keys";

/**
 * Owner-side sharing state + mutations for a single note. The share query
 * cache is updated directly from each mutation result so the share screen
 * reflects changes without a refetch round-trip.
 */
export function useNoteSharing(noteId: string | null | undefined) {
	const id = noteId ?? "";
	const queryClient = useQueryClient();
	const setShare = (state: TNoteShareState | null) =>
		queryClient.setQueryData(sharingKeys.share(id), state);

	const shareQuery = useAuthedApiQuery<TNoteShareState | null>(
		sharingKeys.share(id),
		() => getNoteShare(id),
		{ enabled: Boolean(id), staleTime: 5 * 60 * 1000 },
	);

	const publish = useApiMutation<TPublishNoteInput, TNoteShareState>(publishNote, {
		onSuccess: (state, input) => {
			setShare(state);
			trackProductEvent("share_created", {
				viewOnce: input.viewOnce,
				hasPassword: Boolean(input.password),
				hasExpiry: input.expiry.kind !== "never",
			});
		},
	});

	const update = useApiMutation<TUpdateShareInput, TNoteShareState | null>(
		updateNoteShareSettings,
		{ onSuccess: (state) => setShare(state) },
	);

	const refresh = useApiMutation<string, TNoteShareState | null>(refreshNoteShareSnapshot, {
		onSuccess: (state) => setShare(state),
	});

	const revoke = useApiMutation<string, { revoked: boolean }>(revokeNoteShare, {
		// Clear the link from the cache the instant the user clicks; the server
		// confirms async and onError rolls the snapshot back. No invalidate —
		// revoke is definitive, so a refetch would only re-render the same null.
		invalidateKeys: [],
		optimistic: {
			queryKey: (revokedNoteId) => sharingKeys.share(revokedNoteId),
			updater: () => null,
		},
		onSuccess: (result) => {
			if (!result.revoked) {
				return;
			}
			trackProductEvent("share_revoked");
		},
	});

	return { shareQuery, publish, update, refresh, revoke };
}
