"use client";

import { useApiQuery, useApiMutation } from "@/shared/api";
import { listRecents, trackRecent, clearRecents } from "@/domain/recents/api";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import type { RecentItem, RecentItemType } from "@/domain/recents/types";

export const recentsKeys = {
	all: ["recents"] as const,
	list: () => [...recentsKeys.all, "list"] as const,
};

export function useRecents() {
	const auth = useAuthSnapshot();

	return useApiQuery<RecentItem[]>(recentsKeys.list(), () => listRecents(), {
		enabled: auth.isReady && auth.phase === "authenticated",
	});
}

export function useTrackRecent() {
	return useApiMutation<{ itemId: string; itemType: RecentItemType }, void, RecentItem[]>(
		({ itemId, itemType }) => trackRecent(itemId, itemType),
		{
			optimistic: {
				queryKey: recentsKeys.list(),
				updater: (current, { itemId, itemType }) => {
					const filtered = (current ?? []).filter((r) => r.itemId !== itemId);
					return [
						{ id: itemId, itemId, itemType, accessedAt: new Date() },
						...filtered,
					].slice(0, 10);
				},
			},
		},
	);
}

export function useClearRecents() {
	return useApiMutation<void, void, RecentItem[]>(() => clearRecents(), {
		optimistic: {
			queryKey: recentsKeys.list(),
			updater: () => [],
		},
	});
}
