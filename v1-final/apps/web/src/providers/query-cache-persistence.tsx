"use client";

import { useQueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";
import { useEffect } from "react";
import { useAuth } from "@/core/auth/use-auth";
import { getUserScopeIdForUser } from "@/core/auth";
import { isTauriRuntime } from "@/core/workspace-backend/tauri-backend";

// Bump when the cached query shapes change in a backward-incompatible way so
// stale snapshots from older deploys are dropped instead of hydrated.
// v2: persisted note bodies now carry collaborator `access`; drop v1 snapshots
// that lack it (a shared note hydrating with `access: undefined` would fail open).
const CACHE_VERSION = "v2";
const KEY_PREFIX = "skriuw-rq";
const MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days

function storageKey(scope: string): string {
	return `${KEY_PREFIX}:${CACHE_VERSION}:${scope}`;
}

/**
 * Local-first cache durability. Writes the React Query cache to IndexedDB and
 * restores it on load so a hard refresh repaints the workspace from disk with
 * no network round trip.
 *
 * Restore goes through React Query's `hydrate()`, which is `dataUpdatedAt`
 * aware — so the (potentially older) persisted snapshot never overwrites the
 * fresher data the server already streamed into the SSR HydrationBoundary.
 *
 * The storage key is scoped per user id, so two accounts on the same browser
 * never read each other's notes.
 */
export function QueryCachePersistence() {
	const queryClient = useQueryClient();
	const auth = useAuth();
	const scope = getUserScopeIdForUser(auth.user);

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (!auth.isReady) return;
		// Desktop reads from local SQLite/vault over IPC — already instant and
		// durable. A second IndexedDB copy is pure overhead: an extra restore at
		// boot plus a full note-body dehydrate every throttle window while typing.
		if (isTauriRuntime()) return;

		const key = storageKey(scope);
		const persister = createAsyncStoragePersister({
			storage: {
				getItem: (k) => get(k).then((v) => v ?? null),
				setItem: (k, v) => set(k, v),
				removeItem: (k) => del(k),
			},
			key,
			// Notes can hold large rich documents; throttle disk writes so rapid
			// edits don't thrash IndexedDB.
			throttleTime: 1000,
		});

		const [unsubscribe] = persistQueryClient({
			queryClient,
			persister,
			maxAge: MAX_AGE,
			buster: CACHE_VERSION,
			dehydrateOptions: {
				// Persist ONLY note bodies (`notesKeys.detail(id)` → ["notes","files",id]).
				//
				// Deliberately NOT the list/folders/graph queries: those are always
				// SSR-prefetched and hydrate instantly on load, so persisting them
				// buys nothing — but they're the ones churned by optimistic
				// create/delete/reorder. Writing an unconfirmed optimistic list to
				// disk risks restoring a ghost row on reload (clock skew can make the
				// stale snapshot look "newer" than the fresh SSR data to hydrate()).
				// A persisted orphan body, by contrast, is harmless: the SSR-fresh
				// list never references it, so it never renders.
				// Scope-suffixed LIST keys (["notes","files","local"] /
				// ["notes","files","user:<id>"]) share this exact shape with detail
				// keys, so they must be excluded by value or the guest/user files
				// list gets persisted as if it were a note body.
				shouldDehydrateQuery: (query) => {
					if (query.state.status !== "success") return false;
					const key = query.queryKey;
					return (
						Array.isArray(key) &&
						key.length === 3 &&
						key[0] === "notes" &&
						key[1] === "files" &&
						typeof key[2] === "string" &&
						key[2] !== "local" &&
						!key[2].startsWith("user:")
					);
				},
			},
		});

		return () => {
			unsubscribe();
		};
	}, [queryClient, auth.isReady, scope]);

	return null;
}
