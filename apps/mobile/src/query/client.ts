// ---------------------------------------------------------------------------
// React Query client + offline READ-cache persister.
//
// Ports the exact ruleset from web (providers/query-cache-persistence.tsx):
//   - staleTime 60s, gcTime 24h
//   - persist note BODIES only (never lists), 7-day maxAge, per-user scope
// Result: previously opened notes are readable offline. Writes are disabled
// offline in the MVP (offline-first writes are V2/V3).
//
// Web uses IndexedDB; mobile uses AsyncStorage (swap to MMKV for speed later).
// ---------------------------------------------------------------------------

import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { isPersistableKey } from "@/query/notes-keys";

const SEVEN_DAYS = 1000 * 60 * 60 * 24 * 7;

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 60 * 1000, // 60s
			gcTime: 1000 * 60 * 60 * 24, // 24h
			retry: 2,
			refetchOnReconnect: true,
		},
	},
});

/** Per-user cache key so switching accounts never leaks notes. Call
 *  `setPersistUser(userId)` after sign-in before mounting the persist client. */
let currentUserId = "anon";
export function setPersistUser(userId: string | null | undefined) {
	currentUserId = userId ?? "anon";
}

export function createPersister() {
	return createAsyncStoragePersister({
		storage: AsyncStorage,
		key: `skriuw-rq-cache:${currentUserId}`,
		throttleTime: 1000,
	});
}

export const persistOptions = {
	maxAge: SEVEN_DAYS,
	dehydrateOptions: {
		// BODIES only — never persist list/search/folder queries.
		shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }) =>
			isPersistableKey(query.queryKey),
	},
};
